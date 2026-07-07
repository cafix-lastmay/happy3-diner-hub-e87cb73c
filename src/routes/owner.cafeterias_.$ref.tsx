// Owner: cafeteria detail with edit, manual recharge, password reset, and reports.
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Edit, KeyRound, Coins, Ban, CheckCircle2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { EditEntityDialog } from "@/components/owner/EditEntityDialog";
import { AdjustBalanceDialog } from "@/components/owner/AdjustBalanceDialog";
import { ResetPasswordDialog } from "@/components/owner/ResetPasswordDialog";
import { SuspendCafeteriaDialog } from "@/components/owner/SuspendCafeteriaDialog";
import { FreePointsGrantsPanel } from "@/components/owner/FreePointsGrantsPanel";
import { OwnerNotePanel } from "@/components/owner/OwnerNotePanel";

export const Route = createFileRoute("/owner/cafeterias_/$ref")({ component: OwnerCafeteriaDetail });

interface C {
  id: string; ref_code: string; parent_ref_code: string; name: string;
  email: string | null; phone: string | null; whatsapp: string | null; address: string | null;
  country_code: string | null; currency_code: string | null;
  points_balance: number; is_active: boolean; user_id: string | null; created_at: string;
  free_trial_until: string | null;
  is_suspended: boolean; suspension_reason: string | null;
  owner_note: string | null;
}

function OwnerCafeteriaDetail() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const { ref } = useParams({ from: "/owner/cafeterias_/$ref" });
  const [c, setC] = useState<C | null>(null);
  const [recharges, setRecharges] = useState<{ id: string; amount_usd: number; status: string; created_at: string }[]>([]);
  const [orders, setOrders] = useState<{ id: string; total: number; status: string; created_at: string; table_label: string }[]>([]);
  const [staffCount, setStaffCount] = useState(0);
  const [tablesCount, setTablesCount] = useState(0);

  const load = useCallback(async () => {
    const [{ data: ca }, { data: rr }, { data: or }, { count: sc }, { count: tc }] = await Promise.all([
      supabase.from("cafeterias").select("*").eq("ref_code", ref).maybeSingle(),
      supabase.from("recharge_requests").select("id, amount_usd, status, created_at").eq("cafeteria_ref_code", ref).order("created_at", { ascending: false }).limit(15),
      supabase.from("orders").select("id, total, status, created_at, table_label").eq("cafeteria_ref_code", ref).order("created_at", { ascending: false }).limit(15),
      supabase.from("staff").select("id", { count: "exact", head: true }).eq("cafeteria_ref_code", ref),
      supabase.from("restaurant_tables").select("id", { count: "exact", head: true }).eq("cafeteria_ref_code", ref),
    ]);
    if (ca) setC(ca as C);
    setRecharges(rr ?? []);
    setOrders(or ?? []);
    setStaffCount(sc ?? 0);
    setTablesCount(tc ?? 0);
  }, [ref]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  if (!ready) return <Redirecting />;
  if (!c) return <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}><div className="p-6">{t("common.loading")}</div></DashboardShell>;

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}>
      <Link to="/owner/cafeterias" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <div className="font-mono text-sm text-muted-foreground mt-1">{c.ref_code}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <EditEntityDialog kind="cafeteria" entity={c} onDone={load} trigger={<Button size="sm" variant="outline" className="gap-2"><Edit className="h-4 w-4" /> {t("owner.actions.edit")}</Button>} />
          <AdjustBalanceDialog kind="cafeteria_points" refCode={c.ref_code} onDone={load} trigger={<Button size="sm" variant="outline" className="gap-2"><Coins className="h-4 w-4" /> {t("owner.actions.recharge_points")}</Button>} />
          {c.user_id && <ResetPasswordDialog userId={c.user_id} trigger={<Button size="sm" variant="outline" className="gap-2"><KeyRound className="h-4 w-4" /> {t("owner.actions.reset_password")}</Button>} />}
          <SuspendCafeteriaDialog
            refCode={c.ref_code}
            isSuspended={c.is_suspended}
            currentReason={c.suspension_reason}
            onDone={load}
            trigger={
              <Button size="sm" className={`gap-2 ${c.is_suspended ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}`}>
                {c.is_suspended ? <><CheckCircle2 className="h-4 w-4" /> تفعيل الكافيتريا</> : <><Ban className="h-4 w-4" /> إيقاف الكافيتريا</>}
              </Button>
            }
          />
        </div>
      </div>

      {c.is_suspended && (
        <Card className="p-4 mb-4 border-destructive/50 bg-destructive/5">
          <div className="flex items-center gap-2 text-destructive font-semibold mb-1"><Ban className="h-4 w-4" /> الكافيتريا موقوفة حالياً</div>
          {c.suspension_reason && <div className="text-sm text-muted-foreground">السبب: {c.suspension_reason}</div>}
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-4"><div className="text-xs text-muted-foreground">{t("cafeteria.points_balance") ?? "Points"}</div><div className="text-2xl font-bold text-accent mt-1">{Number(c.points_balance).toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">{t("owner.detail.staff")}</div><div className="text-2xl font-bold mt-1">{staffCount}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">{t("owner.detail.tables")}</div><div className="text-2xl font-bold mt-1">{tablesCount}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">{t("common.status")}</div><div className="mt-2"><Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Active" : "Inactive"}</Badge></div></Card>
      </div>

      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">Info</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{t("common.email")}</dt><dd>{c.email ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("common.phone")}</dt><dd>{c.phone ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("common.whatsapp")}</dt><dd>{c.whatsapp ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("common.address")}</dt><dd>{c.address ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("common.country")}</dt><dd>{c.country_code ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("common.currency")}</dt><dd>{c.currency_code ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Parent (Marketer)</dt><dd><Link to="/owner/marketers/$ref" params={{ ref: c.parent_ref_code }} className="font-mono text-accent hover:underline">{c.parent_ref_code}</Link></dd></div>
          <div><dt className="text-muted-foreground">Free trial until</dt><dd>{c.free_trial_until ? new Date(c.free_trial_until).toLocaleDateString() : "—"}</dd></div>
          <div><dt className="text-muted-foreground">Joined</dt><dd>{new Date(c.created_at).toLocaleDateString()}</dd></div>
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-3">{t("owner.detail.recent_recharges")}</h2>
          {recharges.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
              {recharges.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-2">${Number(r.amount_usd).toFixed(2)}</td>
                  <td className="py-2"><Badge variant={r.status === "approved" ? "default" : "secondary"}>{r.status}</Badge></td>
                  <td className="py-2 text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-3">{t("owner.detail.recent_orders")}</h2>
          {orders.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="py-2 font-mono text-xs">{o.table_label}</td>
                  <td className="py-2">{Number(o.total).toFixed(2)}</td>
                  <td className="py-2"><Badge variant="outline">{o.status}</Badge></td>
                  <td className="py-2 text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}
