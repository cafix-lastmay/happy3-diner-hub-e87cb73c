// Owner overview: KPI cards + recent recharges + signups timeseries.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Users, Coffee, Wallet, Percent, Banknote, TrendingUp, Coins, ShoppingCart, Clock } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/owner/")({ component: OwnerOverview });

interface Stats {
  marketers_total: number; marketers_active: number;
  cafeterias_total: number; cafeterias_active: number;
  recharges_pending: number; recharges_approved_total_usd: number; recharges_pending_total_usd: number;
  commissions_paid_usd: number; commissions_frozen_usd: number;
  withdrawals_pending: number; withdrawals_paid_usd: number;
  cafeteria_points_total: number;
  orders_total: number; orders_total_value: number;
}

function OwnerOverview() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [stats, setStats] = useState<Stats | null>(null);
  const [series, setSeries] = useState<{ day: string; total: number }[]>([]);
  const [recent, setRecent] = useState<{ id: string; cafeteria_ref_code: string; amount_usd: number; status: string; created_at: string }[]>([]);
  const [graceRows, setGraceRows] = useState<{ ref_code: string; name: string; points_balance: number; seconds_remaining: number; is_blocked: boolean }[]>([]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const [{ data: s }, { data: ts }, { data: rr }, { data: gr }] = await Promise.all([
        supabase.rpc("owner_get_stats"),
        supabase.rpc("owner_recharges_timeseries", { _days: 30 }),
        supabase.from("recharge_requests").select("id, cafeteria_ref_code, amount_usd, status, created_at").order("created_at", { ascending: false }).limit(8),
        supabase.rpc("owner_grace_cafeterias"),
      ]);
      if (s) setStats(s as unknown as Stats);
      if (ts) setSeries((ts as { day: string; total_usd: number }[]).map((x) => ({ day: x.day.slice(5), total: Number(x.total_usd) })));
      if (rr) setRecent(rr);
      if (gr) setGraceRows(gr as typeof graceRows);
    })();
  }, [ready]);

  if (!ready) return null;
  const navItems = ownerNavItems(t);

  const fmt = (n: number | undefined) => `$${Number(n ?? 0).toFixed(2)}`;
  const cards = [
    { label: t("owner.stats.marketers"), value: `${stats?.marketers_active ?? 0} / ${stats?.marketers_total ?? 0}`, link: "/owner/marketers" as const, icon: Users, color: "text-primary" },
    { label: t("owner.stats.cafeterias"), value: `${stats?.cafeterias_active ?? 0} / ${stats?.cafeterias_total ?? 0}`, link: "/owner/cafeterias" as const, icon: Coffee, color: "text-foreground" },
    { label: t("owner.stats.pending_recharges"), value: stats?.recharges_pending ?? 0, link: "/owner/recharges" as const, icon: Clock, color: "text-primary" },
    { label: t("owner.stats.total_recharged"), value: fmt(stats?.recharges_approved_total_usd), link: "/owner/recharges" as const, icon: TrendingUp, color: "text-foreground" },
    { label: t("owner.stats.commissions_paid"), value: fmt(stats?.commissions_paid_usd), link: "/owner/commissions" as const, icon: Percent, color: "text-primary" },
    { label: t("owner.stats.commissions_frozen"), value: fmt(stats?.commissions_frozen_usd), link: "/owner/commissions" as const, icon: Coins, color: "text-foreground" },
    { label: t("owner.stats.withdrawals_pending"), value: stats?.withdrawals_pending ?? 0, link: "/owner/withdrawals" as const, icon: Wallet, color: "text-primary" },
    { label: t("owner.stats.withdrawals_paid"), value: fmt(stats?.withdrawals_paid_usd), link: "/owner/withdrawals" as const, icon: Banknote, color: "text-foreground" },
    { label: t("owner.stats.cafeteria_points"), value: Number(stats?.cafeteria_points_total ?? 0).toFixed(0), link: "/owner/cafeterias" as const, icon: Coins, color: "text-primary" },
    { label: t("owner.stats.orders_total"), value: stats?.orders_total ?? 0, link: "/owner" as const, icon: ShoppingCart, color: "text-foreground" },
  ];

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-6">{t("owner.nav.overview")}</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        {cards.map((c) => (
          <Link key={c.label} to={c.link}>
            <Card className="p-4 transition-all hover:border-accent hover:shadow-md h-full">
              <div className="flex items-center justify-between mb-2">
                <c.icon className={`h-5 w-5 ${c.color}`} />
              </div>
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className="mt-1 text-xl font-bold">{c.value}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{t("owner.reports.timeseries")} (30d)</h2>
          {series.length === 0 ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Line type="monotone" dataKey="total" stroke="hsl(var(--accent))" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{t("owner.detail.recent_recharges")}</h2>
          {recent.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <div className="space-y-2">
              {recent.map((r) => (
                <Link key={r.id} to="/owner/recharges/$id" params={{ id: r.id }} className="block">
                  <div className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/30">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">{r.cafeteria_ref_code}</div>
                      <div className="font-semibold">${Number(r.amount_usd).toFixed(2)}</div>
                    </div>
                    <Badge variant={r.status === "approved" ? "default" : r.status === "pending" ? "secondary" : "destructive"}>{r.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-4 w-4 text-orange-500" />
          {t("owner.grace.title")} <Badge variant="secondary">{graceRows.length}</Badge>
        </h2>
        {graceRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("owner.grace.empty")}</p>
        ) : (
          <div className="space-y-2">
            {graceRows.map((g) => {
              const h = Math.floor(g.seconds_remaining / 3600);
              const m = Math.floor((g.seconds_remaining % 3600) / 60);
              return (
                <div key={g.ref_code} className="flex items-center justify-between border border-border rounded-md p-3 gap-2 flex-wrap">
                  <div>
                    <div className="font-medium text-sm">{g.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{g.ref_code} • {Number(g.points_balance).toFixed(2)}</div>
                  </div>
                  {g.is_blocked ? (
                    <Badge variant="destructive">{t("owner.grace.blocked")}</Badge>
                  ) : (
                    <Badge variant="secondary" className="font-mono">{t("owner.grace.remaining")}: {h}h {m}m</Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </DashboardShell>
  );
}
