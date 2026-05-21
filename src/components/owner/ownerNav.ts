import { LayoutDashboard, Users, Coffee, Wallet, Percent, Banknote, BarChart3 } from "lucide-react";

export const ownerNavItems = (t: (k: string) => string) => [
  { to: "/owner", label: t("owner.nav.overview"), icon: LayoutDashboard },
  { to: "/owner/marketers", label: t("owner.nav.marketers"), icon: Users },
  { to: "/owner/cafeterias", label: t("owner.nav.cafeterias"), icon: Coffee },
  { to: "/owner/recharges", label: t("owner.nav.recharges"), icon: Wallet },
  { to: "/owner/commissions", label: t("owner.general_settings"), icon: Percent },
  { to: "/owner/withdrawals", label: t("owner.nav.withdrawals"), icon: Banknote },
  { to: "/owner/reports", label: t("owner.nav.reports"), icon: BarChart3 },
];
