import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Wallet, History, BookOpen, QrCode, Users, ClipboardList, Settings as SettingsIcon, Upload, BarChart3 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

export const Route = createFileRoute("/cafeteria/settings")({ component: CafeSettings });

interface CafeRow {
  ref_code: string;
  name: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  logo_url: string | null;
  menu_header_url: string | null;
  menu_footer_url: string | null;
  banner_url: string | null;
}

function CafeSettings() {
  const { t } = useI18n();
  const { ready } = useRequireRole("cafeteria_admin");
  const { user } = useAuth();
  const [row, setRow] = useState<CafeRow | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", whatsapp: "" });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    supabase
      .from("cafeterias")
      .select("ref_code,name,address,phone,whatsapp,logo_url,menu_header_url,menu_footer_url,banner_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setRow(data as CafeRow);
          setForm({ name: data.name, address: data.address ?? "", phone: data.phone ?? "", whatsapp: data.whatsapp ?? "" });
        }
      });
  }, [ready, user]);

  const save = async () => {
    if (!row) return;
    if (!form.name.trim()) { toast.error(t("error.required_field")); return; }
    setBusy(true);
    const { error } = await supabase.from("cafeterias").update({
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
    }).eq("ref_code", row.ref_code);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
  };

  const onLogoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !row) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${row.ref_code}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("cafeteria-logos").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setUploading(false); toast.error(upErr.message); return; }
    const { data: pub } = supabase.storage.from("cafeteria-logos").getPublicUrl(path);
    const { error: updErr } = await supabase.from("cafeterias").update({ logo_url: pub.publicUrl }).eq("ref_code", row.ref_code);
    setUploading(false);
    if (updErr) { toast.error(updErr.message); return; }
    setRow({ ...row, logo_url: pub.publicUrl });
    toast.success(t("common.success"));
  };

  // Upload helper for menu header/footer (reuses cafeteria-logos public bucket)
  const onBrandingSelected = async (e: React.ChangeEvent<HTMLInputElement>, kind: "menu_header_url" | "menu_footer_url") => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !row) return;
    if (file.size > 3 * 1024 * 1024) { toast.error("Max 3MB"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${row.ref_code}/${kind}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("cafeteria-logos").upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setUploading(false); toast.error(upErr.message); return; }
    const { data: pub } = supabase.storage.from("cafeteria-logos").getPublicUrl(path);
    const payload = (kind === "menu_header_url" ? { menu_header_url: pub.publicUrl } : { menu_footer_url: pub.publicUrl });
    const { error: updErr } = await supabase.from("cafeterias").update(payload).eq("ref_code", row.ref_code);
    setUploading(false);
    if (updErr) { toast.error(updErr.message); return; }
    setRow({ ...row, [kind]: pub.publicUrl });
    toast.success(t("common.success"));
  };

  const removeBranding = async (kind: "menu_header_url" | "menu_footer_url") => {
    if (!row) return;
    const payload = (kind === "menu_header_url" ? { menu_header_url: null } : { menu_footer_url: null });
    const { error } = await supabase.from("cafeterias").update(payload).eq("ref_code", row.ref_code);
    if (error) { toast.error(error.message); return; }
    setRow({ ...row, [kind]: null });
  };

  if (!ready) return null;
  const navItems = [
    { to: "/cafeteria", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/cafeteria/menu", label: t("cafeteria.nav.menu"), icon: BookOpen },
    { to: "/cafeteria/tables", label: t("cafeteria.nav.tables"), icon: QrCode },
    { to: "/cafeteria/staff", label: t("cafeteria.nav.staff"), icon: Users },
    { to: "/cafeteria/orders", label: t("cafeteria.nav.orders"), icon: ClipboardList },
    { to: "/cafeteria/reports", label: t("cafeteria.nav.reports"), icon: BarChart3 },
    { to: "/cafeteria/recharge", label: t("cafeteria.nav.recharge"), icon: Wallet },
    { to: "/cafeteria/history", label: t("cafeteria.nav.history"), icon: History },
    { to: "/cafeteria/settings", label: t("cafeteria.nav.settings"), icon: SettingsIcon },
  ];

  return (
    <DashboardShell title={t("cafeteria.dashboard.title")} navItems={navItems.filter((n) => n.to !== "/cafeteria")} showTrialCard>
      <h1 className="text-2xl font-bold mb-6">{t("cafeteria.settings.title")}</h1>

      <Card className="p-6 max-w-xl mb-6">
        <Label className="mb-2 block">{t("cafeteria.settings.logo")}</Label>
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden">
            {row?.logo_url ? <img src={row.logo_url} alt="logo" className="h-full w-full object-cover" /> : <span className="text-xs text-muted-foreground">—</span>}
          </div>
          <div>
            <input id="logo-input" type="file" accept="image/*" className="hidden" onChange={onLogoSelected} />
            <Button type="button" variant="outline" disabled={uploading} onClick={() => document.getElementById("logo-input")?.click()}>
              <Upload className="h-4 w-4" /> {uploading ? t("common.loading") : t("cafeteria.settings.upload_logo")}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">PNG/JPG · Max 2MB</p>
          </div>
        </div>
      </Card>

      {/* Menu branding: header & footer images shown on customer QR menu page */}
      <Card className="p-6 max-w-xl mb-6 space-y-4">
        {(["menu_header_url", "menu_footer_url"] as const).map((kind) => {
          const url = row?.[kind];
          const isHeader = kind === "menu_header_url";
          return (
            <div key={kind}>
              <Label className="mb-2 block">{isHeader ? t("menu.header_image") : t("menu.footer_image")}</Label>
              <p className="text-xs text-muted-foreground mb-2">{isHeader ? t("menu.header_hint") : t("menu.footer_hint")}</p>
              <div className="flex items-center gap-3">
                <div className="h-20 w-40 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center">
                  {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-muted-foreground">—</span>}
                </div>
                <div className="flex flex-col gap-1">
                  <input id={`brand-${kind}`} type="file" accept="image/*" className="hidden" onChange={(e) => onBrandingSelected(e, kind)} />
                  <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => document.getElementById(`brand-${kind}`)?.click()}>
                    <Upload className="h-3 w-3" /> {uploading ? t("common.loading") : t("cafeteria.settings.upload_logo")}
                  </Button>
                  {url && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeBranding(kind)}>
                      {t("menu.image_remove")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </Card>

      <Card className="p-6 max-w-xl space-y-4">
        <div>
          <Label>{t("common.cafeteria_name")} *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>{t("common.address")}</Label>
          <Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} />
        </div>
        <div>
          <Label>{t("common.phone")}</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <Label>{t("common.whatsapp")}</Label>
          <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {busy ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      </Card>

      {row && <ExtendedSettings refCode={row.ref_code} />}
    </DashboardShell>
  );
}

const DAYS = ["sun","mon","tue","wed","thu","fri","sat"] as const;
type Day = typeof DAYS[number];
interface DayHours { open: boolean; from: string; to: string }
type OpeningHours = Record<Day, DayHours>;

interface ExtRow {
  tax_percent: number;
  service_percent: number;
  tax_apply_dine_in: boolean;
  tax_apply_takeaway: boolean;
  tax_apply_delivery: boolean;
  mode_dine_in: boolean;
  mode_takeaway: boolean;
  mode_delivery: boolean;
  auto_approve_shifts: boolean;
  payment_instructions: string | null;
  bank_details: string | null;
  google_maps_url: string | null;
  opening_hours: OpeningHours;
  estimated_delivery_minutes: number;
  delivery_fee_a_name: string | null;
  delivery_fee_a_amount: number;
  delivery_fee_b_name: string | null;
  delivery_fee_b_amount: number;
  delivery_fee_c_name: string | null;
  delivery_fee_c_amount: number;
}

const EXT_COLS = "tax_percent,service_percent,tax_apply_dine_in,tax_apply_takeaway,tax_apply_delivery,mode_dine_in,mode_takeaway,mode_delivery,auto_approve_shifts,google_maps_url,opening_hours,estimated_delivery_minutes,delivery_fee_a_name,delivery_fee_a_amount,delivery_fee_b_name,delivery_fee_b_amount,delivery_fee_c_name,delivery_fee_c_amount";

function ExtendedSettings({ refCode }: { refCode: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<ExtRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: pay }] = await Promise.all([
        supabase.from("cafeterias").select(EXT_COLS).eq("ref_code", refCode).maybeSingle(),
        supabase.from("cafeteria_payment_info").select("bank_details,payment_instructions").eq("cafeteria_ref_code", refCode).maybeSingle(),
      ]);
      if (d) {
        const dd = d as unknown as Record<string, unknown>;
        setData({
          ...(dd as unknown as ExtRow),
          payment_instructions: (pay?.payment_instructions ?? null) as string | null,
          bank_details: (pay?.bank_details ?? null) as string | null,
          mode_dine_in: dd.mode_dine_in == null ? true : !!dd.mode_dine_in,
          mode_takeaway: !!dd.mode_takeaway,
          mode_delivery: !!dd.mode_delivery,
          tax_apply_dine_in: dd.tax_apply_dine_in == null ? true : !!dd.tax_apply_dine_in,
          tax_apply_takeaway: !!dd.tax_apply_takeaway,
          tax_apply_delivery: !!dd.tax_apply_delivery,
          auto_approve_shifts: dd.auto_approve_shifts == null ? true : !!dd.auto_approve_shifts,
          estimated_delivery_minutes: Number(dd.estimated_delivery_minutes ?? 30),
          delivery_fee_a_amount: Number(dd.delivery_fee_a_amount ?? 0),
          delivery_fee_b_amount: Number(dd.delivery_fee_b_amount ?? 0),
          delivery_fee_c_amount: Number(dd.delivery_fee_c_amount ?? 0),
        });
      }
    })();
  }, [refCode]);

  if (!data) return null;
  const update = <K extends keyof ExtRow>(k: K, v: ExtRow[K]) => setData({ ...data, [k]: v });
  const updateDay = (d: Day, patch: Partial<DayHours>) => {
    setData({ ...data, opening_hours: { ...data.opening_hours, [d]: { ...data.opening_hours[d], ...patch } } });
  };

  const save = async () => {
    setBusy(true);
    const payload = {
      tax_percent: Number(data.tax_percent) || 0,
      service_percent: Number(data.service_percent) || 0,
      tax_apply_dine_in: !!data.tax_apply_dine_in,
      tax_apply_takeaway: !!data.tax_apply_takeaway,
      tax_apply_delivery: !!data.tax_apply_delivery,
      mode_dine_in: !!data.mode_dine_in,
      mode_takeaway: !!data.mode_takeaway,
      mode_delivery: !!data.mode_delivery,
      auto_approve_shifts: !!data.auto_approve_shifts,
      google_maps_url: data.google_maps_url,
      opening_hours: JSON.parse(JSON.stringify(data.opening_hours)),
      estimated_delivery_minutes: Math.max(0, Number(data.estimated_delivery_minutes) || 0),
      delivery_fee_a_name: data.delivery_fee_a_name?.trim() || null,
      delivery_fee_a_amount: Number(data.delivery_fee_a_amount) || 0,
      delivery_fee_b_name: data.delivery_fee_b_name?.trim() || null,
      delivery_fee_b_amount: Number(data.delivery_fee_b_amount) || 0,
      delivery_fee_c_name: data.delivery_fee_c_name?.trim() || null,
      delivery_fee_c_amount: Number(data.delivery_fee_c_amount) || 0,
    };
    const [{ data: saved, error }, { error: payErr }] = await Promise.all([
      supabase.from("cafeterias").update(payload).eq("ref_code", refCode).select(EXT_COLS).maybeSingle(),
      supabase.from("cafeteria_payment_info").upsert({
        cafeteria_ref_code: refCode,
        payment_instructions: data.payment_instructions,
        bank_details: data.bank_details,
      }, { onConflict: "cafeteria_ref_code" }),
    ]);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (payErr) { toast.error(payErr.message); return; }
    if (!saved) { toast.error(t("settings.save_failed")); return; }
    setData({ ...data, ...(saved as unknown as Partial<ExtRow>) });
    toast.success(t("settings.save_success"));
  };

  return (
    <div className="mt-6 space-y-6 max-w-xl">
      {/* Maps URL */}
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold">{t("settings.section.info")}</h2>
        <Label>{t("settings.maps_url")}</Label>
        <Input
          value={data.google_maps_url ?? ""}
          onChange={(e) => update("google_maps_url", e.target.value)}
          placeholder="https://maps.google.com/..."
          dir="ltr"
        />
      </Card>

      {/* Tax & Service */}
      <Card className="p-6 space-y-4">
        <h2 className="font-semibold">{t("settings.section.tax")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("settings.tax_percent")}</Label>
            <Input type="number" min={0} max={100} step={0.01}
              value={data.tax_percent}
              onChange={(e) => update("tax_percent", Number(e.target.value) || 0)} />
          </div>
          <div>
            <Label>{t("settings.service_percent")}</Label>
            <Input type="number" min={0} max={100} step={0.01}
              value={data.service_percent}
              onChange={(e) => update("service_percent", Number(e.target.value) || 0)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("settings.tax_apply")}</Label>
          {([
            ["tax_apply_dine_in", "settings.mode.dine_in"],
            ["tax_apply_takeaway", "settings.mode.takeaway"],
            ["tax_apply_delivery", "settings.mode.delivery"],
          ] as const).map(([k, lbl]) => (
            <div key={k} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="text-sm">{t(lbl)}</span>
              <Switch checked={data[k]} onCheckedChange={(v) => update(k, v)} />
            </div>
          ))}
        </div>
      </Card>

      {/* Order Modes */}
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">{t("settings.section.modes")}</h2>
        {([
          ["mode_dine_in", "settings.mode.dine_in"],
          ["mode_takeaway", "settings.mode.takeaway"],
          ["mode_delivery", "settings.mode.delivery"],
        ] as const).map(([k, lbl]) => (
          <div key={k} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="text-sm">{t(lbl)}</span>
            <Switch checked={!!data[k]} onCheckedChange={(v) => update(k, v)} />
          </div>
        ))}
      </Card>

      {/* Take Away QR */}
      {data.mode_takeaway && <TakeawayQrCard refCode={refCode} />}

      {data.mode_delivery && (
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">{t("settings.section.delivery")}</h2>
          <div>
            <Label>{t("settings.estimated_delivery_minutes")}</Label>
            <Input type="number" min={0} max={240} step={1}
              value={data.estimated_delivery_minutes}
              onChange={(e) => update("estimated_delivery_minutes", Math.max(0, Number(e.target.value) || 0))} />
          </div>
          <div className="space-y-3">
            <Label>{t("settings.delivery_fees")}</Label>
            {(["a","b","c"] as const).map((lvl) => {
              const nameKey = `delivery_fee_${lvl}_name` as const;
              const amtKey = `delivery_fee_${lvl}_amount` as const;
              return (
                <div key={lvl} className="grid grid-cols-[1fr_120px] gap-2 items-end">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("settings.fee_level")} {lvl.toUpperCase()} — {t("settings.fee_name")}</Label>
                    <Input value={(data[nameKey] as string | null) ?? ""}
                      placeholder={t("settings.fee_name_placeholder")}
                      onChange={(e) => update(nameKey, e.target.value as never)} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t("settings.fee_amount")}</Label>
                    <Input type="number" min={0} step="0.01"
                      value={data[amtKey] as number}
                      onChange={(e) => update(amtKey, (Number(e.target.value) || 0) as never)} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Shifts */}
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">{t("settings.section.shifts")}</h2>
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <div>
            <div className="text-sm font-medium">{t("settings.auto_approve_shifts")}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("settings.auto_approve_shifts_hint")}</p>
          </div>
          <Switch checked={!!data.auto_approve_shifts} onCheckedChange={(v) => update("auto_approve_shifts", v)} />
        </div>
      </Card>

      {/* Payment */}
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">{t("settings.section.payment")}</h2>
        <div>
          <Label>{t("settings.payment_instructions")}</Label>
          <Textarea rows={3}
            value={data.payment_instructions ?? ""}
            onChange={(e) => update("payment_instructions", e.target.value)} />
        </div>
        <div>
          <Label>{t("settings.bank_details")}</Label>
          <Textarea rows={3}
            value={data.bank_details ?? ""}
            onChange={(e) => update("bank_details", e.target.value)} />
        </div>
      </Card>

      {/* Opening Hours */}
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold">{t("settings.section.hours")}</h2>
        <div className="space-y-2">
          {DAYS.map((d) => {
            const h = data.opening_hours[d];
            return (
              <div key={d} className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2">
                <span className="w-20 text-sm font-medium">{t(`settings.day.${d}`)}</span>
                <Switch checked={h.open} onCheckedChange={(v) => updateDay(d, { open: v })} />
                <span className="text-xs text-muted-foreground w-12">{h.open ? t("settings.open") : t("settings.closed")}</span>
                <div className="flex items-center gap-1 ms-auto">
                  <Input type="time" className="w-28" disabled={!h.open}
                    value={h.from}
                    onChange={(e) => updateDay(d, { from: e.target.value })} />
                  <span className="text-xs text-muted-foreground">—</span>
                  <Input type="time" className="w-28" disabled={!h.open}
                    value={h.to}
                    onChange={(e) => updateDay(d, { to: e.target.value })} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
          {busy ? t("common.loading") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}


function TakeawayQrCard({ refCode }: { refCode: string }) {
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("cafeterias").select("takeaway_qr_token").eq("ref_code", refCode).maybeSingle();
      setToken((data as { takeaway_qr_token: string } | null)?.takeaway_qr_token ?? null);
    })();
  }, [refCode]);
  if (!token) return null;
  const url = typeof window !== "undefined" ? `${window.location.origin}/t/${token}` : `/t/${token}`;
  const pickupUrl = typeof window !== "undefined" ? `${window.location.origin}/pickup/${refCode}` : `/pickup/${refCode}`;
  return (
    <Card className="p-6 space-y-4">
      <h2 className="font-semibold">{t("settings.section.takeaway_qr")}</h2>
      <p className="text-xs text-muted-foreground">{t("settings.takeaway_qr.hint")}</p>

      {/* QR Code image */}
      <div className="flex flex-col items-center gap-3">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-border">
          <QRCodeSVG value={url} size={200} level="M" includeMargin={false} />
        </div>
        <p className="text-sm font-medium text-center">{t("takeaway.title")}</p>
      </div>

      <div className="flex items-center gap-2">
        <Input readOnly value={url} className="font-mono text-xs" />
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(url); toast.success(t("settings.takeaway_qr.copied")); }}>{t("settings.takeaway_qr.copy")}</Button>
        <Button variant="outline" size="sm" asChild><a href={url} target="_blank" rel="noreferrer">{t("settings.takeaway_qr.open")}</a></Button>
      </div>
      <div className="flex items-center gap-2">
        <Input readOnly value={pickupUrl} className="font-mono text-xs" />
        <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(pickupUrl); toast.success(t("settings.takeaway_qr.copied")); }}>{t("settings.takeaway_qr.copy")}</Button>
        <Button variant="outline" size="sm" asChild><a href={pickupUrl} target="_blank" rel="noreferrer">{t("pickup.title")}</a></Button>
      </div>
    </Card>
  );
}
