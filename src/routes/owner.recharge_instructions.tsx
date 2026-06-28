// Owner edits the global recharge instructions text shown to all cafeterias.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, Coffee, Wallet, Percent, Banknote, FileText } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/recharge_instructions")({ component: OwnerInstructions });

function OwnerInstructions() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [id, setId] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;
    supabase.from("recharge_instructions").select("id,body").order("updated_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data) { setId(data.id); setBody(data.body ?? ""); } });
  }, [ready]);

  const save = async () => {
    setBusy(true);
    if (id) {
      const { error } = await supabase.from("recharge_instructions").update({ body, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) { toast.error(error.message); setBusy(false); return; }
    } else {
      const { data, error } = await supabase.from("recharge_instructions").insert({ body }).select("id").single();
      if (error) { toast.error(error.message); setBusy(false); return; }
      setId(data.id);
    }
    setBusy(false);
    toast.success(t("common.success"));
  };

  if (!ready) return <Redirecting />;
  const navItems = [
    { to: "/owner", label: t("owner.nav.overview"), icon: LayoutDashboard },
    { to: "/owner/marketers", label: t("owner.nav.marketers"), icon: Users },
    { to: "/owner/cafeterias", label: t("owner.nav.cafeterias"), icon: Coffee },
    { to: "/owner/recharges", label: t("owner.nav.recharges"), icon: Wallet },
    { to: "/owner/recharge_instructions", label: t("owner.nav.recharge_instructions"), icon: FileText },
    { to: "/owner/commissions", label: t("owner.nav.commissions"), icon: Percent },
    { to: "/owner/withdrawals", label: t("owner.nav.withdrawals"), icon: Banknote },
  ];
  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-2">{t("owner.recharge_instructions.title")}</h1>
      <p className="text-muted-foreground mb-6">{t("owner.recharge_instructions.desc")}</p>
      <Card className="p-6 max-w-3xl">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={14} placeholder={t("owner.recharge_instructions.placeholder")} className="font-mono text-sm" />
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {busy ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      </Card>
    </DashboardShell>
  );
}
