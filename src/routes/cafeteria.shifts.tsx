// Cafeteria admin: shift approvals + reports + staff active toggle.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Wallet, History, BookOpen, QrCode, Users, ClipboardList, BarChart3, Settings as SettingsIcon } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { useRequireFullCafe } from "@/auth/useRequireFullCafe";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { ShiftApprovalsPanel } from "@/components/ShiftApprovalsPanel";
import { ShiftReports } from "@/components/ShiftReports";
import { StaffActivePanel } from "@/components/StaffActivePanel";

export const Route = createFileRoute("/cafeteria/shifts")({ component: CafeShifts });

function CafeShifts() {
  const { t } = useI18n();
  const { ready } = useRequireRole("cafeteria_admin");
  useRequireFullCafe();
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
    { to: "/cafeteria/shifts", label: t("cafeteria.nav.shifts"), icon: BarChart3 },
    { to: "/cafeteria/orders", label: t("cafeteria.nav.orders"), icon: ClipboardList },
    { to: "/cafeteria/reports", label: t("cafeteria.nav.reports"), icon: BarChart3 },
    { to: "/cafeteria/recharge", label: t("cafeteria.nav.recharge"), icon: Wallet },
    { to: "/cafeteria/history", label: t("cafeteria.nav.history"), icon: History },
    { to: "/cafeteria/settings", label: t("cafeteria.nav.settings"), icon: SettingsIcon },
  ];
  return (
    <DashboardShell title={t("cafeteria.dashboard.title")} navItems={navItems.filter((n) => n.to !== "/cafeteria")} showTrialCard>
      <h1 className="text-2xl font-bold mb-6">{t("cafeteria.nav.shifts")}</h1>
      {refCode && (
        <div className="space-y-6">
          <ShiftApprovalsPanel cafeteriaRefCode={refCode} />
          <StaffActivePanel cafeteriaRefCode={refCode} />
          <div>
            <h2 className="text-xl font-semibold mb-3">{t("reports.title")}</h2>
            <ShiftReports cafeteriaRefCode={refCode} />
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
