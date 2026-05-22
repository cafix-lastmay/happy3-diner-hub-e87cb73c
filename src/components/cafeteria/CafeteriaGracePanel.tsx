// Renders one of three states for the signed-in cafeteria admin:
//   - nothing (no grace period in progress)
//   - warning banner with a real-time countdown (in grace, not yet expired)
//   - full-screen block overlay (grace expired) with link to /cafeteria/recharge
//
// Uses postgres_changes realtime so the moment a recharge clears the grace,
// the banner/block screen disappears without a manual refresh.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { AlertTriangle, Ban, Wallet } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";

interface GraceRow {
  grace_period_active: boolean;
  grace_period_started_at: string | null;
  points_balance: number;
}

const GRACE_HOURS = 72;

function useGrace() {
  const { user, refCode } = useAuth();
  const [row, setRow] = useState<GraceRow | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      supabase
        .from("cafeterias")
        .select("grace_period_active, grace_period_started_at, points_balance")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => { if (!cancelled && data) setRow(data as GraceRow); });
    };
    load();
    if (!refCode) return () => { cancelled = true; };

    // Guard against duplicate channel creation on re-renders.
    if (channelRef.current) return () => { cancelled = true; };

    // Unique suffix avoids Supabase v2 topic-dedup conflict when this hook
    // is mounted twice on the same page (banner + block gate). Sharing a
    // topic returns the same channel instance, and calling .on() on a
    // channel that has already been .subscribe()'d throws.
    const uniqueSuffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase.channel(`cafe-grace-${refCode}-${uniqueSuffix}`);

    // CRITICAL: register all .on() listeners BEFORE .subscribe().
    channel.on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "cafeterias", filter: `ref_code=eq.${refCode}` },
      () => load(),
    );
    channel.subscribe();
    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, refCode]);

  return row;
}

function useCountdown(startedAt: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return { totalSec: 0, blocked: true };
  const endMs = new Date(startedAt).getTime() + GRACE_HOURS * 3600 * 1000;
  const sec = Math.max(0, Math.floor((endMs - now) / 1000));
  return { totalSec: sec, blocked: sec <= 0 };
}

function format(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Top-of-page warning banner (renders nothing unless in active grace and not yet blocked). */
export function CafeteriaGraceBanner() {
  const { t } = useI18n();
  const row = useGrace();
  const { totalSec, blocked } = useCountdown(row?.grace_period_started_at ?? null);
  if (!row?.grace_period_active || blocked) return null;
  return (
    <div className="mb-4 rounded-lg border border-orange-500/60 bg-orange-500/10 p-3 flex items-center gap-3 text-orange-700 dark:text-orange-300">
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <div className="text-sm flex-1">
        <div className="font-semibold">{t("cafeteria.grace.banner_title")}</div>
        <div className="text-xs opacity-90">
          {t("cafeteria.grace.banner_remaining")}: <span className="font-mono font-bold">{format(totalSec)}</span>
        </div>
      </div>
      <Link to="/cafeteria/recharge">
        <Button size="sm" variant="outline" className="border-orange-500 gap-1">
          <Wallet className="h-3 w-3" /> {t("cafeteria.nav.recharge")}
        </Button>
      </Link>
    </div>
  );
}

/**
 * Gate that, when the cafeteria is blocked (grace expired), replaces the page
 * content with a block screen — except on /cafeteria/recharge where the admin
 * needs to actually submit a recharge.
 */
export function CafeteriaBlockGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const row = useGrace();
  const { blocked } = useCountdown(row?.grace_period_started_at ?? null);
  const location = useLocation();
  const isRechargeRoute = location.pathname.startsWith("/cafeteria/recharge");
  if (!row?.grace_period_active || !blocked) return <>{children}</>;
  if (isRechargeRoute) return <>{children}</>;
  return (
    <Card className="p-8 border-destructive/50 bg-destructive/5 text-center max-w-xl mx-auto">
      <Ban className="h-12 w-12 mx-auto text-destructive mb-4" />
      <h2 className="text-xl font-bold mb-2">{t("cafeteria.blocked.title")}</h2>
      <p className="text-sm text-muted-foreground mb-6">{t("cafeteria.blocked.desc")}</p>
      <Link to="/cafeteria/recharge">
        <Button className="gap-2">
          <Wallet className="h-4 w-4" /> {t("cafeteria.nav.recharge")}
        </Button>
      </Link>
    </Card>
  );
}
