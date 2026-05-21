// Daily sales-by-price-tier report. Calls cafe_sales_by_tier_daily RPC and shows
// totals per day + tier with an overall pivot.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { Tags } from "lucide-react";

interface Row {
  day: string;
  tier_id: string | null;
  tier_name: string;
  orders_count: number;
  total: number;
}

export function SalesByTierReport() {
  const { t } = useI18n();
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.rpc("cafe_sales_by_tier_daily", { _days: days }).then(({ data }) => {
      if (cancelled) return;
      setRows(((data ?? []) as Row[]).map((r) => ({ ...r, total: Number(r.total), orders_count: Number(r.orders_count) })));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [days]);

  const tiers = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.tier_id ?? "__none__", r.tier_name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const totalsByTier = useMemo(() => {
    const m = new Map<string, { name: string; total: number; orders: number }>();
    rows.forEach((r) => {
      const k = r.tier_id ?? "__none__";
      const cur = m.get(k) ?? { name: r.tier_name, total: 0, orders: 0 };
      cur.total += r.total;
      cur.orders += r.orders_count;
      m.set(k, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  const days_sorted = useMemo(() => Array.from(new Set(rows.map((r) => r.day))).sort((a, b) => b.localeCompare(a)), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tags className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-semibold flex-1">{t("reports.sales_by_tier")}</h2>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t("owner.reports.period.7")}</SelectItem>
            <SelectItem value="30">{t("owner.reports.period.30")}</SelectItem>
            <SelectItem value="90">{t("owner.reports.period.90")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Totals per tier */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {totalsByTier.length === 0 ? (
          <Card className="p-4 col-span-full text-sm text-muted-foreground">{loading ? t("common.loading") : t("reports.no_data")}</Card>
        ) : totalsByTier.map((t2) => (
          <Card key={t2.name} className="p-4">
            <div className="text-xs text-muted-foreground">{t2.name}</div>
            <div className="text-2xl font-bold mt-1">{t2.total.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">{t2.orders} {t("reports.orders")}</div>
          </Card>
        ))}
      </div>

      {/* Daily breakdown */}
      {days_sorted.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-start">{t("reports.day")}</th>
                {tiers.map((tt) => (
                  <th key={tt.id} className="p-3 text-start">{tt.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days_sorted.map((d) => (
                <tr key={d} className="border-t border-border">
                  <td className="p-3 font-mono text-xs">{d}</td>
                  {tiers.map((tt) => {
                    const r = rows.find((x) => x.day === d && (x.tier_id ?? "__none__") === tt.id);
                    return (
                      <td key={tt.id} className="p-3">
                        {r ? (
                          <div>
                            <div className="font-semibold">{r.total.toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">{r.orders_count} {t("reports.orders")}</div>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
