// Marketing-style commission calculator — estimate yearly commission for a cafeteria.
// Formula: yearly_sales_in_points × (1 / points_per_usd) × commission_pct
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Sparkles, TrendingUp, Info } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { CashCounterIllustration } from "@/components/CashCounterIllustration";

interface Rate { level_distance: number; percentage: number }

export function CommissionCalculator() {
  const { t } = useI18n();
  const [rates, setRates] = useState<Rate[]>([]);
  const [pointsPerUsd, setPointsPerUsd] = useState<number>(200);
  const [dailyPoints, setDailyPoints] = useState<string>("5000");
  const [level, setLevel] = useState<number>(1);

  useEffect(() => {
    supabase.from("commission_rates").select("*").order("level_distance")
      .then(({ data }) => setRates((data ?? []) as Rate[]));
    supabase.from("app_settings").select("points_per_usd").maybeSingle()
      .then(({ data }) => { if (data?.points_per_usd) setPointsPerUsd(Number(data.points_per_usd)); });
  }, []);

  const pct = useMemo(() => rates.find((r) => r.level_distance === level)?.percentage ?? 0, [rates, level]);
  const conversionFactor = pointsPerUsd > 0 ? 1 / pointsPerUsd : 0; // e.g. 0.005

  const daily = Number(dailyPoints) || 0;
  const monthly = daily * 30;
  const yearly = daily * 365;
  const yearlyUsd = yearly * conversionFactor;
  const monthlyUsd = monthly * conversionFactor;
  const yearlyCommission = (yearlyUsd * Number(pct)) / 100;
  const monthlyCommission = (monthlyUsd * Number(pct)) / 100;

  const levelLabels: Record<number, string> = {
    1: t("calc.level.parent"),
    2: t("calc.level.grandparent"),
    3: t("calc.level.greatgrand"),
    4: t("calc.level.level4"),
  };

  const fmtPts = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
  const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

  const intensity = Math.min(1, yearlyCommission / 5000);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <Card className="p-6 space-y-5 lg:col-span-2">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-accent" />
          <h2 className="font-bold text-lg">{t("calc.title")}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t("calc.desc")}</p>

        <div className="space-y-2">
          <Label>{t("calc.daily_sales")}</Label>
          <div className="relative">
            <Input
              type="number"
              min="0"
              step="100"
              inputMode="decimal"
              value={dailyPoints}
              onChange={(e) => setDailyPoints(e.target.value)}
              className="text-lg font-bold h-12 pe-16"
              placeholder="5000"
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">{t("calc.points")}</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("calc.daily_sales.hint")}</p>
        </div>

        <div className="space-y-2">
          <Label>{t("calc.level")}</Label>
          <Select value={String(level)} onValueChange={(v) => setLevel(Number(v))}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              {rates.map((r) => (
                <SelectItem key={r.level_distance} value={String(r.level_distance)}>
                  {levelLabels[r.level_distance] ?? `Level ${r.level_distance}`} — {Number(r.percentage)}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{t("calc.level.hint")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border-2 border-dashed border-accent/40 bg-accent/5 p-3 space-y-1">
            <div className="text-[11px] text-muted-foreground">{t("calc.commission_rate")}</div>
            <div className="text-2xl font-extrabold text-accent">{Number(pct)}%</div>
          </div>
          <div className="rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3 space-y-1">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" />{t("calc.conv_factor")}</div>
            <div className="text-2xl font-extrabold text-primary">{conversionFactor.toFixed(4)}</div>
            <div className="text-[10px] text-muted-foreground">1 USD = {pointsPerUsd} {t("calc.points")}</div>
          </div>
        </div>
      </Card>

      <div className="lg:col-span-3 space-y-4">
        <Card className="relative overflow-hidden p-6 bg-gradient-to-br from-emerald-500/10 via-amber-400/5 to-emerald-500/10 border-emerald-500/30">
          <CashCounterIllustration intensity={intensity} />
          <div className="relative grid gap-4 sm:grid-cols-2 mt-2">
            <Stat
              label={t("calc.expected_yearly_sales")}
              value={`${fmtPts(yearly)} ${t("calc.points")} ≈ ${fmtUsd(yearlyUsd)}`}
              accent="text-sky-600 dark:text-sky-400"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <Stat
              label={t("calc.expected_monthly_sales")}
              value={`${fmtPts(monthly)} ${t("calc.points")} ≈ ${fmtUsd(monthlyUsd)}`}
              accent="text-sky-600 dark:text-sky-400"
            />
            <Stat
              label={t("calc.expected_monthly_commission")}
              value={fmtUsd(monthlyCommission)}
              accent="text-amber-600 dark:text-amber-400"
            />
            <Stat
              label={t("calc.expected_yearly_commission")}
              value={fmtUsd(yearlyCommission)}
              accent="text-emerald-600 dark:text-emerald-400"
              big
              icon={<Sparkles className="h-4 w-4" />}
            />
          </div>
          <div className="relative mt-4 rounded-md bg-background/60 backdrop-blur p-3 text-[11px] text-muted-foreground space-y-1 font-mono">
            <div>{fmtPts(daily)} × 365 = {fmtPts(yearly)} {t("calc.points")}</div>
            <div>{fmtPts(yearly)} × {conversionFactor.toFixed(4)} = {fmtUsd(yearlyUsd)}</div>
            <div className="text-emerald-700 dark:text-emerald-400 font-bold">{fmtUsd(yearlyUsd)} × {Number(pct)}% = {fmtUsd(yearlyCommission)}</div>
          </div>
          <p className="relative mt-3 text-xs text-muted-foreground italic">{t("calc.disclaimer")}</p>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, big, icon }: { label: string; value: string; accent: string; big?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={`rounded-lg bg-background/70 backdrop-blur p-4 border ${big ? "border-emerald-500/40 shadow-lg" : "border-border"}`}>
      <div className="text-[11px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`${big ? "text-2xl" : "text-base"} font-extrabold ${accent}`}>{value}</div>
    </div>
  );
}
