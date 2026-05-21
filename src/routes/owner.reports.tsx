// Owner reports: financial overview, top performers, charts, CSV export.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/owner/reports")({ component: OwnerReports });

interface TopCafe { ref_code: string; name: string; total_recharged: number; recharge_count: number; points_balance: number }
interface TopMar { ref_code: string; name: string; level: number; total_commission: number; available_balance: number; cafeterias_count: number }

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function OwnerReports() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [days, setDays] = useState(30);
  const [topC, setTopC] = useState<TopCafe[]>([]);
  const [topM, setTopM] = useState<TopMar[]>([]);
  const [series, setSeries] = useState<{ day: string; total: number; count: number }[]>([]);
  const [signups, setSignups] = useState<{ day: string; marketers: number; cafeterias: number }[]>([]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const [{ data: tc }, { data: tm }, { data: ts }, { data: su }] = await Promise.all([
        supabase.rpc("owner_top_cafeterias", { _days: days, _limit: 10 }),
        supabase.rpc("owner_top_marketers", { _days: days, _limit: 10 }),
        supabase.rpc("owner_recharges_timeseries", { _days: days }),
        supabase.rpc("owner_signups_timeseries", { _days: days }),
      ]);
      setTopC((tc ?? []) as TopCafe[]);
      setTopM((tm ?? []) as TopMar[]);
      setSeries(((ts ?? []) as { day: string; total_usd: number; count: number }[]).map((x) => ({ day: x.day.slice(5), total: Number(x.total_usd), count: Number(x.count) })));
      setSignups(((su ?? []) as { day: string; marketers: number; cafeterias: number }[]).map((x) => ({ day: x.day.slice(5), marketers: Number(x.marketers), cafeterias: Number(x.cafeterias) })));
    })();
  }, [ready, days]);

  if (!ready) return null;

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">{t("owner.reports.title")}</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("owner.reports.period")}:</span>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t("owner.reports.period.7")}</SelectItem>
              <SelectItem value="30">{t("owner.reports.period.30")}</SelectItem>
              <SelectItem value="90">{t("owner.reports.period.90")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">{t("owner.reports.timeseries")}</h2>
          </div>
          {series.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--accent))" strokeWidth={2} name="USD" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{t("owner.reports.signups")}</h2>
          {signups.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={signups}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                <Bar dataKey="marketers" fill="hsl(var(--accent))" />
                <Bar dataKey="cafeterias" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card className="overflow-x-auto mb-6">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-semibold">{t("owner.reports.top_cafeterias")}</h2>
          <Button size="sm" variant="outline" onClick={() => downloadCsv(`top_cafeterias_${days}d.csv`, topC as unknown as Record<string, unknown>[])} className="gap-2"><Download className="h-4 w-4" /> {t("owner.reports.export_csv")}</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr>
            <th className="p-3 text-start">{t("common.ref_code")}</th>
            <th className="p-3 text-start">{t("common.name")}</th>
            <th className="p-3 text-start">Recharged</th>
            <th className="p-3 text-start">Count</th>
            <th className="p-3 text-start">Points</th>
          </tr></thead>
          <tbody>
            {topC.map((r) => (
              <tr key={r.ref_code} className="border-t border-border">
                <td className="p-3 font-mono"><Link to="/owner/cafeterias/$ref" params={{ ref: r.ref_code }} className="text-accent hover:underline">{r.ref_code}</Link></td>
                <td className="p-3">{r.name}</td>
                <td className="p-3 font-semibold">${Number(r.total_recharged).toFixed(2)}</td>
                <td className="p-3">{r.recharge_count}</td>
                <td className="p-3">{Number(r.points_balance).toFixed(2)}</td>
              </tr>
            ))}
            {topC.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-semibold">{t("owner.reports.top_marketers")}</h2>
          <Button size="sm" variant="outline" onClick={() => downloadCsv(`top_marketers_${days}d.csv`, topM as unknown as Record<string, unknown>[])} className="gap-2"><Download className="h-4 w-4" /> {t("owner.reports.export_csv")}</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr>
            <th className="p-3 text-start">{t("common.ref_code")}</th>
            <th className="p-3 text-start">{t("common.name")}</th>
            <th className="p-3 text-start">Level</th>
            <th className="p-3 text-start">Commission</th>
            <th className="p-3 text-start">Available</th>
            <th className="p-3 text-start">Cafés</th>
          </tr></thead>
          <tbody>
            {topM.map((r) => (
              <tr key={r.ref_code} className="border-t border-border">
                <td className="p-3 font-mono"><Link to="/owner/marketers/$ref" params={{ ref: r.ref_code }} className="text-accent hover:underline">{r.ref_code}</Link></td>
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.level}</td>
                <td className="p-3 font-semibold">${Number(r.total_commission).toFixed(2)}</td>
                <td className="p-3">${Number(r.available_balance).toFixed(2)}</td>
                <td className="p-3">{r.cafeterias_count}</td>
              </tr>
            ))}
            {topM.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
