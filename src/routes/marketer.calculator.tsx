import { createFileRoute } from "@tanstack/react-router";
import { LayoutDashboard, Percent, Banknote, BarChart3, Calculator } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { CommissionCalculator } from "@/components/CommissionCalculator";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";

export const Route = createFileRoute("/marketer/calculator")({ component: MarketerCalc });

function MarketerCalc() {
  const { t } = useI18n();
  const { ready } = useRequireRole("marketer");
  if (!ready) return null;
  const navItems = [
    { to: "/marketer", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/marketer/calculator", label: t("calc.nav"), icon: Calculator },
    { to: "/marketer/commissions", label: t("marketer.nav.commissions"), icon: Percent },
    { to: "/marketer/withdrawals", label: t("marketer.nav.withdrawals"), icon: Banknote },
    { to: "/marketer/reports", label: t("marketer.nav.reports"), icon: BarChart3 },
  ];
  return (
    <DashboardShell title={t("marketer.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-2">{t("calc.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("calc.page_subtitle")}</p>
      <CommissionCalculator />
    </DashboardShell>
  );
}
