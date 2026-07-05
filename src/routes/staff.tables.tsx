// Waiter tables board: section-filtered, green = available, orange = occupied.
// Click a table opens the same QR menu page used by customers, so the waiter
// can place an order on behalf of a customer.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ClipboardList, QrCode, History as HistoryIcon } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { ShiftStatus } from "@/components/ShiftStatus";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/staff/tables")({ component: StaffTables });

interface Tbl { id: string; label: string; section_id: string | null; qr_token: string; is_occupied: boolean }

function StaffTables() {
  const { t } = useI18n();
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const isWaiter = roles.includes("waiter");
  const [tables, setTables] = useState<Tbl[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_waiter_tables");
    if (!error && data) setTables(data as Tbl[]);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    if (!isWaiter) {
      if (roles.includes("chef")) navigate({ to: "/staff/orders" });
      else navigate({ to: "/" });
      return;
    }
    load();
    // refresh on any orders change for the waiter's cafeteria
    const channel = supabase.channel(`staff-tables-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    const id = setInterval(load, 15000);
    return () => { supabase.removeChannel(channel); clearInterval(id); };
  }, [loading, user, roles, isWaiter, navigate, load]);

  if (loading || !isWaiter) return null;

  const navItems = [
    { to: "/staff/tables", label: t("staff.nav.tables"), icon: QrCode },
    { to: "/staff/orders", label: t("staff.nav.orders"), icon: ClipboardList },
    { to: "/staff/history", label: t("staff.nav.history"), icon: HistoryIcon },
  ];

  return (
    <DashboardShell title={t("staff.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-6">{t("staff.tables.title")}</h1>
      <ShiftStatus />
      {tables.length === 0 ? (
        <EmptyState icon={<QrCode className="h-6 w-6" />} title={t("staff.tables.empty")} />
      ) : (
        <div data-tables-grid className="grid gap-2 grid-cols-2 max-w-xs">
          {tables.map((tb) => (
            <button
              key={tb.id}
              onClick={() => navigate({ to: "/m/$qrToken", params: { qrToken: tb.qr_token } })}
              className="text-left"
            >
              <Card
                className={`p-2 flex flex-col items-center justify-center aspect-square transition-transform hover:scale-105 ${
                  tb.is_occupied
                    ? "bg-orange-500/15 border-orange-500/60 text-orange-700 dark:text-orange-300"
                    : "bg-emerald-500/15 border-emerald-500/60 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                <div className="text-base font-extrabold leading-none">{tb.label}</div>
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide">
                  {tb.is_occupied ? t("staff.tables.occupied") : t("staff.tables.available")}
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
