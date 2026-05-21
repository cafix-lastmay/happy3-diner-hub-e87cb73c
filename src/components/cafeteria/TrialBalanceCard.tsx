// Top summary card shown across all cafeteria-admin pages.
// Casio-digital style: black background, white labels, neon green numbers.
// Hides trial when 0/expired; always shows points balance.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";

interface Row {
  ref_code: string;
  points_balance: number;
  currency_code: string | null;
  free_trial_until: string | null;
  trial_consumed: boolean;
}

export function TrialBalanceCard() {
  const { t } = useI18n();
  const { user, refCode } = useAuth();
  const [row, setRow] = useState<Row | null>(null);
  const [graceUntil, setGraceUntil] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = () => {
      supabase.from("cafeterias")
        .select("ref_code, points_balance, currency_code, free_trial_until, trial_consumed")
        .eq("user_id", user.id).maybeSingle()
        .then(async ({ data }) => {
          if (!data) return;
          setRow(data as Row);
          const { data: gp } = await supabase.from("custom_grace_periods")
            .select("start_date,days").eq("cafeteria_ref_code", data.ref_code);
          const future = (gp ?? [])
            .map((g) => new Date(new Date(g.start_date).getTime() + g.days * 86400000))
            .filter((d) => d.getTime() > Date.now())
            .sort((a, b) => b.getTime() - a.getTime());
          setGraceUntil(future[0]?.toISOString() ?? null);
        });
    };
    load();
    if (!refCode) return;
    const ch = supabase.channel(`cafe-balance-${refCode}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cafeterias", filter: `ref_code=eq.${refCode}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refCode]);

  const trialDaysLeft = (() => {
    const candidates: number[] = [];
    if (row?.free_trial_until && !row.trial_consumed) candidates.push(new Date(row.free_trial_until).getTime());
    if (graceUntil) candidates.push(new Date(graceUntil).getTime());
    if (!candidates.length) return 0;
    const ms = Math.max(...candidates) - Date.now();
    return ms > 0 ? Math.ceil(ms / 86400000) : 0;
  })();

  const showTrial = trialDaysLeft > 0;
  const points = Number(row?.points_balance ?? 0);

  return (
    <div
      className="mb-4 rounded-xl border border-border bg-[hsl(0_0%_6%)] text-white shadow-lg overflow-hidden"
      style={{ minHeight: "min(20vh, 160px)" }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 h-full">
        {showTrial && (
          <div className="p-4 sm:p-5 border-b sm:border-b-0 sm:border-e border-white/10 flex flex-col justify-center">
            <div className="text-[11px] sm:text-xs uppercase tracking-wider text-white/70">
              {t("cafeteria.trial.remaining")}
            </div>
            <div
              className="mt-1 font-mono font-bold leading-none"
              style={{
                color: "hsl(120 100% 55%)",
                textShadow: "0 0 8px hsl(120 100% 55% / 0.6)",
                fontSize: "clamp(2.2rem, 9vw, 3.5rem)",
              }}
            >
              {trialDaysLeft}
              <span className="ms-2 text-base sm:text-xl text-white/80 font-sans font-normal">
                {t("cafeteria.trial.days")}
              </span>
            </div>
          </div>
        )}
        <div className={`p-4 sm:p-5 flex flex-col justify-center ${!showTrial ? "sm:col-span-2" : ""}`}>
          <div className="text-[11px] sm:text-xs uppercase tracking-wider text-white/70">
            {t("cafeteria.points_balance")}
          </div>
          <div
            className="mt-1 font-mono font-bold leading-none"
            style={{
              color: "hsl(120 100% 55%)",
              textShadow: "0 0 8px hsl(120 100% 55% / 0.6)",
              fontSize: "clamp(2.2rem, 9vw, 3.5rem)",
            }}
          >
            {points.toFixed(2)}
            <span className="ms-2 text-base sm:text-xl text-white/80 font-sans font-normal">
              {row?.currency_code ?? ""}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
