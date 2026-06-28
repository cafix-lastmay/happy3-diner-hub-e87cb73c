// Owner-only: manage exchange rates per currency (manual update).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/exchange_rates")({ component: OwnerRates });

interface Row { code: string; name_en: string; name_ar: string; symbol: string; rate_to_usd: number | null; updated_at: string | null }

function OwnerRates() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data: curr } = await supabase.from("currencies").select("*").order("code");
    const { data: rates } = await supabase.from("exchange_rates").select("*");
    const rateMap = new Map((rates ?? []).map((r) => [r.currency_code, r]));
    setRows(((curr ?? []) as Row[]).map((c) => {
      const r = rateMap.get(c.code);
      return { ...c, rate_to_usd: r ? Number(r.rate_to_usd) : null, updated_at: r?.updated_at ?? null };
    }));
  };
  useEffect(() => { if (ready) load(); }, [ready]);

  const save = async (code: string) => {
    const v = Number(edits[code]);
    if (!v || v <= 0 || isNaN(v)) { toast.error(t("error.invalid_number")); return; }
    setBusy(code);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("exchange_rates").upsert(
      { currency_code: code, rate_to_usd: v, updated_by: u?.user?.id, updated_at: new Date().toISOString() },
      { onConflict: "currency_code" },
    );
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
    setEdits((e) => { const n = { ...e }; delete n[code]; return n; });
    load();
  };

  if (!ready) return <Redirecting />;
  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("owner.rates.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("owner.rates.desc")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" /> {t("common.refresh")}</Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">{t("common.currency")}</th>
              <th className="p-3 text-start">{t("owner.rates.current")}</th>
              <th className="p-3 text-start">{t("owner.rates.new")} (1 USD = ?)</th>
              <th className="p-3 text-start">{t("owner.rates.last_update")}</th>
              <th className="p-3 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-border">
                <td className="p-3 font-mono"><span className="font-bold">{r.code}</span> <span className="text-muted-foreground">— {r.name_en}</span></td>
                <td className="p-3">{r.rate_to_usd ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="p-3"><Input type="number" step="0.0001" min="0" placeholder={r.rate_to_usd?.toString() ?? ""} value={edits[r.code] ?? ""} onChange={(e) => setEdits({ ...edits, [r.code]: e.target.value })} className="max-w-[160px]" /></td>
                <td className="p-3 text-xs text-muted-foreground">{r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}</td>
                <td className="p-3"><Button size="sm" onClick={() => save(r.code)} disabled={busy === r.code || !edits[r.code]} className="gap-1 bg-accent text-accent-foreground hover:bg-accent/90"><Save className="h-3 w-3" /> {t("common.save")}</Button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
