import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Wallet, History, BarChart3 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/cafeteria/history")({ component: () => <CafeHistory mode="admin" /> });

interface R { id: string; amount_usd: number; points_to_credit: number; local_currency: string; status: string; created_at: string; notes: string | null }

export function CafeHistory({ mode = "admin" }: { mode?: "admin" | "manager" }) {
  const { t } = useI18n();
  const { ready } = useRequireRole(mode === "manager" ? "manager" : "cafeteria_admin");
  const [rows, setRows] = useState<R[]>([]);
  const base = mode === "manager" ? "/manager" : "/cafeteria";
  useEffect(() => {
    if (!ready) return;
    supabase.from("recharge_requests").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows((data ?? []) as R[]));
  }, [ready]);
  if (!ready) return null;
  const navItems = [
    { to: base, label: t("common.dashboard"), icon: LayoutDashboard },
    { to: `${base}/reports`, label: t("cafeteria.nav.reports"), icon: BarChart3 },
    { to: `${base}/recharge`, label: t("cafeteria.nav.recharge"), icon: Wallet },
    { to: `${base}/history`, label: t("cafeteria.nav.history"), icon: History },
  ];
  return (
    <DashboardShell title={t("cafeteria.dashboard.title")} navItems={navItems.filter((n) => n.to !== base)} showTrialCard={mode === "admin"}>
      <h1 className="text-2xl font-bold mb-6">{t("cafeteria.nav.history")}</h1>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr><th className="p-3 text-start">{t("common.date")}</th><th className="p-3 text-start">USD</th><th className="p-3 text-start">{t("common.points")}</th><th className="p-3 text-start">{t("common.status")}</th></tr></thead>
          <tbody>
            {rows.map((r) => (<tr key={r.id} className="border-t border-border"><td className="p-3">{new Date(r.created_at).toLocaleDateString()}</td><td className="p-3">${Number(r.amount_usd).toFixed(2)}</td><td className="p-3">{Number(r.points_to_credit).toFixed(2)} {r.local_currency}</td><td className="p-3"><Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{t(`status.${r.status}`)}</Badge></td></tr>))}
            {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
