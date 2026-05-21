// Bell icon with unread count badge + dropdown of recent notifications.
// Subscribes to realtime so the count updates instantly.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";

interface Notif {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<Notif[]>([]);
  const unread = items.filter((n) => !n.read_at).length;

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from("notifications").select("*")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
      if (!cancelled && data) setItems(data as Notif[]);
    };
    load();

    const channelId = `notifs-${userId}-${crypto.randomUUID()}`;
    const ch = supabase
      .channel(channelId)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (p) => setItems((prev) => [p.new as Notif, ...prev].slice(0, 20)),
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (p) => setItems((prev) => prev.map((n) => (n.id === (p.new as Notif).id ? (p.new as Notif) : n))),
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [user?.id]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id).is("read_at", null);
  };

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("notifications.title")}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 min-w-[20px] rounded-full px-1 text-[10px]">
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-bold">{t("notifications.title")}</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={markAllRead}>
              <Check className="h-3 w-3" /> {t("notifications.mark_all_read")}
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("notifications.empty")}
            </div>
          ) : (
            items.map((n) => {
              const route = (n.data?.route as string) ?? "/notifications";
              return (
                <Link
                  key={n.id}
                  to={route as any}
                  onClick={async () => {
                    if (!n.read_at) {
                      await supabase.from("notifications")
                        .update({ read_at: new Date().toISOString() }).eq("id", n.id);
                    }
                  }}
                  className={`block border-b px-3 py-2 hover:bg-accent/50 ${!n.read_at ? "bg-accent/20" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{n.title}</p>
                      {n.body && <p className="truncate text-xs text-muted-foreground">{n.body}</p>}
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
        <div className="border-t p-2">
          <Link to="/notifications" className="block text-center text-xs text-primary hover:underline">
            {t("notifications.view_all")}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
