// Top summary card shown across all cafeteria-admin pages.
// Casio-digital style: black background, white labels, neon green numbers.
// Hides trial when 0/expired; always shows points balance.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";

interface Row {
  id: string;
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
  const [freePoints, setFreePoints] = useState<number>(0);
  const [graceUntil, setGraceUntil] = useState<string | null>(null);
  const [hasCustomGrace, setHasCustomGrace] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = () => {
      supabase.from("cafeterias")
        .select("id, ref_code, points_balance, currency_code, free_trial_until, trial_consumed")
        .eq("user_id", user.id).maybeSingle()
        .then(async ({ data }) => {
          if (!data) return;
          setRow(data as Row);
          const [{ data: gp }, { data: fb }] = await Promise.all([
            supabase.from("custom_grace_periods").select("start_date,days").eq("cafeteria_ref_code", data.ref_code),
            supabase.from("cafeteria_free_points_balance" as never).select("free_points").eq("cafeteria_id", (data as { id: string }).id).maybeSingle(),
          ]);
          setFreePoints(Number((fb as { free_points?: number } | null)?.free_points ?? 0));
          const ends = (gp ?? []).map((g) => new Date(new Date(g.start_date).getTime() + g.days * 86400000));
          setHasCustomGrace(ends.length > 0);
          const latest = ends.sort((a, b) => b.getTime() - a.getTime())[0];
          setGraceUntil(latest ? latest.toISOString() : null);
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
    // Custom grace period OVERRIDES default trial when present (even if expired).
    let endMs: number | null = null;
    if (hasCustomGrace) {
      endMs = graceUntil ? new Date(graceUntil).getTime() : null;
    } else if (row?.free_trial_until && !row.trial_consumed) {
      endMs = new Date(row.free_trial_until).getTime();
    }
    if (endMs === null) return 0;
    const ms = endMs - Date.now();
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
        <div className={`p-4 sm:p-5 flex flex-col justify-center gap-2 ${!showTrial ? "sm:col-span-2" : ""}`}>
          {freePoints > 0 ? (
            <>
              <div>
                <div className="text-[11px] sm:text-xs uppercase tracking-wider text-white/70">🎁 نقاط مجانية</div>
                <div className="mt-0.5 font-mono font-bold leading-none"
                  style={{ color: "hsl(45 100% 60%)", textShadow: "0 0 8px hsl(45 100% 60% / 0.6)", fontSize: "clamp(1.4rem, 6vw, 2.2rem)" }}>
                  {freePoints}
                </div>
              </div>
              <div>
                <div className="text-[11px] sm:text-xs uppercase tracking-wider text-white/70">💰 نقاط مشتراة</div>
                <div className="mt-0.5 font-mono font-bold leading-none"
                  style={{ color: "hsl(120 100% 55%)", textShadow: "0 0 8px hsl(120 100% 55% / 0.6)", fontSize: "clamp(1.4rem, 6vw, 2.2rem)" }}>
                  {points.toFixed(2)}
                  <span className="ms-2 text-sm text-white/80 font-sans font-normal">{row?.currency_code ?? ""}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-[11px] sm:text-xs uppercase tracking-wider text-white/70">
                {t("cafeteria.points_balance")}
              </div>
              <div className="mt-1 font-mono font-bold leading-none"
                style={{ color: "hsl(120 100% 55%)", textShadow: "0 0 8px hsl(120 100% 55% / 0.6)", fontSize: "clamp(2.2rem, 9vw, 3.5rem)" }}>
                {points.toFixed(2)}
                <span className="ms-2 text-base sm:text-xl text-white/80 font-sans font-normal">{row?.currency_code ?? ""}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
