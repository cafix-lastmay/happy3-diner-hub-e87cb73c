// Manager: shift reports for the cafeteria they manage.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, Users, BarChart3, BookOpen, QrCode } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { useAuth } from "@/auth/AuthProvider";
import { ShiftReports } from "@/components/ShiftReports";
import { SalesByTierReport } from "@/components/SalesByTierReport";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/manager/reports")({ component: ManagerReports });

function ManagerReports() {
  const { t } = useI18n();
  const { ready } = useRequireRole("manager");
  const { user } = useAuth();
  const [refCode, setRefCode] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    supabase.from("staff").select("cafeteria_ref_code").eq("user_id", user.id).eq("role", "manager").eq("is_active", true).maybeSingle()
      .then(({ data }) => { if (data) setRefCode(data.cafeteria_ref_code); });
  }, [ready, user]);

  if (!ready) return null;
  const navItems = [
    { to: "/manager", label: t("orders.title"), icon: ClipboardList },
    { to: "/manager/menu", label: t("cafeteria.nav.menu"), icon: BookOpen },
    { to: "/manager/tables", label: t("cafeteria.nav.tables"), icon: QrCode },
    { to: "/manager/staff", label: t("cafeteria.nav.staff"), icon: Users },
    { to: "/manager/reports", label: t("reports.title"), icon: BarChart3 },
  ];
  return (
    <DashboardShell title={t("manager.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-6">{t("reports.title")}</h1>
      {refCode && (
        <div className="space-y-8">
          <SalesByTierReport />
          <ShiftReports cafeteriaRefCode={refCode} />
        </div>
      )}
    </DashboardShell>
  );
}
