import { LayoutDashboard, Users, Coffee, Wallet, Percent, Banknote, BarChart3, Settings, DollarSign, Clock, Globe, FileText, Calculator, Gauge } from "lucide-react";

export const ownerNavItems = (t: (k: string) => string) => [
  { to: "/owner", label: t("owner.nav.overview"), icon: LayoutDashboard },
  { to: "/owner/marketers", label: t("owner.nav.marketers"), icon: Users },
  { to: "/owner/cafeterias", label: t("owner.nav.cafeterias"), icon: Coffee },
  { to: "/owner/calculator", label: t("calc.nav"), icon: Calculator },
  { to: "/owner/recharges", label: t("owner.nav.recharges"), icon: Wallet },
  { to: "/owner/commissions", label: t("owner.nav.commissions"), icon: Percent },
  { to: "/owner/withdrawals", label: t("owner.nav.withdrawals"), icon: Banknote },
  { to: "/owner/exchange_rates", label: t("owner.nav.exchange_rates"), icon: DollarSign },
  { to: "/owner/grace_periods", label: t("owner.nav.grace_periods"), icon: Clock },
  { to: "/owner/countries", label: t("owner.nav.countries"), icon: Globe },
  { to: "/owner/recharge_instructions", label: t("owner.nav.recharge_instructions"), icon: FileText },
  { to: "/owner/reports", label: t("owner.nav.reports"), icon: BarChart3 },
  { to: "/owner/settings", label: t("owner.nav.settings"), icon: Settings },
];
