import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { toast } from "sonner";
import { BottomNav } from "@/components/layouts/BottomNav";
import { MobileHeader } from "@/components/layouts/MobileHeader";

export const Route = createFileRoute("/settings/notifications")({
  component: NotifPrefsPage,
});

interface Prefs {
  new_orders: boolean;
  service_calls: boolean;
  shifts: boolean;
  recharge_withdrawal: boolean;
}

const defaults: Prefs = {
  new_orders: true, service_calls: true, shifts: true, recharge_withdrawal: true,
};

function NotifPrefsPage() {
  const { user, loading, roles } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.navigate({ to: "/login" }); return; }
    supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setPrefs(data as any); });
  }, [user, loading, router]);

  const update = async (patch: Partial<Prefs>) => {
    if (!user) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    const { error } = await supabase.from("notification_preferences")
      .upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error(error.message);
  };

  const Row = ({ k, label, desc }: { k: keyof Prefs; label: string; desc: string }) => (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="flex-1">
        <Label htmlFor={k} className="font-semibold">{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch id={k} checked={prefs[k]} onCheckedChange={(v) => update({ [k]: v } as any)} disabled={saving} />
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title={t("notif_prefs.title")} />
      <header className="hidden md:block sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => router.history.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Bell className="h-5 w-5" />
          <h1 className="text-lg font-bold">{t("notif_prefs.title")}</h1>
        </div>
      </header>
      <main className="container mx-auto max-w-xl px-4 py-4 pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-4">
        <Card className="divide-y px-4">
          <Row k="new_orders" label={t("notif_prefs.new_orders")} desc={t("notif_prefs.new_orders_desc")} />
          <Row k="service_calls" label={t("notif_prefs.service_calls")} desc={t("notif_prefs.service_calls_desc")} />
          <Row k="shifts" label={t("notif_prefs.shifts")} desc={t("notif_prefs.shifts_desc")} />
          <Row k="recharge_withdrawal" label={t("notif_prefs.recharge_withdrawal")} desc={t("notif_prefs.recharge_withdrawal_desc")} />
        </Card>
        <p className="mt-4 text-xs text-muted-foreground">{t("notif_prefs.hint")}</p>
        <div className="mt-6">
          <Link
            to="/settings/account"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            {t("settings.account")} →
          </Link>
        </div>
      </main>
      <BottomNav role={(roles[0] as any) ?? null} />
    </div>
  );
}
