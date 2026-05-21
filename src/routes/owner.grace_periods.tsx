// Owner-only: assign custom free-trial (grace) periods to specific cafeterias by ref_code.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/grace_periods")({ component: OwnerGrace });

interface Row { id: string; cafeteria_ref_code: string; start_date: string; days: number; note: string | null; created_at: string }

function OwnerGrace() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [rows, setRows] = useState<Row[]>([]);
  const [form, setForm] = useState({ cafeteria_ref_code: "", start_date: new Date().toISOString().slice(0, 10), days: 14, note: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("custom_grace_periods").select("*").order("start_date", { ascending: false });
    setRows((data ?? []) as Row[]);
  };
  useEffect(() => { if (ready) load(); }, [ready]);

  const add = async () => {
    if (!form.cafeteria_ref_code || !form.days || form.days <= 0) { toast.error(t("error.required_field")); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("custom_grace_periods").insert({ ...form, created_by: u?.user?.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
    setForm({ cafeteria_ref_code: "", start_date: new Date().toISOString().slice(0, 10), days: 14, note: "" });
    load();
  };
  const del = async (id: string) => {
    if (!confirm(t("common.confirm_delete"))) return;
    await supabase.from("custom_grace_periods").delete().eq("id", id);
    load();
  };

  const today = new Date().toISOString().slice(0, 10);

  if (!ready) return null;
  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}>
      <h1 className="text-2xl font-bold mb-2">{t("owner.grace_periods.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("owner.grace_periods.desc")}</p>

      <Card className="p-6 mb-6 max-w-3xl">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><Plus className="h-4 w-4" /> {t("owner.grace_periods.add")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>{t("common.ref_code")} *</Label><Input value={form.cafeteria_ref_code} onChange={(e) => setForm({ ...form, cafeteria_ref_code: e.target.value.trim() })} placeholder="10B0001" className="font-mono" /></div>
          <div className="space-y-1"><Label>{t("owner.grace_periods.start_date")} *</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
          <div className="space-y-1"><Label>{t("owner.grace_periods.days")} *</Label><Input type="number" min="1" max="365" value={form.days} onChange={(e) => setForm({ ...form, days: Number(e.target.value) })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>{t("common.notes")}</Label><Textarea rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={add} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">{busy ? t("common.loading") : t("common.create")}</Button>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">{t("common.ref_code")}</th>
              <th className="p-3 text-start">{t("owner.grace_periods.start_date")}</th>
              <th className="p-3 text-start">{t("owner.grace_periods.days")}</th>
              <th className="p-3 text-start">{t("common.status")}</th>
              <th className="p-3 text-start">{t("common.notes")}</th>
              <th className="p-3 text-start">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const end = new Date(r.start_date); end.setDate(end.getDate() + r.days);
              const endStr = end.toISOString().slice(0, 10);
              const isActive = r.start_date <= today && endStr > today;
              const isFuture = r.start_date > today;
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3 font-mono">{r.cafeteria_ref_code}</td>
                  <td className="p-3">{r.start_date}</td>
                  <td className="p-3">{r.days} → {endStr}</td>
                  <td className="p-3"><Badge variant={isActive ? "default" : isFuture ? "secondary" : "outline"}>{isActive ? t("owner.grace_periods.active") : isFuture ? t("owner.grace_periods.scheduled") : t("owner.grace_periods.ended")}</Badge></td>
                  <td className="p-3 text-muted-foreground text-xs max-w-[200px] truncate">{r.note ?? "—"}</td>
                  <td className="p-3"><Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
