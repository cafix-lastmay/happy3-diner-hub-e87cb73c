import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LayoutDashboard, Wallet, History, BarChart3, Info } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";

export const Route = createFileRoute("/cafeteria/recharge")({ component: () => <CafeRecharge mode="admin" /> });

const fmt = (n: number, d = 0) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

export function CafeRecharge({ mode = "admin" }: { mode?: "admin" | "manager" }) {
  const { t } = useI18n();
  const { ready } = useRequireRole(mode === "manager" ? "manager" : "cafeteria_admin");
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = mode === "manager" ? "/manager" : "/cafeteria";
  const [me, setMe] = useState<{ ref_code: string; currency_code: string | null } | null>(null);
  const [currencyName, setCurrencyName] = useState<string>("");
  const [instructions, setInstructions] = useState<string>("");
  const [amountUsd, setAmountUsd] = useState("");
  // rate_to_usd from DB = how many local units equal 1 USD (EGP=50, SAR=3.75)
  const [rateToUsd, setRateToUsd] = useState<number>(1);
  const [rateUpdatedAt, setRateUpdatedAt] = useState<string | null>(null);
  const [pointsPerUsd, setPointsPerUsd] = useState<number>(200);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    const onCafe = async (cafe: { ref_code: string; currency_code: string | null } | null) => {
      if (!cafe) return;
      setMe(cafe);
      const code = cafe.currency_code;
      if (code) {
        // Currency display name
        supabase.from("currencies").select("name_ar,symbol").eq("code", code).maybeSingle()
          .then(({ data }) => setCurrencyName(data?.name_ar || data?.symbol || code));
        if (code !== "USD") {
          const { data: rate } = await supabase
            .from("exchange_rates")
            .select("rate_to_usd, updated_at")
            .eq("currency_code", code)
            .maybeSingle();
          if (rate?.rate_to_usd) {
            setRateToUsd(Number(rate.rate_to_usd));
            setRateUpdatedAt(rate.updated_at ?? null);
          }
        } else {
          setRateToUsd(1);
        }
      }
    };
    if (mode === "manager") {
      supabase.from("staff").select("cafeteria_ref_code").eq("user_id", user.id).eq("role", "manager").eq("is_active", true).maybeSingle()
        .then(async ({ data }) => {
          if (!data) return;
          const { data: cafe } = await supabase.from("cafeterias").select("ref_code,currency_code").eq("ref_code", data.cafeteria_ref_code).maybeSingle();
          onCafe(cafe);
        });
    } else {
      supabase.from("cafeterias").select("ref_code,currency_code").eq("user_id", user.id).maybeSingle().then(({ data }) => onCafe(data));
    }
    supabase.from("recharge_instructions").select("body").order("updated_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (data?.body) setInstructions(data.body); });
    supabase.from("app_settings").select("points_per_usd").maybeSingle()
      .then(({ data }) => { const v = Number((data as { points_per_usd?: number | null } | null)?.points_per_usd); if (v && v > 0) setPointsPerUsd(v); });
  }, [ready, user, mode]);

  // Live calculation
  const calc = useMemo(() => {
    const amt = Number((amountUsd || "").trim().replace(/,/g, "."));
    const safeAmt = !amt || Number.isNaN(amt) || amt <= 0 ? 0 : amt;
    const safeRate = rateToUsd > 0 ? rateToUsd : 1;
    const points = Math.round(safeAmt * pointsPerUsd * safeRate);
    const localAmount = safeAmt * safeRate;
    return { safeAmt, safeRate, points, localAmount };
  }, [amountUsd, rateToUsd, pointsPerUsd]);

  const currencyLabel = me?.currency_code || "USD";
  const currencyShown = currencyName || currencyLabel;

  const submit = async (e?: React.FormEvent<HTMLFormElement> | React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (!calc.safeAmt) { toast.error(t("error.required_field") || "Required"); return; }
    if (calc.safeAmt < 5) { toast.error(t("error.min_5_usd")); return; }
    if (!file) { toast.error(t("error.upload_receipt")); return; }
    if (!me || !user) { toast.error("No cafeteria context"); return; }
    setLoading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${me.ref_code}/${user.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("recharge-receipts").upload(path, file);
      if (upErr) { toast.error(upErr.message); return; }
      const { error } = await supabase.from("recharge_requests").insert({
        cafeteria_ref_code: me.ref_code,
        amount_usd: calc.safeAmt,
        exchange_rate_to_usd: calc.safeRate,
        points_to_credit: calc.points,
        local_currency: me.currency_code ?? "USD",
        receipt_url: path,
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

  if (!ready) return <Redirecting />;
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

      {/* Exchange rate banner */}
      <Card className="p-4 mb-4 max-w-xl border-violet/40 bg-gradient-to-br from-violet/10 to-sky/10">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-violet/15 p-2 text-violet"><Info className="h-4 w-4" /></div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">سعر صرف عملتك</p>
            <p className="text-lg font-bold">
              1 USD = <span className="text-violet">{fmt(rateToUsd, rateToUsd >= 10 ? 2 : 4)}</span> {currencyShown}
            </p>
            {rateUpdatedAt && (
              <p className="text-xs text-muted-foreground mt-1">
                آخر تحديث: {new Date(rateUpdatedAt).toLocaleDateString("ar-EG")}
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6 max-w-xl">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>المبلغ المدفوع (USD) *</Label>
            <Input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              placeholder="50"
              className="text-lg font-bold"
            />
            <p className="text-xs text-muted-foreground">{t("cafeteria.recharge.min")}</p>
          </div>

          {/* Live calculator */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">المبلغ المدفوع</span>
              <span className="font-medium">{fmt(calc.safeAmt, 2)} USD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">سعر الصرف</span>
              <span className="font-medium">1 USD = {fmt(calc.safeRate, calc.safeRate >= 10 ? 2 : 4)} {currencyLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">معامل التحويل</span>
              <span className="font-medium">{pointsPerUsd} نقطة / دولار</span>
            </div>
            <div className="border-t border-border/60 pt-2 flex justify-between items-center">
              <span className="font-semibold">عدد النقاط التي ستُضاف</span>
              <span className="text-2xl font-bold text-violet">{fmt(calc.points)}</span>
            </div>
            {calc.safeAmt > 0 && me?.currency_code && me.currency_code !== "USD" && (
              <p className="text-xs text-mint-foreground bg-mint/15 rounded-md px-2 py-1.5 text-center">
                يعادل: <span className="font-bold">{fmt(calc.localAmount, 2)} {currencyShown}</span> في مبيعاتك
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t("cafeteria.recharge.receipt")} *</Label>
            <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
          </div>

          <Button
            type="button"
            disabled={loading}
            onClick={() => submit()}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {loading ? t("common.loading") : t("common.submit")}
          </Button>
        </div>
      </Card>
    </DashboardShell>
  );
}
