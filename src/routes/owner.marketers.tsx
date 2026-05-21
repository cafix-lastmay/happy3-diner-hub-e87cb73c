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
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { exportCsv } from "@/lib/csv";
import { CreateChildDialog } from "@/components/owner/CreateChildDialog";

export const Route = createFileRoute("/owner/marketers")({ component: OwnerMarketers });

interface M {
  id: string; ref_code: string; parent_ref_code: string | null; name: string; level: number;
  country_code: string | null; currency_code: string | null;
  commission_balance_available: number; commission_balance_frozen: number;
  is_active: boolean; created_at: string; email: string | null;
}

function OwnerMarketers() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [rows, setRows] = useState<M[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    supabase.from("marketers").select("*").order("ref_code").then(({ data }) => setRows((data ?? []) as M[]));
  }, []);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const status = r.is_active ? "active" : "inactive";
      return [r.ref_code, r.name, r.country_code, r.currency_code, status, String(r.level)]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(s));
    });
  }, [rows, q]);

  const onExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    exportCsv(`marketers-${today}.csv`, filtered.map((r) => ({
      ref_code: r.ref_code,
      name: r.name,
      email: r.email ?? "",
      level: r.level,
      country: r.country_code ?? "",
      currency: r.currency_code ?? "",
      commission_available_usd: Number(r.commission_balance_available).toFixed(2),
      commission_frozen_usd: Number(r.commission_balance_frozen).toFixed(2),
      status: r.is_active ? "active" : "inactive",
      creation_date: r.created_at,
      report_date: new Date().toISOString(),
    })));
  };

  if (!ready) return null;
  const navItems = ownerNavItems(t);

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={navItems}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("owner.nav.marketers")}</h1>
        <div className="flex gap-2">
          <CreateChildDialog entityType="marketer" onDone={load} trigger={
            <Button size="sm" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="h-4 w-4" />{t("owner.create.marketer")}</Button>
          } />
          <Button onClick={onExport} variant="outline" size="sm" className="gap-2"><Download className="h-4 w-4" />{t("common.export_csv")}</Button>
        </div>
      </div>
      <div className="mb-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search_placeholder")} />
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-start">
            <tr className="text-start">
              <th className="p-3 text-start">{t("common.ref_code")}</th>
              <th className="p-3 text-start">{t("common.name")}</th>
              <th className="p-3 text-start">Level</th>
              <th className="p-3 text-start">{t("common.country")}</th>
              <th className="p-3 text-start">{t("marketer.balance.available")}</th>
              <th className="p-3 text-start">{t("marketer.balance.frozen")}</th>
              <th className="p-3 text-start">{t("common.status")}</th>
              <th className="p-3 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 font-mono">{r.ref_code}</td>
                <td className="p-3">{r.name}</td>
                <td className="p-3">{r.level}</td>
                <td className="p-3">{r.country_code ?? "—"}</td>
                <td className="p-3">${Number(r.commission_balance_available).toFixed(2)}</td>
                <td className="p-3">${Number(r.commission_balance_frozen).toFixed(2)}</td>
                <td className="p-3"><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Inactive"}</Badge></td>
                <td className="p-3"><Link to="/owner/marketers/$ref" params={{ ref: r.ref_code }}><Button size="sm" variant="outline">{t("owner.actions.view_details")}</Button></Link></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
