import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { exportCsv } from "@/lib/csv";
import { CreateChildDialog } from "@/components/owner/CreateChildDialog";
import { SuspendCafeteriaDialog } from "@/components/owner/SuspendCafeteriaDialog";

export const Route = createFileRoute("/owner/cafeterias")({ component: OwnerCafeterias });

interface C {
  id: string; ref_code: string; parent_ref_code: string; name: string;
  country_code: string | null; currency_code: string | null;
  points_balance: number; is_active: boolean;
  created_at: string; email: string | null;
  free_trial_until: string | null; trial_consumed: boolean;
  is_suspended: boolean; suspension_reason: string | null;
}

function OwnerCafeterias() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [rows, setRows] = useState<C[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    supabase.from("cafeterias").select("*").order("ref_code").then(({ data }) => setRows((data ?? []) as C[]));
  }, []);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const status = r.is_active ? "active" : "inactive";
      return [r.ref_code, r.name, r.country_code, r.currency_code, status, String(r.points_balance)]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
    });
  }, [rows, q]);

  const onExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    exportCsv(`cafeterias-${today}.csv`, filtered.map((r) => {
      const trialActive = r.free_trial_until && !r.trial_consumed && new Date(r.free_trial_until) > new Date();
      return {
        ref_code: r.ref_code,
        name: r.name,
        email: r.email ?? "",
        country: r.country_code ?? "",
        currency: r.currency_code ?? "",
        points_balance: Number(r.points_balance).toFixed(2),
        trial_end: r.free_trial_until ?? "",
        trial_active: trialActive ? "yes" : "no",
        status: r.is_active ? "active" : "inactive",
        creation_date: r.created_at,
        report_date: new Date().toISOString(),
      };
    }));
  };

  if (!ready) return <Redirecting />;
  const navItems = ownerNavItems(t);

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={navItems}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("owner.nav.cafeterias")}</h1>
        <div className="flex gap-2">
          <CreateChildDialog entityType="cafeteria" onDone={load} trigger={
            <Button size="sm" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="h-4 w-4" />{t("owner.create.cafeteria")}</Button>
          } />
          <Button onClick={onExport} variant="outline" size="sm" className="gap-2"><Download className="h-4 w-4" />{t("common.export_csv")}</Button>
        </div>
      </div>
      <div className="mb-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search_placeholder")} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">{t("common.ref_code")}</th>
              <th className="p-3 text-start">{t("common.name")}</th>
              <th className="p-3 text-start">Parent</th>
              <th className="p-3 text-start">{t("common.country")}</th>
              <th className="p-3 text-start">{t("common.currency")}</th>
              <th className="p-3 text-start">Points</th>
              <th className="p-3 text-start">{t("owner.trial_end")}</th>
              <th className="p-3 text-start">{t("common.status")}</th>
              <th className="p-3 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const trialEnd = r.free_trial_until ? new Date(r.free_trial_until) : null;
              const trialActive = trialEnd && !r.trial_consumed && trialEnd > new Date();
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 font-mono">{r.ref_code}</td>
                  <td className="p-3">{r.name}</td>
                  <td className="p-3 font-mono text-muted-foreground">{r.parent_ref_code}</td>
                  <td className="p-3">{r.country_code ?? "—"}</td>
                  <td className="p-3">{r.currency_code ?? "—"}</td>
                  <td className="p-3">{Number(r.points_balance).toFixed(2)}</td>
                  <td className="p-3 text-xs">
                    {trialEnd ? (
                      <span className={trialActive ? "text-accent" : "text-muted-foreground"}>
                        {trialEnd.toISOString().slice(0, 10)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="p-3"><Badge variant={r.is_suspended ? "destructive" : (r.is_active ? "default" : "secondary")}>{r.is_suspended ? "موقوفة" : (r.is_active ? "Active" : "Inactive")}</Badge></td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Link to="/owner/cafeterias/$ref" params={{ ref: r.ref_code }}><Button size="sm" variant="outline">{t("owner.actions.view_details")}</Button></Link>
                      <SuspendCafeteriaDialog
                        refCode={r.ref_code}
                        isSuspended={r.is_suspended}
                        currentReason={r.suspension_reason}
                        onDone={load}
                        trigger={<Button size="sm" className={r.is_suspended ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}>{r.is_suspended ? "تفعيل" : "إيقاف"}</Button>}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
