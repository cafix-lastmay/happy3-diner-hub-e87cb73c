import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, Coffee, Wallet, Percent, Banknote, Check, X } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/withdrawals")({
  component: OwnerWithdrawals,
});

interface W { id: string; marketer_ref_code: string; amount_usd: number; status: string; created_at: string; notes: string | null }

function OwnerWithdrawals() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [rows, setRows] = useState<W[]>([]);

  const load = async () => {
    const { data } = await supabase.from("withdrawal_requests").select("*").order("created_at", { ascending: false });
    setRows((data ?? []) as W[]);
  };
  useEffect(() => { if (ready) load(); }, [ready]);

  const updateStatus = async (id: string, status: "paid" | "rejected", marketer_ref_code: string, amount: number) => {
    const { error } = await supabase.from("withdrawal_requests").update({ status, processed_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (status === "paid") {
      // Deduct from marketer's available balance
      const { data: m } = await supabase.from("marketers").select("commission_balance_available").eq("ref_code", marketer_ref_code).single();
      if (m) {
        await supabase.from("marketers").update({ commission_balance_available: Number(m.commission_balance_available) - amount }).eq("ref_code", marketer_ref_code);
      }
    }
    toast.success(t("common.success"));
    load();
  };

  if (!ready) return <Redirecting />;
  const navItems = [
    { to: "/owner", label: t("owner.nav.overview"), icon: LayoutDashboard },
    { to: "/owner/marketers", label: t("owner.nav.marketers"), icon: Users },
    { to: "/owner/cafeterias", label: t("owner.nav.cafeterias"), icon: Coffee },
    { to: "/owner/recharges", label: t("owner.nav.recharges"), icon: Wallet },
    { to: "/owner/commissions", label: t("owner.nav.commissions"), icon: Percent },
    { to: "/owner/withdrawals", label: t("owner.nav.withdrawals"), icon: Banknote },
  ];

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-6">{t("owner.nav.withdrawals")}</h1>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">{t("common.date")}</th>
              <th className="p-3 text-start">Marketer</th>
              <th className="p-3 text-start">USD</th>
              <th className="p-3 text-start">{t("common.status")}</th>
              <th className="p-3 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="p-3 font-mono">{r.marketer_ref_code}</td>
                <td className="p-3">${Number(r.amount_usd).toFixed(2)}</td>
                <td className="p-3"><Badge>{t(`status.${r.status}`)}</Badge></td>
                <td className="p-3">
                  {r.status === "pending" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateStatus(r.id, "paid", r.marketer_ref_code, Number(r.amount_usd))} className="bg-accent text-accent-foreground"><Check className="h-3 w-3" /></Button>
                      <Button size="sm" variant="destructive" onClick={() => updateStatus(r.id, "rejected", r.marketer_ref_code, Number(r.amount_usd))}><X className="h-3 w-3" /></Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
