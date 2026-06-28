import { createFileRoute } from "@tanstack/react-router";
import { DashboardShell } from "@/components/DashboardShell";
import { CommissionCalculator } from "@/components/CommissionCalculator";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { ownerNavItems } from "@/components/owner/ownerNav";

export const Route = createFileRoute("/owner/calculator")({ component: OwnerCalc });

function OwnerCalc() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  if (!ready) return <Redirecting />;
  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}>
      <h1 className="text-2xl font-bold mb-2">{t("calc.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("calc.page_subtitle")}</p>
      <CommissionCalculator />
    </DashboardShell>
  );
}
