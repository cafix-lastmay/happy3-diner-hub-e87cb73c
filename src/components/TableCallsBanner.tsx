// Persistent, DB-backed table service calls banner for staff/manager/cafeteria_admin.
// Fetches active calls visible to the caller (via RLS), subscribes to realtime,
// and shows a sticky red/orange card that stays until dismissed with "Done".
import { useCallback, useEffect, useState } from "react";
import { Bell, UtensilsCrossed, Sparkles, ShieldCheck, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

type Kind = "waiter" | "cleaner" | "manager";
interface Call {
  id: string;
  cafeteria_ref_code: string;
  table_label: string | null;
  kind: Kind;
  created_at: string;
}

export function TableCallsBanner() {
  const { t } = useI18n();
  const { user, roles } = useAuth();
  const [calls, setCalls] = useState<Call[]>([]);
  const [resolving, setResolving] = useState<Record<string, boolean>>({});

  const canSee =
    roles.includes("waiter") ||
    roles.includes("manager") ||
    roles.includes("cafeteria_admin");

  const load = useCallback(async () => {
    if (!canSee) return;
    const { data, error } = await supabase.rpc("list_active_table_calls");
    if (!error && data) setCalls(data as Call[]);
  }, [canSee]);

  useEffect(() => {
    if (!user || !canSee) return;
    load();
    const ch = supabase
      .channel(`tcr-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "table_call_requests" },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, canSee, load]);

  const resolve = async (id: string) => {
    setResolving((r) => ({ ...r, [id]: true }));
    const { error } = await supabase.rpc("resolve_table_call", { _id: id });
    if (error) toast.error(error.message);
    else setCalls((prev) => prev.filter((c) => c.id !== id));
    setResolving((r) => ({ ...r, [id]: false }));
  };

  if (!canSee || calls.length === 0) return null;

  return (
    <div className="sticky top-0 lg:top-16 z-20 px-4 md:px-6 lg:px-8 pt-2">
      <Card className="p-3 mb-4 border-red-500/70 bg-red-500/10 dark:bg-red-500/15 animate-pulse-slow">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="h-4 w-4 text-red-600 animate-pulse" />
          <span className="font-bold text-sm">{t("calls.incoming")}</span>
          <Badge variant="destructive" className="text-[10px]">{calls.length}</Badge>
        </div>
        <div className="space-y-2">
          {calls.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-md bg-background/80 p-2 border border-red-500/30">
              <KindIcon kind={c.kind} />
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-semibold truncate">{kindLabel(t, c.kind)}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {c.table_label ? `${t("orders.table")}: ${c.table_label} · ` : ""}
                  {new Date(c.created_at).toLocaleTimeString()}
                </div>
              </div>
              <Button
                size="sm"
                variant="default"
                className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!!resolving[c.id]}
                onClick={() => resolve(c.id)}
              >
                <Check className="h-3 w-3 me-1" /> {t("calls.done")}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function kindLabel(t: (k: string) => string, kind: Kind) {
  if (kind === "waiter") return t("calls.kind.waiter");
  if (kind === "cleaner") return t("calls.kind.cleaner");
  return t("calls.kind.manager");
}

function KindIcon({ kind }: { kind: Kind }) {
  if (kind === "waiter") return <UtensilsCrossed className="h-4 w-4 text-red-600" />;
  if (kind === "cleaner") return <Sparkles className="h-4 w-4 text-red-600" />;
  return <ShieldCheck className="h-4 w-4 text-red-600" />;
}
