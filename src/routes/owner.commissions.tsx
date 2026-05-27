// Owner: General Settings & Offers — commission rates + default free-trial duration + global footer banner.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PromoBanner } from "@/components/PromoBanner";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/commissions")({ component: OwnerGeneralSettings });

interface Rate { level_distance: number; percentage: number }

function OwnerGeneralSettings() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [rates, setRates] = useState<Rate[]>([]);
  const [trialDays, setTrialDays] = useState<number>(21);
  const [maxDriverRadius, setMaxDriverRadius] = useState<number>(15);
  const [eligibilityMonths, setEligibilityMonths] = useState<number>(12);
  const [busy, setBusy] = useState(false);
  const [bannerForm, setBannerForm] = useState({ text: "", cta: "", url: "", enabled: false });
  const [savingBanner, setSavingBanner] = useState(false);

  useEffect(() => {
    if (!ready) return;
    supabase.from("commission_rates").select("*").order("level_distance")
      .then(({ data }) => setRates((data ?? []) as Rate[]));
    supabase
      .from("app_settings")
      .select("default_trial_days,footer_banner_text,footer_banner_cta_text,footer_banner_url,footer_banner_enabled,max_driver_radius_km,commission_eligibility_months")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setTrialDays(Number(data.default_trial_days ?? 21));
          setMaxDriverRadius(Number((data as { max_driver_radius_km: number | null }).max_driver_radius_km ?? 15));
          setEligibilityMonths(Number((data as { commission_eligibility_months: number | null }).commission_eligibility_months ?? 12));
          setBannerForm({
            text: (data as { footer_banner_text: string | null }).footer_banner_text ?? "",
            cta: (data as { footer_banner_cta_text: string | null }).footer_banner_cta_text ?? "",
            url: (data as { footer_banner_url: string | null }).footer_banner_url ?? "",
            enabled: !!(data as { footer_banner_enabled: boolean | null }).footer_banner_enabled,
          });
        }
      });
  }, [ready]);

  const saveEligibilityMonths = async () => {
    setBusy(true);
    try {
      const v = Math.max(0, Math.min(120, Number(eligibilityMonths) || 0));
      const { error } = await supabase.from("app_settings").update({ commission_eligibility_months: v }).eq("id", true);
      if (error) throw error;
      toast.success(t("common.success"));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const saveMaxRadius = async () => {
    setBusy(true);
    try {
      const v = Math.max(1, Math.min(200, Number(maxDriverRadius) || 1));
      const { error } = await supabase.from("app_settings").update({ max_driver_radius_km: v }).eq("id", true);
      if (error) throw error;
      toast.success(t("common.success"));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const saveRates = async () => {
    setBusy(true);
    try {
      for (const r of rates) {
        await supabase.from("commission_rates").update({ percentage: r.percentage }).eq("level_distance", r.level_distance);
      }
      toast.success(t("common.success"));
    } finally { setBusy(false); }
  };

  const saveTrial = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("owner_set_default_trial_days", { _days: trialDays });
      if (error) throw error;
      toast.success(t("common.success"));
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const saveBanner = async () => {
    const url = bannerForm.url.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      toast.error(t("menu.banner.url_invalid"));
      return;
    }
    setSavingBanner(true);
    // owner_set_footer_banner is SECURITY DEFINER and rejects non-owner callers.
    const { error } = await supabase.rpc("owner_set_footer_banner", {
      _text: bannerForm.text.trim(),
      _cta_text: bannerForm.cta.trim(),
      _url: url,
      _enabled: bannerForm.enabled,
    });
    setSavingBanner(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
  };

  if (!ready) return null;
  const navItems = ownerNavItems(t);
  const labels: Record<number, string> = {
    1: "owner.rate.parent",
    2: "owner.rate.grandparent",
    3: "owner.rate.greatgrandparent",
    4: "owner.rate.level4",
  };

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-2">{t("owner.general_settings")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("owner.general_settings.desc")}</p>

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">{t("owner.commission_rates")}</h2>
          {rates.map((r) => (
            <div key={r.level_distance} className="space-y-2">
              <Label>{t(labels[r.level_distance] ?? "owner.rate.parent")} (%)</Label>
              <Input type="number" step="0.01" min="0" max="100" value={r.percentage} onChange={(e) => {
                const v = Number(e.target.value);
                setRates(rates.map((x) => x.level_distance === r.level_distance ? { ...x, percentage: v } : x));
              }} />
            </div>
          ))}
          {rates.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          )}
          <Button onClick={saveRates} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("common.save")}</Button>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">{t("owner.default_trial_days")}</h2>
          <p className="text-xs text-muted-foreground">{t("cafeteria.trial.remaining")}</p>
          <div className="space-y-2">
            <Label>{t("owner.default_trial_days")}</Label>
            <Input type="number" min="0" max="365" value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} />
          </div>
          <Button onClick={saveTrial} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("common.save")}</Button>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold">{t("owner.max_driver_radius")}</h2>
          <p className="text-xs text-muted-foreground">{t("owner.max_driver_radius_hint")}</p>
          <div className="space-y-2">
            <Label>{t("owner.max_driver_radius")} (km)</Label>
            <Input type="number" min="1" max="200" value={maxDriverRadius} onChange={(e) => setMaxDriverRadius(Number(e.target.value))} />
          </div>
          <Button onClick={saveMaxRadius} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("common.save")}</Button>
        </Card>
      </div>

      {/* Global footer banner — appears at the bottom of every cafeteria's customer menu */}
      <Card className="p-6 max-w-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-accent" />
          <h2 className="font-semibold">{t("menu.banner.footer.title")}</h2>
        </div>
        <p className="text-xs text-muted-foreground">{t("menu.banner.footer.hint")}</p>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
          <div className="text-sm">
            <Label className="font-medium">{t("menu.banner.enabled")}</Label>
            <p className="text-xs text-muted-foreground">{t("menu.banner.enabled.hint")}</p>
          </div>
          <Switch
            checked={bannerForm.enabled}
            onCheckedChange={(v) => setBannerForm({ ...bannerForm, enabled: v })}
          />
        </div>

        <div>
          <Label>{t("menu.banner.text")}</Label>
          <Input
            value={bannerForm.text}
            onChange={(e) => setBannerForm({ ...bannerForm, text: e.target.value })}
            maxLength={120}
            placeholder={t("menu.banner.text.placeholder")}
          />
        </div>
        <div>
          <Label>{t("menu.banner.cta")}</Label>
          <Input
            value={bannerForm.cta}
            onChange={(e) => setBannerForm({ ...bannerForm, cta: e.target.value })}
            maxLength={32}
            placeholder={t("menu.banner.cta.placeholder")}
          />
        </div>
        <div>
          <Label>{t("menu.banner.url")}</Label>
          <Input
            type="url"
            inputMode="url"
            value={bannerForm.url}
            onChange={(e) => setBannerForm({ ...bannerForm, url: e.target.value })}
            placeholder="https://example.com"
          />
          <p className="text-[11px] text-muted-foreground mt-1">{t("menu.banner.url.hint")}</p>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("menu.banner.preview")}</Label>
          <div className="rounded-lg bg-muted/30 p-3">
            <PromoBanner
              variant="footer"
              enabled={bannerForm.enabled}
              text={bannerForm.text}
              ctaText={bannerForm.cta}
              url={bannerForm.url}
            />
            {!bannerForm.enabled && (
              <p className="text-xs text-muted-foreground text-center">{t("menu.banner.preview.disabled")}</p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={saveBanner} disabled={savingBanner} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {savingBanner ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      </Card>
    </DashboardShell>
  );
}
