// Driver wallet view: list of completed delivery wallet entries grouped by cafeteria,
// with totals on top. Polls every 15s + realtime on driver_wallet_entries.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wallet, Store } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";

interface Entry {
  id: string; order_id: string; short_code: string;
  cafeteria_ref_code: string; cafeteria_name: string | null;
  collected_from_customer: number; delivery_fee_earned: number;
  owed_to_cafeteria: number; owed_to_driver: number;
  settlement_status: "pending" | "paid"; settled_at: string | null; created_at: string;
}

export function DriverWallet() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Entry[]>([]);

  const load = async () => {
    const { data } = await supabase.rpc("get_my_driver_wallet");
    setRows((data ?? []) as unknown as Entry[]);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("driver-wallet")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_wallet_entries" }, () => load())
      .subscribe();
    const id = setInterval(load, 15000);
    return () => { supabase.removeChannel(ch); clearInterval(id); };
  }, []);

  const totals = useMemo(() => rows.reduce((a, r) => ({
    collected: a.collected + Number(r.collected_from_customer),
    fees: a.fees + Number(r.delivery_fee_earned),
    owed: a.owed + (r.settlement_status === "pending" ? Number(r.owed_to_cafeteria) : 0),
  }), { collected: 0, fees: 0, owed: 0 }), [rows]);

  const grouped = useMemo(() => {
    const m = new Map<string, { name: string; rows: Entry[] }>();
    rows.forEach((r) => {
      const k = r.cafeteria_ref_code;
      if (!m.has(k)) m.set(k, { name: r.cafeteria_name ?? r.cafeteria_ref_code, rows: [] });
      m.get(k)!.rows.push(r);
    });
    return Array.from(m.entries());
  }, [rows]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-accent" />
        <h2 className="font-semibold">{t("wallet.title")}</h2>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("wallet.total_collected")} value={totals.collected} />
        <Stat label={t("wallet.total_fees")} value={totals.fees} accent />
        <Stat label={t("wallet.total_owed")} value={totals.owed} danger />
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">{t("wallet.empty")}</p>
      )}

      {grouped.map(([code, g]) => (
        <div key={code} className="space-y-2">
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Store className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{g.name}</h3>
            <Badge variant="outline" className="text-[10px]">{g.rows.length}</Badge>
          </div>
          {g.rows.map((r) => (
            <div key={r.id} className="border rounded-md p-2 text-xs space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-mono text-muted-foreground" dir="ltr">#{r.short_code}</span>
                {r.settlement_status === "paid"
                  ? <Badge className="bg-accent text-accent-foreground">{t("wallet.paid")}</Badge>
                  : <Badge variant="secondary">{t("wallet.pending")}</Badge>}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">{t("wallet.collected")}</span>
                <span className="text-end">{Number(r.collected_from_customer).toFixed(2)}</span>
                <span className="text-muted-foreground">{t("wallet.fee_earned")}</span>
                <span className="text-end text-accent font-semibold">{Number(r.delivery_fee_earned).toFixed(2)}</span>
                <span className="text-muted-foreground">{t("wallet.owed_to_cafe")}</span>
                <span className="text-end font-semibold">{Number(r.owed_to_cafeteria).toFixed(2)}</span>
              </div>
              {r.settled_at && (
                <p className="text-[10px] text-muted-foreground">{t("wallet.settled_on")}: {new Date(r.settled_at).toLocaleString()}</p>
              )}
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}

function Stat({ label, value, accent, danger }: { label: string; value: number; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`rounded-md p-2 border text-center ${accent ? "bg-accent/10 border-accent/30" : danger ? "bg-destructive/10 border-destructive/30" : "bg-muted"}`}>
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className={`text-base font-bold ${accent ? "text-accent" : danger ? "text-destructive" : ""}`}>{value.toFixed(2)}</div>
    </div>
  );
}
