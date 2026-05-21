// Live orders screen for waiter/chef.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, QrCode, History as HistoryIcon } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { OrdersBoard } from "@/components/OrdersBoard";
import { ShiftStatus } from "@/components/ShiftStatus";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/staff/orders")({ component: StaffOrders });

function StaffOrders() {
  const { t } = useI18n();
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [refCode, setRefCode] = useState<string | null>(null);
  const isWaiter = roles.includes("waiter");
  const isChef = roles.includes("chef");
  const isStaff = isWaiter || isChef;
  const scopeRole: "chef" | "waiter" | undefined = isChef ? "chef" : isWaiter ? "waiter" : undefined;

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    if (!isStaff) {
      if (roles.includes("owner")) navigate({ to: "/owner" });
      else if (roles.includes("marketer")) navigate({ to: "/marketer" });
      else if (roles.includes("cafeteria_admin")) navigate({ to: "/cafeteria" });
      else navigate({ to: "/" });
      return;
    }
    supabase.from("staff").select("cafeteria_ref_code").eq("user_id", user.id).eq("is_active", true).maybeSingle().then(({ data }) => {
      if (data) setRefCode(data.cafeteria_ref_code);
    });
  }, [loading, user, roles, isStaff, navigate]);

  if (loading || !isStaff) return null;
  const navItems = [
    ...(isWaiter ? [{ to: "/staff/tables", label: t("staff.nav.tables"), icon: QrCode }] : []),
    { to: "/staff/orders", label: t("staff.nav.orders"), icon: ClipboardList },
    { to: "/staff/history", label: t("staff.nav.history"), icon: HistoryIcon },
  ];
  return (
    <DashboardShell title={t("staff.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-6">{t("orders.title")}</h1>
      <ShiftStatus />
      {refCode ? <OrdersBoard cafeteriaRefCode={refCode} scopeRole={scopeRole} requireActiveShift /> : <p>{t("common.loading")}</p>}
    </DashboardShell>
  );
}
