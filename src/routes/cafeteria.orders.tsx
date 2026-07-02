import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Wallet, History, BookOpen, QrCode, Users, ClipboardList, BarChart3 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { DailyPointsCapCard } from "@/components/cafeteria/DailyPointsCapCard";
import { OrdersBoard } from "@/components/OrdersBoard";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { useRequireFullCafe } from "@/auth/useRequireFullCafe";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export const Route = createFileRoute("/cafeteria/orders")({ component: CafeOrders });

function CafeOrders() {
  const { t } = useI18n();
  const { ready } = useRequireRole("cafeteria_admin");
  useRequireFullCafe();
  const { user } = useAuth();
  const [refCode, setRefCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  useEffect(() => {
    if (!ready || !user) return;
    supabase.from("cafeterias").select("ref_code").eq("user_id", user.id).maybeSingle().then(({ data }) => { if (data) setRefCode(data.ref_code); });
  }, [ready, user]);
  if (!ready) return <Redirecting />;
  const navItems = [
    { to: "/cafeteria", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/cafeteria/menu", label: t("cafeteria.nav.menu"), icon: BookOpen },
    { to: "/cafeteria/tables", label: t("cafeteria.nav.tables"), icon: QrCode },
    { to: "/cafeteria/staff", label: t("cafeteria.nav.staff"), icon: Users },
    { to: "/cafeteria/orders", label: t("cafeteria.nav.orders"), icon: ClipboardList },
    { to: "/cafeteria/reports", label: t("cafeteria.nav.reports"), icon: BarChart3 },
    { to: "/cafeteria/recharge", label: t("cafeteria.nav.recharge"), icon: Wallet },
    { to: "/cafeteria/history", label: t("cafeteria.nav.history"), icon: History },
  ].filter((n) => n.to !== "/cafeteria");
  return (
    <DashboardShell title={t("cafeteria.dashboard.title")} navItems={navItems} showTrialCard>
      <h1 className="text-2xl font-bold mb-4">{t("orders.title")}</h1>
      {refCode && <DailyPointsCapCard refCode={refCode} />}
      <div className="mb-6 flex gap-2">
        <Button size="sm" variant={activeTab === "active" ? "default" : "outline"} onClick={() => setActiveTab("active")}>{t("orders.filter.active")}</Button>
        <Button size="sm" variant={activeTab === "completed" ? "default" : "outline"} onClick={() => setActiveTab("completed")}>{t("orders.filter.completed")}</Button>
      </div>
      {refCode ? <OrdersBoard cafeteriaRefCode={refCode} completedView={activeTab === "completed"} /> : <p>{t("common.loading")}</p>}
    </DashboardShell>
  );
}
