// Manager dashboard: live orders + shift management for the cafeteria they manage.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, Users, BarChart3, BookOpen, QrCode, Tags, Wallet, History, Settings as SettingsIcon } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { OrdersBoard } from "@/components/OrdersBoard";
import { ShiftStatus } from "@/components/ShiftStatus";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export const Route = createFileRoute("/manager/")({ component: ManagerDashboard });

function ManagerDashboard() {
  const { t } = useI18n();
  const { ready } = useRequireRole("manager");
  const { user } = useAuth();
  const [refCode, setRefCode] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ points: number; currency: string | null; name: string } | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    supabase.from("staff").select("cafeteria_ref_code").eq("user_id", user.id).eq("role", "manager").eq("is_active", true).maybeSingle()
      .then(({ data }) => { if (data) setRefCode(data.cafeteria_ref_code); });
  }, [ready, user]);

  useEffect(() => {
    if (!refCode) return;
    const load = () => supabase.from("cafeterias").select("name, points_balance, currency_code").eq("ref_code", refCode).maybeSingle()
      .then(({ data }) => { if (data) setBalance({ points: Number(data.points_balance), currency: data.currency_code, name: data.name }); });
    load();
    const ch = supabase.channel(`cafe-balance-${refCode}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cafeterias", filter: `ref_code=eq.${refCode}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refCode]);

  if (!ready) return null;
  const navItems = [
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
  return (
    <DashboardShell title={t("manager.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-4">{t("manager.dashboard.title")}</h1>
      {balance && (
        <Card className="p-6 max-w-md mb-6">
          <div className="text-sm text-muted-foreground">{t("cafeteria.points_balance")}{balance.name ? ` — ${balance.name}` : ""}</div>
          <div className="mt-2 text-4xl font-bold text-accent">{balance.points.toFixed(2)} <span className="text-lg text-muted-foreground">{balance.currency}</span></div>
        </Card>
      )}
      <ShiftStatus />
      {refCode ? <OrdersBoard cafeteriaRefCode={refCode} /> : <p>{t("common.loading")}</p>}
    </DashboardShell>
  );
}
