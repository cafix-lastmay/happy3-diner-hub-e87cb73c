// Reusable shift control for waiter/chef/manager.
// New flow: staff clicks "start" to request a shift. If admin/manager has
// already enabled their shift permission (shift_enabled=true), the shift
// becomes active immediately. Otherwise it stays pending until the
// supervisor toggles the permission ON. Closing is done by the supervisor.
//
// On shift close (active -> none), we fetch the just-closed shift summary
// (orders count, tips, sales total, duration) and show it to the staff member.
import { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Clock, Play, X } from "lucide-react";

interface ActiveShift { id: string; status: "pending" | "active" | "closed" | "rejected"; requested_at: string; approved_at: string | null }

interface ShiftSummary {
  id: string;
  staff_role: string;
  requested_at: string;
  approved_at: string | null;
  closed_at: string | null;
  tips_total: number;
  orders_count: number;
  sales_total: number;
}

function formatDuration(a: string, b: string | null): string {
  if (!b) return "—";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function ShiftStatus({ onChange }: { onChange?: (shiftId: string | null) => void }) {
  const { t } = useI18n();
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  // Track previously known active shift so we can detect "just closed"
  const prevActiveIdRef = useRef<string | null>(null);

  const fetchSummary = useCallback(async (shiftId: string) => {
    const { data: sh } = await supabase
      .from("shifts")
      .select("id,staff_role,requested_at,approved_at,closed_at,tips_total,orders_count")
      .eq("id", shiftId)
      .maybeSingle();
    if (!sh) return;
    // Sum order totals for that shift (excluding cancelled)
    const { data: ords } = await supabase
      .from("orders")
      .select("total,status")
      .eq("shift_id", shiftId);
    const sales = (ords ?? [])
      .filter((o: { status: string }) => o.status !== "cancelled")
      .reduce((acc: number, o: { total: number }) => acc + Number(o.total ?? 0), 0);
    setSummary({
      id: sh.id,
      staff_role: sh.staff_role as string,
      requested_at: sh.requested_at as string,
      approved_at: sh.approved_at as string | null,
      closed_at: sh.closed_at as string | null,
      tips_total: Number(sh.tips_total ?? 0),
      orders_count: Number(sh.orders_count ?? 0),
      sales_total: sales,
    });
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_active_shift");
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    const row = (data ?? [])[0] ?? null;
    const newActiveId = row && row.status === "active" ? row.id : null;
    // Detect transition: had an active shift, now we don't -> show summary
    if (prevActiveIdRef.current && !newActiveId) {
      fetchSummary(prevActiveIdRef.current);
    }
    prevActiveIdRef.current = newActiveId;
    setShift(row);
    onChange?.(newActiveId);
  }, [onChange, fetchSummary]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const [requesting, setRequesting] = useState(false);
  const request = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const { error } = await supabase.rpc("request_shift");
      if (error) { toast.error(error.message); return; }
      toast.success(t("shift.requested"));
      // Starting a new shift -> dismiss old summary
      setSummary(null);
      await load();
    } finally {
      setRequesting(false);
    }
  };

  if (loading) return null;

  return (
    <>
      {summary && (
        <Card className="p-4 mb-4 border-accent/40 bg-accent/10">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="font-bold">{t("shift.summary.title")}</div>
              <div className="text-xs text-muted-foreground mt-1">
                <Badge variant="outline" className="mr-2">{t(`staff.role.${summary.staff_role}`)}</Badge>
                {formatDuration(summary.approved_at ?? summary.requested_at, summary.closed_at)}
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSummary(null)} aria-label="dismiss"><X className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">{t("shift.summary.orders")}</div>
              <div className="text-xl font-bold">{summary.orders_count}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">{t("shift.summary.sales")}</div>
              <div className="text-xl font-bold text-accent">{summary.sales_total.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground">{t("shift.summary.tips")}</div>
              <div className="text-xl font-bold text-accent">{summary.tips_total.toFixed(2)}</div>
            </div>
          </div>
        </Card>
      )}
      <Card className="p-4 mb-6 border-accent/40 bg-accent/5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-accent" />
            <div>
              <div className="font-semibold">{t("shift.title")}</div>
              {shift ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={shift.status === "active" ? "default" : "secondary"}>{t(`shift.status.${shift.status}`)}</Badge>
                  <span>{t("shift.started_at")}: {new Date(shift.approved_at ?? shift.requested_at).toLocaleString()}</span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-1">{t("shift.no_active")}</div>
              )}
            </div>
          </div>
          <div className="flex items-end gap-2">
            {!shift && (
              <Button size="sm" onClick={request} disabled={requesting} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                <Play className="h-3 w-3" /> {requesting ? t("common.loading") : t("shift.request")}
              </Button>
            )}
            {shift?.status === "pending" && (
              <Badge variant="outline">{t("shift.waiting_permission")}</Badge>
            )}
            {shift?.status === "active" && (
              <Badge className="bg-accent text-accent-foreground">{t("shift.in_progress")}</Badge>
            )}
          </div>
        </div>
        {shift?.status === "pending" && (
          <p className="text-xs text-muted-foreground mt-3">{t("shift.permission_hint")}</p>
        )}
      </Card>
    </>
  );
}
