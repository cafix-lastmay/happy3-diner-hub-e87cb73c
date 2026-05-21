// Cafeteria admin: shift reports (tips, orders, hours) for own cafeteria.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Wallet, History, BookOpen, QrCode, Users, ClipboardList, BarChart3 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { useAuth } from "@/auth/AuthProvider";
import { ShiftReports } from "@/components/ShiftReports";
import { SalesByTierReport } from "@/components/SalesByTierReport";
import { supabase } from "@/integrations/supabase/client";
import { BIReports } from "@/components/cafeteria/BIReports";

export const Route = createFileRoute("/cafeteria/reports")({ component: CafeReports });

function CafeReports() {
  const { t } = useI18n();
  const { ready } = useRequireRole("cafeteria_admin");
  const { user } = useAuth();
  const [refCode, setRefCode] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    supabase.from("cafeterias").select("ref_code").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setRefCode(data.ref_code); });
  }, [ready, user]);

  if (!ready) return null;
  const navItems = [
    { to: "/cafeteria", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/cafeteria/menu", label: t("cafeteria.nav.menu"), icon: BookOpen },
    { to: "/cafeteria/tables", label: t("cafeteria.nav.tables"), icon: QrCode },
    { to: "/cafeteria/staff", label: t("cafeteria.nav.staff"), icon: Users },
    { to: "/cafeteria/orders", label: t("cafeteria.nav.orders"), icon: ClipboardList },
    { to: "/cafeteria/reports", label: t("reports.title"), icon: BarChart3 },
    { to: "/cafeteria/recharge", label: t("cafeteria.nav.recharge"), icon: Wallet },
    { to: "/cafeteria/history", label: t("cafeteria.nav.history"), icon: History },
  ];
  return (
    <DashboardShell title={t("cafeteria.dashboard.title")} navItems={navItems.filter((n) => n.to !== "/cafeteria")} showTrialCard>
      <h1 className="text-2xl font-bold mb-6">{t("reports.title")}</h1>
      {refCode ? (
        <div className="space-y-8">
          <SalesByTierReport />
          <ShiftReports cafeteriaRefCode={refCode} />
        </div>
      ) : <p>{t("common.loading")}</p>}
    </DashboardShell>
  );
}
