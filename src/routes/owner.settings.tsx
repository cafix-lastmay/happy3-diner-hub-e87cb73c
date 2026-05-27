// Owner-only: global app settings (trial days, grace periods, footer banner).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/settings")({ component: OwnerSettings });

interface AppSettings {
  default_trial_days: number;
  grace_days_after_zero: number;
  max_driver_radius_km: number;
  points_per_usd: number;
  footer_banner_enabled: boolean;
  footer_banner_text: string | null;
  footer_banner_cta_text: string | null;
  footer_banner_url: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  default_trial_days: 21,
  grace_days_after_zero: 3,
  max_driver_radius_km: 15,
  points_per_usd: 200,
  footer_banner_enabled: false,
  footer_banner_text: "",
  footer_banner_cta_text: "",
  footer_banner_url: "",
};

function OwnerSettings() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("app_settings").select("*").maybeSingle();
    if (data) {
      setS({
        default_trial_days: Number(data.default_trial_days ?? 21),
        grace_days_after_zero: Number((data as { grace_days_after_zero?: number | null }).grace_days_after_zero ?? 3),
        max_driver_radius_km: Number((data as { max_driver_radius_km?: number | null }).max_driver_radius_km ?? 15),
        points_per_usd: Number((data as { points_per_usd?: number | null }).points_per_usd ?? 200),
        footer_banner_enabled: !!data.footer_banner_enabled,
        footer_banner_text: data.footer_banner_text ?? "",
        footer_banner_cta_text: data.footer_banner_cta_text ?? "",
        footer_banner_url: data.footer_banner_url ?? "",
      });
    }
  };
  useEffect(() => { if (ready) load(); }, [ready]);

  const saveFields = async (patch: Partial<AppSettings>) => {
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("app_settings").upsert({
      id: true,
      ...patch,
      updated_by: u?.user?.id,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
  };

  const save = () => saveFields({
    default_trial_days: s.default_trial_days,
    grace_days_after_zero: s.grace_days_after_zero,
    max_driver_radius_km: s.max_driver_radius_km,
    points_per_usd: s.points_per_usd,
    footer_banner_enabled: s.footer_banner_enabled,
    footer_banner_text: s.footer_banner_text,
    footer_banner_cta_text: s.footer_banner_cta_text,
    footer_banner_url: s.footer_banner_url,
  });

  if (!ready) return null;
  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}>
      <h1 className="text-2xl font-bold mb-6">{t("owner.settings.title")}</h1>

      <Card className="p-6 mb-6 max-w-2xl">
        <h2 className="font-semibold mb-4">إعدادات المنصة</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>الحد الأقصى لنطاق السائق (كم)</Label>
            <Input type="number" min="1" max="200" value={s.max_driver_radius_km} onChange={(e) => setS({ ...s, max_driver_radius_km: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>عدد النقاط لكل دولار</Label>
            <Input type="number" min="1" step="1" value={s.points_per_usd} onChange={(e) => setS({ ...s, points_per_usd: Number(e.target.value) })} />
          </div>
        </div>
      </Card>

      <Card className="p-6 mb-6 max-w-2xl">
        <h2 className="font-semibold mb-1">فترات التشغيل المجانية</h2>
        <p className="text-xs text-muted-foreground mb-4">إدارة جميع أنواع فترات التشغيل المجاني للكافيتريات.</p>

        <div className="space-y-6">
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
              <h3 className="font-semibold">بعد نفاذ الرصيد</h3>
            </div>
            <Label className="block">عدد أيام التشغيل بعد نفاذ النقاط لجميع الكافيتريات</Label>
            <div className="flex flex-wrap gap-2 items-center">
              <Input type="number" min="0" max="90" className="max-w-[140px]" value={s.grace_days_after_zero} onChange={(e) => setS({ ...s, grace_days_after_zero: Number(e.target.value) })} />
              <span className="text-sm text-muted-foreground">يوم ({s.grace_days_after_zero * 24} ساعة)</span>
              <Button size="sm" disabled={busy} onClick={() => saveFields({ grace_days_after_zero: s.grace_days_after_zero })}>حفظ</Button>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
              <h3 className="font-semibold">للكافيتريات الجديدة</h3>
            </div>
            <Label className="block">عدد أيام التجربة المجانية للكافيتريات الجديدة</Label>
            <div className="flex flex-wrap gap-2 items-center">
              <Input type="number" min="0" max="365" className="max-w-[140px]" value={s.default_trial_days} onChange={(e) => setS({ ...s, default_trial_days: Number(e.target.value) })} />
              <span className="text-sm text-muted-foreground">يوم</span>
              <Button size="sm" disabled={busy} onClick={() => saveFields({ default_trial_days: s.default_trial_days })}>حفظ</Button>
            </div>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
              <h3 className="font-semibold">منح خاص لكافيتريات محددة</h3>
            </div>
            <p className="text-xs text-muted-foreground">منح فترات مجانية يدويًا لكافيتريات معيّنة برقمها المرجعي.</p>
            <Button asChild size="sm" variant="outline">
              <Link to="/owner/grace_periods">إدارة المنح الخاصة ←</Link>
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 mb-6 max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">{t("owner.settings.banner")}</h2>
          <Switch checked={s.footer_banner_enabled} onCheckedChange={(c) => setS({ ...s, footer_banner_enabled: c })} />
        </div>
        <div className="space-y-3">
          <div className="space-y-1"><Label>{t("owner.settings.banner_text")}</Label><Textarea rows={2} value={s.footer_banner_text ?? ""} onChange={(e) => setS({ ...s, footer_banner_text: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>{t("owner.settings.banner_cta")}</Label><Input value={s.footer_banner_cta_text ?? ""} onChange={(e) => setS({ ...s, footer_banner_cta_text: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t("owner.settings.banner_url")}</Label><Input type="url" value={s.footer_banner_url ?? ""} onChange={(e) => setS({ ...s, footer_banner_url: e.target.value })} placeholder="https://…" /></div>
          </div>
        </div>
      </Card>

      <div className="max-w-2xl flex justify-end">
        <Button onClick={save} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">{busy ? t("common.loading") : "حفظ كل الإعدادات"}</Button>
      </div>
    </DashboardShell>
  );
}
