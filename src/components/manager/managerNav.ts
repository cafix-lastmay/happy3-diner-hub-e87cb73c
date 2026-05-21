import { ClipboardList, Users, BarChart3, BookOpen, QrCode, Tags, Wallet, History, Settings as SettingsIcon } from "lucide-react";

export function getManagerNavItems(t: (k: string) => string) {
  return [
    { to: "/manager", label: t("orders.title"), icon: ClipboardList },
    { to: "/manager/menu", label: t("cafeteria.nav.menu"), icon: BookOpen },
    { to: "/manager/pricing", label: t("cafeteria.nav.pricing") || "التسعير", icon: Tags },
    { to: "/manager/tables", label: t("cafeteria.nav.tables"), icon: QrCode },
    { to: "/manager/staff", label: t("cafeteria.nav.staff"), icon: Users },
    { to: "/manager/reports", label: t("reports.title"), icon: BarChart3 },
    { to: "/manager/recharge", label: t("cafeteria.nav.recharge"), icon: Wallet },
    { to: "/manager/history", label: t("cafeteria.nav.history"), icon: History },
    { to: "/manager/settings", label: t("cafeteria.nav.settings"), icon: SettingsIcon },
  ];
}
