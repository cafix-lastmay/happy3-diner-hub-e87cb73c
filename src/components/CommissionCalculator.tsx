// Marketing-style commission calculator — estimate yearly commission for a cafeteria.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Sparkles, TrendingUp } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { CashCounterIllustration } from "@/components/CashCounterIllustration";

interface Rate { level_distance: number; percentage: number }

export function CommissionCalculator() {
  const { t } = useI18n();
  const [rates, setRates] = useState<Rate[]>([]);
  const [dailySales, setDailySales] = useState<string>("1000");
  const [level, setLevel] = useState<number>(1);

  useEffect(() => {
    supabase.from("commission_rates").select("*").order("level_distance")
      .then(({ data }) => setRates((data ?? []) as Rate[]));
  }, []);

  const pct = useMemo(() => rates.find((r) => r.level_distance === level)?.percentage ?? 0, [rates, level]);
  const daily = Number(dailySales) || 0;
  const monthly = daily * 30;
  const yearly = daily * 365;
  const yearlyCommission = (yearly * Number(pct)) / 100;
  const monthlyCommission = (monthly * Number(pct)) / 100;

  const levelLabels: Record<number, string> = {
    1: t("calc.level.parent"),
    2: t("calc.level.grandparent"),
    3: t("calc.level.greatgrand"),
    4: t("calc.level.level4"),
  };

  const fmt = (n: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

  // Intensity grows with potential — bigger numbers = bigger animation
  const intensity = Math.min(1, yearlyCommission / 10000);

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
              step="50"
              inputMode="decimal"
              value={dailySales}
              onChange={(e) => setDailySales(e.target.value)}
              className="text-lg font-bold h-12 pe-12"
              placeholder="1000"
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">USD</span>
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

        <div className="rounded-lg border-2 border-dashed border-accent/40 bg-accent/5 p-3 space-y-1">
          <div className="text-xs text-muted-foreground">{t("calc.commission_rate")}</div>
          <div className="text-2xl font-extrabold text-accent">{Number(pct)}%</div>
        </div>
      </Card>

      <div className="lg:col-span-3 space-y-4">
        <Card className="relative overflow-hidden p-6 bg-gradient-to-br from-emerald-500/10 via-amber-400/5 to-emerald-500/10 border-emerald-500/30">
          <CashCounterIllustration intensity={intensity} />
          <div className="relative grid gap-4 sm:grid-cols-2 mt-2">
            <Stat
              label={t("calc.expected_yearly_sales")}
              value={`$${fmt(yearly)}`}
              accent="text-sky-600 dark:text-sky-400"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <Stat
              label={t("calc.expected_monthly_sales")}
              value={`$${fmt(monthly)}`}
              accent="text-sky-600 dark:text-sky-400"
            />
            <Stat
              label={t("calc.expected_monthly_commission")}
              value={`$${fmt(monthlyCommission)}`}
              accent="text-amber-600 dark:text-amber-400"
            />
            <Stat
              label={t("calc.expected_yearly_commission")}
              value={`$${fmt(yearlyCommission)}`}
              accent="text-emerald-600 dark:text-emerald-400"
              big
              icon={<Sparkles className="h-4 w-4" />}
            />
          </div>
          <p className="relative mt-4 text-xs text-muted-foreground italic">
            {t("calc.disclaimer")}
          </p>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, accent, big, icon }: { label: string; value: string; accent: string; big?: boolean; icon?: React.ReactNode }) {
  return (
    <div className={`rounded-lg bg-background/70 backdrop-blur p-4 border ${big ? "border-emerald-500/40 shadow-lg" : "border-border"}`}>
      <div className="text-[11px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`${big ? "text-3xl" : "text-xl"} font-extrabold ${accent}`}>{value}</div>
    </div>
  );
}
