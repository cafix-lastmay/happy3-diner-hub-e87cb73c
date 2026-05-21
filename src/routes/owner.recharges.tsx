import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, Coffee, Wallet, Percent, Banknote, Eye } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/owner/recharges")({
  component: OwnerRechargesLayout,
});

function OwnerRechargesLayout() {
  // Detect child route FIRST, before any other logic, so the details page
  // takes over the full main area without the parent list rendering.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChild = /^\/owner\/recharges\/[^/]+/.test(pathname);
  if (isChild) return <Outlet />;
  return <OwnerRechargesList />;
}

interface R { id: string; cafeteria_ref_code: string; amount_usd: number; points_to_credit: number; local_currency: string; receipt_url: string; status: string; created_at: string; notes: string | null }

function OwnerRechargesList() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [rows, setRows] = useState<R[]>([]);

  const load = async () => {
    const { data } = await supabase.from("recharge_requests").select("*").order("created_at", { ascending: false });
    setRows((data ?? []) as R[]);
  };
  useEffect(() => { if (ready) load(); }, [ready]);

  if (!ready) return null;
  const navItems = [
    { to: "/owner", label: t("owner.nav.overview"), icon: LayoutDashboard },
    { to: "/owner/marketers", label: t("owner.nav.marketers"), icon: Users },
    { to: "/owner/cafeterias", label: t("owner.nav.cafeterias"), icon: Coffee },
    { to: "/owner/recharges", label: t("owner.nav.recharges"), icon: Wallet },
    { to: "/owner/commissions", label: t("owner.nav.commissions"), icon: Percent },
    { to: "/owner/withdrawals", label: t("owner.nav.withdrawals"), icon: Banknote },
  ];

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-6">{t("owner.nav.recharges")}</h1>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">{t("common.date")}</th>
              <th className="p-3 text-start">Cafeteria</th>
              <th className="p-3 text-start">USD</th>
              <th className="p-3 text-start">{t("common.points")}</th>
              <th className="p-3 text-start">{t("common.status")}</th>
              <th className="p-3 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="p-3 font-mono">{r.cafeteria_ref_code}</td>
                <td className="p-3">${Number(r.amount_usd).toFixed(2)}</td>
                <td className="p-3">{Number(r.points_to_credit).toFixed(2)} {r.local_currency}</td>
                <td className="p-3"><Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{t(`status.${r.status}`)}</Badge></td>
                <td className="p-3">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/owner/recharges/$id" params={{ id: r.id }}>
                      <Eye className="h-3 w-3 me-1" /> {t("common.view") || "View"}
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
