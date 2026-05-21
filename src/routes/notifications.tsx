import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Trash2, ArrowLeft, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { BottomNav } from "@/components/layouts/BottomNav";
import { MobileHeader } from "@/components/layouts/MobileHeader";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-center text-destructive">{error.message}</div>
  ),
});

interface N {
  id: string; kind: string; title: string; body: string | null;
  data: Record<string, any>; read_at: string | null; created_at: string;
}

function NotificationsPage() {
  const { user, loading, roles } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<N[]>([]);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.navigate({ to: "/login" }); return; }
    supabase.from("notifications").select("*")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setItems((data ?? []) as N[]));

    const ch = supabase.channel(`nlist-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          supabase.from("notifications").select("*")
            .eq("user_id", user.id).order("created_at", { ascending: false }).limit(100)
            .then(({ data }) => setItems((data ?? []) as N[]));
        }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loading, router]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };
  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
  };
  const clearAll = async () => {
    if (!user) return;
    await supabase.from("notifications").delete().eq("user_id", user.id);
  };

  return (
    <div className="min-h-screen bg-background pb-safe">
      <MobileHeader title={t("notifications.title")} />
      <header className="hidden md:block sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.history.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Bell className="h-5 w-5" />
            <h1 className="text-lg font-bold">{t("notifications.title")}</h1>
          </div>
          <div className="flex gap-1">
            <Link to="/settings/notifications">
              <Button variant="ghost" size="icon"><Settings className="h-5 w-5" /></Button>
            </Link>
            {items.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                {t("notifications.clear_all")}
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-2xl px-4 py-4 pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-4">
        {items.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Bell className="mx-auto mb-3 h-12 w-12 opacity-30" />
            <p>{t("notifications.empty")}</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {items.map((n) => {
              const route = (n.data?.route as string) ?? null;
              const inner = (
                <Card className={`p-3 ${!n.read_at ? "border-primary/40 bg-accent/10" : ""}`}>
                  <div className="flex items-start gap-3">
                    {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(n.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              );
              return route ? (
                <Link key={n.id} to={route as any} onClick={() => !n.read_at && markRead(n.id)}>
                  {inner}
                </Link>
              ) : (
                <div key={n.id} onClick={() => !n.read_at && markRead(n.id)}>{inner}</div>
              );
            })}
          </div>
        )}
      </main>
      <BottomNav role={(roles[0] as any) ?? null} />
    </div>
  );
}
