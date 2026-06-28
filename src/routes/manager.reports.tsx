// Manager: shift reports for the cafeteria they manage.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getManagerNavItems } from "@/components/manager/managerNav";
import { DashboardShell } from "@/components/DashboardShell";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
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

  if (!ready) return <Redirecting />;
  const navItems = getManagerNavItems(t);
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
