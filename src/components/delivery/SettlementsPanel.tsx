// Cafe admin settlements panel: per-driver pending amounts + settle button.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bike, Wallet, CheckCircle2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Row {
  driver_id: string; driver_name: string; driver_phone: string | null; driver_photo: string | null;
  pending_count: number; pending_owed_to_cafe: number; pending_owed_to_driver: number;
  paid_count: number; last_settled_at: string | null;
}

export function SettlementsPanel() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc("get_cafe_driver_settlements");
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as unknown as Row[]);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("cafe-settlements")
      .on("postgres_changes", { event: "*", schema: "public", table: "driver_wallet_entries" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const settle = async (driverId: string) => {
    setBusy(driverId);
    try {
      console.info("[settlements] calling settle_driver_wallet", { driverId });
      const { data, error } = await supabase.rpc("settle_driver_wallet", { _driver_id: driverId });
      if (error) throw error;

      const settledCount = Number(data ?? 0);
      console.info("[settlements] settle_driver_wallet succeeded", { driverId, settledCount });
      toast.success("تمت التسوية بنجاح");
      await load();
    } catch (error) {
      console.error("[settlements] settle_driver_wallet failed", error);
      toast.error(error instanceof Error ? error.message : "فشلت التسوية");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="h-5 w-5 text-accent" />
        <h2 className="font-semibold">{t("settlements.title")}</h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("settlements.empty")}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.driver_id} className="border rounded-md p-2 flex items-center gap-2">
              {r.driver_photo
                ? <img src={r.driver_photo} alt="" className="h-10 w-10 rounded-full object-cover" />
                : <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center"><Bike className="h-4 w-4" /></div>}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.driver_name}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{t("settlements.pending_count")}: <b>{r.pending_count}</b></span>
                  <span>{t("settlements.owed_cafe")}: <b className="text-destructive">{Number(r.pending_owed_to_cafe).toFixed(2)}</b></span>
                  {r.paid_count > 0 && <Badge variant="outline" className="text-[10px] gap-0.5"><CheckCircle2 className="h-3 w-3" />{r.paid_count}</Badge>}
                </div>
                {r.last_settled_at && (
                  <div className="text-[10px] text-muted-foreground">{t("settlements.last_settled")}: {new Date(r.last_settled_at).toLocaleString()}</div>
                )}
              </div>
              <Button
                size="sm"
                disabled={r.pending_count === 0 || busy === r.driver_id}
                onClick={() => settle(r.driver_id)}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                {busy === r.driver_id ? t("common.loading") : t("settlements.settle")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
