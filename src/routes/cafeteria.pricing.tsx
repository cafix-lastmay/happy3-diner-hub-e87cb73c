// Price Tiers management — admin/manager can define multiple price categories
// (e.g. عادي، VIP، توصيل) per cafeteria, mark one as default, and bind sections to them.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Wallet, History, BookOpen, QrCode, Users,
  ClipboardList, BarChart3, Plus, Trash2, Star, Tags, Loader2,
} from "lucide-react";
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
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/cafeteria/pricing")({
  component: () => <CafePricing mode="admin" />,
});

interface Tier {
  id: string;
  name: string;
  is_default: boolean;
  sort_order: number;
  is_active: boolean;
}
interface Section {
  id: string;
  name: string;
  price_tier_id: string | null;
}

export function CafePricing({ mode = "admin" }: { mode?: "admin" | "manager" }) {
  const { t } = useI18n();
  const { ready } = useRequireRole(mode === "manager" ? "manager" : "cafeteria_admin");
  const { user } = useAuth();
  const [refCode, setRefCode] = useState<string | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [newTier, setNewTier] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (rc: string) => {
    const [tRes, sRes] = await Promise.all([
      supabase.from("price_tiers").select("*").eq("cafeteria_ref_code", rc).order("sort_order").order("name"),
      supabase.from("table_sections").select("id,name,price_tier_id").eq("cafeteria_ref_code", rc).order("sort_order"),
    ]);
    setTiers((tRes.data ?? []) as Tier[]);
    setSections((sRes.data ?? []) as Section[]);
  };

  useEffect(() => {
    if (!ready || !user) return;
    if (mode === "manager") {
      supabase.from("staff").select("cafeteria_ref_code").eq("user_id", user.id)
        .eq("role", "manager").eq("is_active", true).maybeSingle()
        .then(({ data }) => { if (data) { setRefCode(data.cafeteria_ref_code); load(data.cafeteria_ref_code); } });
    } else {
      supabase.from("cafeterias").select("ref_code").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => { if (data) { setRefCode(data.ref_code); load(data.ref_code); } });
    }
  }, [ready, user, mode]);

  const addTier = async () => {
    if (!newTier.trim() || !refCode) return;
    setBusy(true);
    const isFirst = tiers.length === 0;
    const { data, error } = await supabase
      .from("price_tiers")
      .insert({
        cafeteria_ref_code: refCode,
        name: newTier.trim(),
        sort_order: tiers.length,
        is_default: isFirst,
      })
      .select()
      .single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data) setTiers((p) => [...p, data as Tier]);
    setNewTier("");
    toast.success(t("common.success"));
  };

  const setDefault = async (id: string) => {
    const { error } = await supabase.rpc("set_default_price_tier", { _tier_id: id });
    if (error) { toast.error(error.message); return; }
    setTiers((p) => p.map((tt) => ({ ...tt, is_default: tt.id === id })));
  };

  const renameTier = async (id: string, name: string) => {
    const { error } = await supabase.from("price_tiers").update({ name }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTiers((p) => p.map((tt) => tt.id === id ? { ...tt, name } : tt));
  };

  const deleteTier = async (id: string) => {
    if (!confirm(t("common.confirm"))) return;
    const { error } = await supabase.from("price_tiers").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTiers((p) => p.filter((tt) => tt.id !== id));
    setSections((p) => p.map((s) => s.price_tier_id === id ? { ...s, price_tier_id: null } : s));
  };

  const bindSection = async (sectionId: string, tierId: string | null) => {
    const { error } = await supabase.from("table_sections")
      .update({ price_tier_id: tierId })
      .eq("id", sectionId);
    if (error) { toast.error(error.message); return; }
    setSections((p) => p.map((s) => s.id === sectionId ? { ...s, price_tier_id: tierId } : s));
  };

  if (!ready) return <Redirecting />;
  const navItems = mode === "manager" ? [
    { to: "/manager", label: t("orders.title"), icon: ClipboardList },
    { to: "/manager/menu", label: t("cafeteria.nav.menu"), icon: BookOpen },
    { to: "/manager/tables", label: t("cafeteria.nav.tables"), icon: QrCode },
    { to: "/manager/staff", label: t("cafeteria.nav.staff"), icon: Users },
  ] : [
    { to: "/cafeteria", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/cafeteria/menu", label: t("cafeteria.nav.menu"), icon: BookOpen },
    { to: "/cafeteria/pricing", label: t("pricing.nav"), icon: Tags },
    { to: "/cafeteria/tables", label: t("cafeteria.nav.tables"), icon: QrCode },
    { to: "/cafeteria/staff", label: t("cafeteria.nav.staff"), icon: Users },
    { to: "/cafeteria/orders", label: t("cafeteria.nav.orders"), icon: ClipboardList },
    { to: "/cafeteria/reports", label: t("cafeteria.nav.reports"), icon: BarChart3 },
    { to: "/cafeteria/recharge", label: t("cafeteria.nav.recharge"), icon: Wallet },
    { to: "/cafeteria/history", label: t("cafeteria.nav.history"), icon: History },
  ];

  const defaultTier = tiers.find((t) => t.is_default);

  return (
    <DashboardShell
      title={t("cafeteria.dashboard.title")}
      navItems={navItems.filter((n) => n.to !== "/cafeteria")}
      showTrialCard
    >
      <h1 className="text-2xl font-bold mb-2">{t("pricing.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{t("pricing.subtitle")}</p>

      {/* === Add tier === */}
      <Card className="p-4 mb-6">
        <Label className="mb-2 block">{t("pricing.add_tier")}</Label>
        <div className="flex gap-2">
          <Input
            placeholder={t("pricing.tier_name_placeholder")}
            value={newTier}
            onChange={(e) => setNewTier(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addTier(); }}
          />
          <Button onClick={addTier} disabled={busy || !newTier.trim()} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("common.add")}
          </Button>
        </div>
      </Card>

      {/* === Existing tiers === */}
      <Card className="p-4 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Tags className="h-4 w-4" /> {t("pricing.tiers")}
        </h2>
        {tiers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pricing.no_tiers")}</p>
        ) : (
          <div className="space-y-2">
            {tiers.map((tt) => (
              <div key={tt.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <Input
                  defaultValue={tt.name}
                  onBlur={(e) => { if (e.target.value.trim() && e.target.value !== tt.name) renameTier(tt.id, e.target.value.trim()); }}
                  className="flex-1"
                />
                <Button
                  variant={tt.is_default ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setDefault(tt.id)}
                  className={tt.is_default ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}
                  title={t("pricing.set_default")}
                >
                  <Star className={`h-3 w-3 ${tt.is_default ? "fill-current" : ""}`} />
                  <span className="ms-1 hidden sm:inline">{tt.is_default ? t("pricing.default") : t("pricing.set_default")}</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteTier(tt.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        {tiers.length > 0 && !defaultTier && (
          <p className="mt-3 text-xs text-destructive">{t("pricing.no_default_warning")}</p>
        )}
      </Card>

      {/* === Section binding === */}
      <Card className="p-4">
        <h2 className="font-semibold mb-1">{t("pricing.section_bindings")}</h2>
        <p className="text-xs text-muted-foreground mb-3">{t("pricing.section_bindings.hint")}</p>
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("tables.sections.none")}</p>
        ) : (
          <div className="space-y-2">
            {sections.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <span className="flex-1 truncate font-medium">{s.name}</span>
                <Select
                  value={s.price_tier_id ?? "__default__"}
                  onValueChange={(v) => bindSection(s.id, v === "__default__" ? null : v)}
                >
                  <SelectTrigger className="w-40 sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">
                      {t("pricing.use_default")}{defaultTier ? ` (${defaultTier.name})` : ""}
                    </SelectItem>
                    {tiers.map((tt) => (
                      <SelectItem key={tt.id} value={tt.id}>
                        {tt.name}{tt.is_default ? " ★" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {s.price_tier_id && (() => {
                  const bound = tiers.find((tt) => tt.id === s.price_tier_id);
                  return bound ? <Badge variant="secondary" className="hidden sm:inline-flex">{bound.name}</Badge> : null;
                })()}
              </div>
            ))}
          </div>
        )}
      </Card>
    </DashboardShell>
  );
}
