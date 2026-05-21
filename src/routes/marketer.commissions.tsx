import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Percent, Banknote } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/marketer/commissions")({ component: MarketerCommissions });

interface CT { id: string; source_cafeteria_ref_code: string; level_distance: number; percentage: number; amount_usd: number; status: string; created_at: string }

function MarketerCommissions() {
  const { t } = useI18n();
  const { ready } = useRequireRole("marketer");
  const [rows, setRows] = useState<CT[]>([]);
  useEffect(() => {
    if (!ready) return;
    supabase.from("commission_transactions").select("*").order("created_at", { ascending: false }).then(({ data }) => setRows((data ?? []) as CT[]));
  }, [ready]);
  if (!ready) return null;
  const navItems = [
    { to: "/marketer", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/marketer/commissions", label: t("marketer.nav.commissions"), icon: Percent },
    { to: "/marketer/withdrawals", label: t("marketer.nav.withdrawals"), icon: Banknote },
  ];
  return (
    <DashboardShell title={t("marketer.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-6">{t("marketer.nav.commissions")}</h1>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr><th className="p-3 text-start">{t("common.date")}</th><th className="p-3 text-start">Source</th><th className="p-3 text-start">Level</th><th className="p-3 text-start">%</th><th className="p-3 text-start">USD</th><th className="p-3 text-start">{t("common.status")}</th></tr></thead>
          <tbody>
            {rows.map((r) => (<tr key={r.id} className="border-t border-border"><td className="p-3">{new Date(r.created_at).toLocaleDateString()}</td><td className="p-3 font-mono">{r.source_cafeteria_ref_code}</td><td className="p-3">{r.level_distance}</td><td className="p-3">{r.percentage}%</td><td className="p-3">${Number(r.amount_usd).toFixed(4)}</td><td className="p-3"><Badge variant={r.status === "available" ? "default" : "secondary"}>{t(`status.${r.status}`)}</Badge></td></tr>))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
