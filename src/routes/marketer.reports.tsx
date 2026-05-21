// Marketer reports: aggregated commissions per child + cafeteria performance.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Network, Percent, Banknote, BarChart3, Download } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/marketer/reports")({ component: MarketerReports });

interface Tx { source_cafeteria_ref_code: string; amount_usd: number; status: string; level_distance: number; created_at: string }
interface Row { ref: string; total: number; released: number; frozen: number; count: number; lastAt: string | null }

function MarketerReports() {
  const { t } = useI18n();
  const { ready } = useRequireRole("marketer");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const { data } = await supabase
        .from("commission_transactions")
        .select("source_cafeteria_ref_code,amount_usd,status,level_distance,created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      const txs = (data ?? []) as Tx[];
      const map = new Map<string, Row>();
      for (const tx of txs) {
        const r = map.get(tx.source_cafeteria_ref_code) ?? { ref: tx.source_cafeteria_ref_code, total: 0, released: 0, frozen: 0, count: 0, lastAt: null };
        r.total += Number(tx.amount_usd);
        if (tx.status === "released") r.released += Number(tx.amount_usd);
        else r.frozen += Number(tx.amount_usd);
        r.count += 1;
        if (!r.lastAt || tx.created_at > r.lastAt) r.lastAt = tx.created_at;
        map.set(tx.source_cafeteria_ref_code, r);
      }
      setRows(Array.from(map.values()).sort((a, b) => b.total - a.total));
      setLoading(false);
    })();
  }, [ready]);

  const totals = useMemo(() => ({
    total: rows.reduce((s, r) => s + r.total, 0),
    released: rows.reduce((s, r) => s + r.released, 0),
    frozen: rows.reduce((s, r) => s + r.frozen, 0),
  }), [rows]);

  const exportCsv = () => {
    const header = ["cafeteria_ref", "total_usd", "released_usd", "frozen_usd", "transactions", "last_at"];
    const lines = [header.join(",")].concat(
      rows.map((r) => [r.ref, r.total.toFixed(2), r.released.toFixed(2), r.frozen.toFixed(2), r.count, r.lastAt ?? ""].join(","))
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `marketer-report-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!ready) return null;
  const navItems = [
    { to: "/marketer", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/marketer", label: t("marketer.nav.network"), icon: Network },
    { to: "/marketer/commissions", label: t("marketer.nav.commissions"), icon: Percent },
    { to: "/marketer/withdrawals", label: t("marketer.nav.withdrawals"), icon: Banknote },
    { to: "/marketer/reports", label: t("marketer.nav.reports") || "التقارير", icon: BarChart3 },
  ];

  return (
    <DashboardShell title={t("marketer.dashboard.title")} navItems={navItems}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("marketer.reports.title") || "تقارير المقارنة"}</h1>
        <Button onClick={exportCsv} variant="outline" size="sm" className="gap-2"><Download className="h-4 w-4" /> CSV</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card className="p-4"><div className="text-sm text-muted-foreground">{t("marketer.reports.total") || "إجمالي العمولات"}</div><div className="text-2xl font-bold text-accent mt-1">${totals.total.toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">{t("marketer.balance.available") || "محرّر"}</div><div className="text-2xl font-bold mt-1">${totals.released.toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">{t("marketer.balance.frozen") || "مجمّد"}</div><div className="text-2xl font-bold text-muted-foreground mt-1">${totals.frozen.toFixed(2)}</div></Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">{t("common.ref_code")}</th>
              <th className="p-3 text-start">{t("marketer.reports.total") || "الإجمالي"}</th>
              <th className="p-3 text-start">{t("marketer.balance.available") || "محرّر"}</th>
              <th className="p-3 text-start">{t("marketer.balance.frozen") || "مجمّد"}</th>
              <th className="p-3 text-start">{t("marketer.reports.txs") || "عدد العمولات"}</th>
              <th className="p-3 text-start">{t("common.date")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{t("common.loading")}</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">—</td></tr>}
            {rows.map((r) => (
              <tr key={r.ref} className="border-t border-border">
                <td className="p-3 font-mono">{r.ref}</td>
                <td className="p-3 font-semibold">${r.total.toFixed(2)}</td>
                <td className="p-3">${r.released.toFixed(2)}</td>
                <td className="p-3 text-muted-foreground">${r.frozen.toFixed(2)}</td>
                <td className="p-3"><Badge variant="secondary">{r.count}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground">{r.lastAt ? new Date(r.lastAt).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
