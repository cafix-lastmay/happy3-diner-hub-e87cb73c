import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Wallet, History, BarChart3 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

export const Route = createFileRoute("/cafeteria/recharge")({ component: () => <CafeRecharge mode="admin" /> });

export function CafeRecharge({ mode = "admin" }: { mode?: "admin" | "manager" }) {
  const { t } = useI18n();
  const { ready } = useRequireRole(mode === "manager" ? "manager" : "cafeteria_admin");
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = mode === "manager" ? "/manager" : "/cafeteria";
  const [me, setMe] = useState<{ ref_code: string; currency_code: string | null } | null>(null);
  const [instructions, setInstructions] = useState<string>("");
  const [amountUsd, setAmountUsd] = useState("");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    if (mode === "manager") {
      supabase.from("staff").select("cafeteria_ref_code").eq("user_id", user.id).eq("role", "manager").eq("is_active", true).maybeSingle()
        .then(async ({ data }) => {
          if (!data) return;
          const { data: cafe } = await supabase.from("cafeterias").select("ref_code,currency_code").eq("ref_code", data.cafeteria_ref_code).maybeSingle();
          if (cafe) setMe(cafe);
        });
    } else {
      supabase.from("cafeterias").select("ref_code,currency_code").eq("user_id", user.id).maybeSingle().then(({ data }) => { if (data) setMe(data); });
    }
    supabase.from("recharge_instructions").select("body").order("updated_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data?.body) setInstructions(data.body); });
  }, [ready, user, mode]);

  const submit = async (e?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    const normalizedAmount = amountUsd.trim().replace(/,/g, ".");
    const amt = Number(normalizedAmount);
    if (!normalizedAmount || Number.isNaN(amt)) { toast.error(t("error.required_field") || "Required"); return; }
    if (amt < 5) { toast.error(t("error.min_5_usd")); return; }
    if (!file) { toast.error(t("error.upload_receipt")); return; }
    if (!me || !user) { toast.error("No cafeteria context"); return; }
    setLoading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("recharge-receipts").upload(path, file);
      if (upErr) { toast.error(upErr.message); return; }
      const normalizedRate = exchangeRate.trim().replace(/,/g, ".");
      const rate = Number(normalizedRate);
      const safeRate = Number.isNaN(rate) || rate <= 0 ? 1 : rate;
      const points = amt * safeRate;
      const { error } = await supabase.from("recharge_requests").insert({
        cafeteria_ref_code: me.ref_code, amount_usd: amt, exchange_rate_to_usd: safeRate,
        points_to_credit: points, local_currency: me.currency_code ?? "USD", receipt_url: path,
      });
      if (error) { toast.error(error.message); return; }
      toast.success(t("common.success"));
      navigate({ to: `${base}/history` });
    } catch (err) {
      console.error("Recharge submit failed", err);
      toast.error((err as Error)?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) return null;
  const navItems = [
    { to: base, label: t("common.dashboard"), icon: LayoutDashboard },
    { to: `${base}/reports`, label: t("cafeteria.nav.reports"), icon: BarChart3 },
    { to: `${base}/recharge`, label: t("cafeteria.nav.recharge"), icon: Wallet },
    { to: `${base}/history`, label: t("cafeteria.nav.history"), icon: History },
  ];
  return (
    <DashboardShell title={t("cafeteria.dashboard.title")} navItems={navItems.filter((n) => n.to !== base)} showTrialCard={mode === "admin"}>
      <h1 className="text-2xl font-bold mb-6">{t("cafeteria.recharge.title")}</h1>
      {instructions && (
        <Card className="p-4 mb-4 max-w-xl bg-muted/40">
          <h2 className="font-semibold mb-2">{t("cafeteria.recharge.instructions")}</h2>
          <pre className="whitespace-pre-wrap text-sm font-sans">{instructions}</pre>
        </Card>
      )}
      <Card className="p-6 max-w-xl">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("cafeteria.recharge.amount_usd")} *</Label>
            <Input type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("cafeteria.recharge.min")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("cafeteria.recharge.exchange_rate")} (1 USD = ? {me?.currency_code})</Label>
            <Input type="text" inputMode="decimal" autoComplete="off" spellCheck={false} value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("cafeteria.recharge.points_to_credit")}: {(Number(amountUsd || 0) * Number(exchangeRate || 1)).toFixed(2)} {me?.currency_code}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("cafeteria.recharge.receipt")} *</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
          </div>
          <Button type="button" disabled={loading} onClick={() => submit()} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">{loading ? t("common.loading") : t("common.submit")}</Button>
        </div>
      </Card>
    </DashboardShell>
  );
}
