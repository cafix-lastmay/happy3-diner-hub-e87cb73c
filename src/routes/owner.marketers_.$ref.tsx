// Owner: marketer detail page with edit, balance adjust, password reset, full info.
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Edit, KeyRound, DollarSign } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { EditEntityDialog } from "@/components/owner/EditEntityDialog";
import { AdjustBalanceDialog } from "@/components/owner/AdjustBalanceDialog";
import { ResetPasswordDialog } from "@/components/owner/ResetPasswordDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/marketers_/$ref")({ component: OwnerMarketerDetail });

interface M {
  id: string; ref_code: string; parent_ref_code: string | null; name: string; level: number;
  email: string | null; phone: string | null; whatsapp: string | null; address: string | null;
  country_code: string | null; currency_code: string | null;
  commission_balance_available: number; commission_balance_frozen: number;
  is_active: boolean; user_id: string | null; created_at: string;
  custom_commission_months: number | null;
}

function OwnerMarketerDetail() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const { ref } = useParams({ from: "/owner/marketers_/$ref" });
  const [m, setM] = useState<M | null>(null);
  const [children, setChildren] = useState<{ ref_code: string; name: string; type: string }[]>([]);
  const [commissions, setCommissions] = useState<{ id: string; amount_usd: number; status: string; created_at: string; source_cafeteria_ref_code: string }[]>([]);
  const [withdrawals, setWithdrawals] = useState<{ id: string; amount_usd: number; status: string; created_at: string }[]>([]);
  const [customMonths, setCustomMonths] = useState<string>("");
  const [savingMonths, setSavingMonths] = useState(false);

  const load = useCallback(async () => {
    const [{ data: mar }, { data: subM }, { data: subC }, { data: cm }, { data: wd }] = await Promise.all([
      supabase.from("marketers").select("*").eq("ref_code", ref).maybeSingle(),
      supabase.from("marketers").select("ref_code, name").eq("parent_ref_code", ref),
      supabase.from("cafeterias").select("ref_code, name").eq("parent_ref_code", ref),
      supabase.from("commission_transactions").select("id, amount_usd, status, created_at, source_cafeteria_ref_code").eq("marketer_ref_code", ref).order("created_at", { ascending: false }).limit(20),
      supabase.from("withdrawal_requests").select("id, amount_usd, status, created_at").eq("marketer_ref_code", ref).order("created_at", { ascending: false }).limit(20),
    ]);
    if (mar) setM(mar as M);
    setChildren([
      ...(subM ?? []).map((x) => ({ ...x, type: "marketer" })),
      ...(subC ?? []).map((x) => ({ ...x, type: "cafeteria" })),
    ]);
    setCommissions(cm ?? []);
    setWithdrawals(wd ?? []);
  }, [ref]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  if (!ready) return null;
  if (!m) return <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}><div className="p-6">{t("common.loading")}</div></DashboardShell>;

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}>
      <Link to="/owner/marketers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{m.name}</h1>
          <div className="font-mono text-sm text-muted-foreground mt-1">{m.ref_code} · Level {m.level}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <EditEntityDialog kind="marketer" entity={m} onDone={load} trigger={<Button size="sm" variant="outline" className="gap-2"><Edit className="h-4 w-4" /> {t("owner.actions.edit")}</Button>} />
          <AdjustBalanceDialog kind="marketer" refCode={m.ref_code} onDone={load} trigger={<Button size="sm" variant="outline" className="gap-2"><DollarSign className="h-4 w-4" /> {t("owner.actions.adjust_balance")}</Button>} />
          {m.user_id && <ResetPasswordDialog userId={m.user_id} trigger={<Button size="sm" variant="outline" className="gap-2"><KeyRound className="h-4 w-4" /> {t("owner.actions.reset_password")}</Button>} />}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card className="p-4"><div className="text-xs text-muted-foreground">{t("owner.balance.available")}</div><div className="text-2xl font-bold text-accent mt-1">${Number(m.commission_balance_available).toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">{t("owner.balance.frozen")}</div><div className="text-2xl font-bold text-muted-foreground mt-1">${Number(m.commission_balance_frozen).toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">{t("owner.detail.children")}</div><div className="text-2xl font-bold mt-1">{children.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">{t("common.status")}</div><div className="mt-2"><Badge variant={m.is_active ? "default" : "secondary"}>{m.is_active ? "Active" : "Inactive"}</Badge></div></Card>
      </div>

      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">Info</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{t("common.email")}</dt><dd>{m.email ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("common.phone")}</dt><dd>{m.phone ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("common.whatsapp")}</dt><dd>{m.whatsapp ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("common.address")}</dt><dd>{m.address ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("common.country")}</dt><dd>{m.country_code ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">{t("common.currency")}</dt><dd>{m.currency_code ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Parent</dt><dd className="font-mono">{m.parent_ref_code ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Joined</dt><dd>{new Date(m.created_at).toLocaleDateString()}</dd></div>
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-3">{t("owner.detail.children")}</h2>
          {children.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <ul className="space-y-1 text-sm">
              {children.map((c) => (
                <li key={c.ref_code} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                  <Link to={c.type === "marketer" ? "/owner/marketers/$ref" : "/owner/cafeterias/$ref"} params={{ ref: c.ref_code }} className="font-mono text-accent hover:underline">{c.ref_code}</Link>
                  <span>{c.name}</span>
                  <Badge variant="outline">{c.type}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-3">{t("owner.detail.commissions")}</h2>
          {commissions.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
            <div className="overflow-x-auto"><table className="w-full text-xs"><tbody>
              {commissions.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="py-2 font-mono">{c.source_cafeteria_ref_code}</td>
                  <td className="py-2">${Number(c.amount_usd).toFixed(2)}</td>
                  <td className="py-2"><Badge variant={c.status === "available" ? "default" : "secondary"}>{c.status}</Badge></td>
                  <td className="py-2 text-muted-foreground">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody></table></div>
          )}
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-3">{t("owner.detail.withdrawals")}</h2>
        {withdrawals.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
            {withdrawals.map((w) => (
              <tr key={w.id} className="border-b border-border last:border-0">
                <td className="py-2">${Number(w.amount_usd).toFixed(2)}</td>
                <td className="py-2"><Badge>{w.status}</Badge></td>
                <td className="py-2 text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </Card>
    </DashboardShell>
  );
}
