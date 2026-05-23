// Owner-only: assign custom free-trial (grace) periods to specific cafeterias by ref_code.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, Download } from "lucide-react";
import * as XLSX from "xlsx";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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

  const downloadTemplate = () => {
    const sample = [
      { cafeteria_ref_code: "10B01", grace_period_days: 30, end_date: "", note: "Example: use days OR end_date" },
      { cafeteria_ref_code: "10B02", grace_period_days: "", end_date: "2026-12-31", note: "" },
    ];
    const ws = XLSX.utils.json_to_sheet(sample, { header: ["cafeteria_ref_code", "grace_period_days", "end_date", "note"] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "grace_periods");
    XLSX.writeFile(wb, "grace_periods_template.xlsx");
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      const today = new Date().toISOString().slice(0, 10);
      const { data: u } = await supabase.auth.getUser();
      const uid = u?.user?.id;
      let ok = 0;
      const errors: string[] = [];

      for (const raw of json) {
        const ref = String(raw.cafeteria_ref_code ?? "").trim();
        if (!ref) continue;
        let days = Number(raw.grace_period_days);
        const endVal = raw.end_date ? String(raw.end_date).trim() : "";
        if ((!days || days <= 0) && endVal) {
          // Compute days from end_date (XLSX may give a number serial; coerce to string date)
          let endStr = endVal;
          if (/^\d+$/.test(endStr)) {
            // Excel serial date
            const d = XLSX.SSF.parse_date_code(Number(endStr));
            if (d) endStr = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
          }
          const endMs = new Date(endStr).getTime();
          if (Number.isFinite(endMs)) {
            days = Math.ceil((endMs - new Date(today).getTime()) / 86400000);
          }
        }
        if (!days || days <= 0) { errors.push(`${ref}: invalid days/end_date`); continue; }
        // Replace existing rows for this cafe (idempotent bulk semantics)
        await supabase.from("custom_grace_periods").delete().eq("cafeteria_ref_code", ref);
        const { error } = await supabase.from("custom_grace_periods").insert({
          cafeteria_ref_code: ref,
          start_date: today,
          days,
          note: raw.note ? String(raw.note) : null,
          created_by: uid,
        });
        if (error) errors.push(`${ref}: ${error.message}`);
        else ok++;
      }
      toast.success(`Updated grace periods for ${ok} cafeteria(s)${errors.length ? ` — ${errors.length} failed` : ""}`);
      if (errors.length) console.warn("[grace upload] errors", errors);
      load();
    } catch (e) {
      console.error(e);
      toast.error("Failed to parse Excel file");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };


  const today = new Date().toISOString().slice(0, 10);

  if (!ready) return null;
  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}>
      <h1 className="text-2xl font-bold mb-2">{t("owner.grace_periods.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("owner.grace_periods.desc")}</p>

      <Card className="p-6 mb-6 max-w-3xl">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Upload className="h-4 w-4" /> Bulk upload (Excel)</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Upload an .xlsx with columns: <code className="font-mono">cafeteria_ref_code</code>, <code className="font-mono">grace_period_days</code> or <code className="font-mono">end_date</code> (YYYY-MM-DD), optional <code className="font-mono">note</code>. Existing grace periods for listed cafeterias are replaced.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate} className="gap-2"><Download className="h-4 w-4" /> Download template</Button>
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload Excel"}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
        </div>
      </Card>

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
