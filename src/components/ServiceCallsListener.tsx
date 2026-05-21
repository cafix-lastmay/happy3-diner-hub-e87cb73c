// Listens for service calls (waiter/cleaner/manager) broadcast on a per-cafeteria
// realtime channel. Calls are NOT persisted — they live only while the recipient
// is online. Each call has a stable id so dismissing one removes it for the user.
import { useEffect, useState, useCallback } from "react";
import { Bell, X, UtensilsCrossed, Sparkles, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ServiceCallKind = "waiter" | "cleaner" | "manager";
export interface ServiceCall {
  id: string;
  kind: ServiceCallKind;
  table_label: string | null;
  from: string; // free text (e.g. "Customer", staff role)
  ts: number;
}

export function serviceCallsChannelName(cafeteriaRefCode: string) {
  return `service-calls-${cafeteriaRefCode}`;
}

/** Send a service call to all listeners of a cafeteria channel. */
export async function sendServiceCall(
  cafeteriaRefCode: string,
  payload: Omit<ServiceCall, "id" | "ts"> & { id?: string },
) {
  const ch = supabase.channel(serviceCallsChannelName(cafeteriaRefCode));
  await new Promise<void>((resolve) => {
    ch.subscribe((status) => { if (status === "SUBSCRIBED") resolve(); });
  });
  const call: ServiceCall = {
    id: payload.id ?? crypto.randomUUID(),
    kind: payload.kind,
    table_label: payload.table_label ?? null,
    from: payload.from,
    ts: Date.now(),
  };
  await ch.send({ type: "broadcast", event: "call", payload: call });
  // give the broadcast a tick before we tear down
  setTimeout(() => { supabase.removeChannel(ch); }, 500);
  return call;
}

/**
 * Banner showing live service calls on a cafeteria channel.
 * Filter by kind to only show calls relevant to this role.
 */
export function ServiceCallsBanner({
  cafeteriaRefCode,
  acceptKinds,
}: {
  cafeteriaRefCode: string;
  acceptKinds: ServiceCallKind[];
}) {
  const { t } = useI18n();
  const [calls, setCalls] = useState<ServiceCall[]>([]);

  useEffect(() => {
    if (!cafeteriaRefCode) return;
    const ch = supabase
      .channel(serviceCallsChannelName(cafeteriaRefCode))
      .on("broadcast", { event: "call" }, ({ payload }) => {
        const c = payload as ServiceCall;
        if (!acceptKinds.includes(c.kind)) return;
        setCalls((prev) => (prev.some((x) => x.id === c.id) ? prev : [c, ...prev]));
        toast.info(`${kindLabel(t, c.kind)}${c.table_label ? ` · ${c.table_label}` : ""}`);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cafeteriaRefCode, acceptKinds, t]);

  const dismiss = useCallback((id: string) => {
    setCalls((prev) => prev.filter((c) => c.id !== id));
  }, []);

  if (calls.length === 0) return null;

  return (
    <Card className="p-3 mb-4 border-amber-500/60 bg-amber-500/10">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="h-4 w-4 text-amber-600 animate-pulse" />
        <span className="font-bold text-sm">{t("calls.incoming")}</span>
        <Badge variant="secondary" className="text-[10px]">{calls.length}</Badge>
      </div>
      <div className="space-y-2">
        {calls.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-md bg-background/70 p-2">
            <KindIcon kind={c.kind} />
            <div className="flex-1 min-w-0 text-sm">
              <div className="font-semibold truncate">{kindLabel(t, c.kind)}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {c.table_label ? `${t("orders.table")}: ${c.table_label} · ` : ""}{c.from} · {new Date(c.ts).toLocaleTimeString()}
              </div>
            </div>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => dismiss(c.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function kindLabel(t: (k: string) => string, kind: ServiceCallKind) {
  if (kind === "waiter") return t("calls.kind.waiter");
  if (kind === "cleaner") return t("calls.kind.cleaner");
  return t("calls.kind.manager");
}

function KindIcon({ kind }: { kind: ServiceCallKind }) {
  if (kind === "waiter") return <UtensilsCrossed className="h-4 w-4 text-amber-600" />;
  if (kind === "cleaner") return <Sparkles className="h-4 w-4 text-amber-600" />;
  return <ShieldCheck className="h-4 w-4 text-amber-600" />;
}
