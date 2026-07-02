// Owner-only: manage daily points consumption caps (global / country / per-cafeteria).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/points_caps")({ component: OwnerCaps });

type Scope = "global" | "country" | "cafeteria";
interface CapRow {
  id: string;
  scope: Scope;
  cafeteria_id: string | null;
  cafeteria_ref_code: string | null;
  cafeteria_name: string | null;
  country_code: string | null;
  country_name: string | null;
  daily_cap: number | null;
  is_active: boolean;
  updated_at: string;
}
interface Cafe { id: string; ref_code: string; name: string; country_code: string | null }
interface Country { code: string; name_ar: string }

function OwnerCaps() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [rows, setRows] = useState<CapRow[]>([]);
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [scope, setScope] = useState<Scope>("global");
  const [cafeId, setCafeId] = useState<string>("");
  const [countryCode, setCountryCode] = useState<string>("");
  const [dailyCap, setDailyCap] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState<string>("");

  const load = async () => {
    const [caps, cf, co] = await Promise.all([
      supabase.rpc("owner_list_daily_caps"),
      supabase.from("cafeterias").select("id,ref_code,name,country_code").order("name"),
      supabase.from("countries").select("code,name_ar").order("name_ar"),
    ]);
    setRows(((caps.data ?? []) as unknown as CapRow[]));
    setCafes(((cf.data ?? []) as Cafe[]));
    setCountries(((co.data ?? []) as Country[]));
  };
  useEffect(() => { if (ready) load(); }, [ready]);

  const reset = () => {
    setScope("global"); setCafeId(""); setCountryCode(""); setDailyCap(""); setEditing(null);
  };

  const submit = async () => {
    const capNum = dailyCap.trim() === "" ? null : Number(dailyCap);
    if (capNum !== null && (!Number.isFinite(capNum) || capNum < 0)) {
      toast.error("قيمة الحد غير صالحة"); return;
    }
    if (scope === "cafeteria" && !cafeId) { toast.error("اختر كافيه"); return; }
    if (scope === "country" && !countryCode) { toast.error("اختر دولة"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("owner_upsert_daily_cap", {
      _cafeteria_id: (scope === "cafeteria" ? cafeId : null) as unknown as string,
      _country_code: (scope === "country" ? countryCode : null) as unknown as string,
      _daily_cap: capNum as unknown as number,
      _is_active: true,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
    reset();
    load();
  };

  const del = async (id: string) => {
    if (!confirm(t("common.confirm_delete") || "حذف؟")) return;
    const { error } = await supabase.rpc("owner_delete_daily_cap", { _id: id });
    if (error) { toast.error(error.message); return; }
    load();
  };

  const startEdit = (r: CapRow) => {
    setEditing(r.id);
    setScope(r.scope);
    setCafeId(r.cafeteria_id ?? "");
    setCountryCode(r.country_code ?? "");
    setDailyCap(r.daily_cap == null ? "" : String(r.daily_cap));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cafesInSelectedCountry = useMemo(() => {
    if (!countryFilter) return [] as Cafe[];
    return cafes.filter((c) => c.country_code === countryFilter);
  }, [cafes, countryFilter]);

  const overridesForCountry = useMemo(() => {
    if (!countryFilter) return new Map<string, CapRow>();
    const m = new Map<string, CapRow>();
    rows.filter((r) => r.scope === "cafeteria" && r.cafeteria_id).forEach((r) => m.set(r.cafeteria_id!, r));
    return m;
  }, [rows, countryFilter]);

  if (!ready) return <Redirecting />;

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}>
      <h1 className="text-2xl font-bold mb-2">حدود استهلاك النقاط اليومية</h1>
      <p className="text-sm text-muted-foreground mb-6">
        اضبط حداً أقصى يومياً لخصم النقاط لكل كافيه، أو على مستوى الدولة، أو للجميع.
        الأولوية: كافيه فردي ← الدولة ← عام. عند تجاوز الحد يُحفظ الطلب مدفوعاً بدون خصم.
      </p>

      <Card className="p-6 mb-6 max-w-3xl">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          {editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editing ? "تعديل الحد" : "إضافة حد جديد"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>النطاق *</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as Scope)} disabled={!!editing}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="global">الجميع</SelectItem>
                <SelectItem value="country">دولة محددة</SelectItem>
                <SelectItem value="cafeteria">كافيه محدد</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "cafeteria" && (
            <div className="space-y-1">
              <Label>الكافيه *</Label>
              <Select value={cafeId} onValueChange={setCafeId} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="اختر…" /></SelectTrigger>
                <SelectContent>
                  {cafes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.ref_code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {scope === "country" && (
            <div className="space-y-1">
              <Label>الدولة *</Label>
              <Select value={countryCode} onValueChange={setCountryCode} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="اختر…" /></SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name_ar} ({c.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>الحد اليومي (نقاط)</Label>
            <Input
              type="number" min="0" placeholder="اتركه فارغاً = بلا حد"
              value={dailyCap} onChange={(e) => setDailyCap(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">اتركه فارغاً لإلغاء الحد لهذا النطاق.</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {editing && <Button variant="ghost" onClick={reset}>إلغاء</Button>}
          <Button onClick={submit} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {busy ? t("common.loading") : editing ? t("common.save") : t("common.create")}
          </Button>
        </div>
      </Card>

      <Card className="overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">النطاق</th>
              <th className="p-3 text-start">التفاصيل</th>
              <th className="p-3 text-start">الحد اليومي</th>
              <th className="p-3 text-start">الحالة</th>
              <th className="p-3 text-start">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">
                  <Badge variant={r.scope === "cafeteria" ? "default" : r.scope === "country" ? "secondary" : "outline"}>
                    {r.scope === "cafeteria" ? "كافيه" : r.scope === "country" ? "دولة" : "عام"}
                  </Badge>
                </td>
                <td className="p-3">
                  {r.scope === "cafeteria"
                    ? <>{r.cafeteria_name} <span className="text-muted-foreground font-mono">({r.cafeteria_ref_code})</span></>
                    : r.scope === "country"
                      ? <>{r.country_name} <span className="text-muted-foreground font-mono">({r.country_code})</span></>
                      : "جميع الكافيهات"}
                </td>
                <td className="p-3 font-mono">{r.daily_cap == null ? "بلا حد" : r.daily_cap.toLocaleString()}</td>
                <td className="p-3">
                  <Badge variant={r.is_active ? "default" : "outline"}>{r.is_active ? "مفعّل" : "معطّل"}</Badge>
                </td>
                <td className="p-3 flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد إعدادات بعد</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-3">كافيهات دولة محددة</h2>
        <p className="text-xs text-muted-foreground mb-3">
          اختر دولة لعرض كافيهاتها. الإعداد الفردي لأي كافيه يتغلب على إعداد الدولة.
        </p>
        <div className="max-w-xs mb-4">
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger><SelectValue placeholder="اختر دولة…" /></SelectTrigger>
            <SelectContent>
              {countries.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.name_ar} ({c.code})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {countryFilter && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-3 text-start">الكافيه</th>
                  <th className="p-3 text-start">إعداد فردي</th>
                  <th className="p-3 text-start">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {cafesInSelectedCountry.map((c) => {
                  const ov = overridesForCountry.get(c.id);
                  return (
                    <tr key={c.id} className="border-t border-border">
                      <td className="p-3">{c.name} <span className="text-muted-foreground font-mono">({c.ref_code})</span></td>
                      <td className="p-3 font-mono">
                        {ov ? (ov.daily_cap == null ? "بلا حد (فردي)" : ov.daily_cap.toLocaleString()) : <span className="text-muted-foreground">— يتبع الدولة</span>}
                      </td>
                      <td className="p-3">
                        <Button size="sm" variant="outline" onClick={() => {
                          setScope("cafeteria"); setCafeId(c.id);
                          setDailyCap(ov?.daily_cap == null ? "" : String(ov.daily_cap));
                          setEditing(ov?.id ?? null);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}>
                          {ov ? "تعديل الفردي" : "إضافة فردي"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {cafesInSelectedCountry.length === 0 && (
                  <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">لا توجد كافيهات في هذه الدولة</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </DashboardShell>
  );
}
