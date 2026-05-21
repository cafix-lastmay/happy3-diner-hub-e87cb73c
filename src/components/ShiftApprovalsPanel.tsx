// Lists pending + active shifts and lets admin/manager approve, reject, or force-close.
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, Square } from "lucide-react";

interface ShiftRow {
  id: string;
  staff_user_id: string;
  staff_role: string;
  status: "pending" | "active" | "closed" | "rejected";
  requested_at: string;
  approved_at: string | null;
  tips_total: number;
  orders_count: number;
}
interface Profile { id: string; full_name: string | null; email: string | null }

export function ShiftApprovalsPanel({ cafeteriaRefCode }: { cafeteriaRefCode: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("shifts")
      .select("id,staff_user_id,staff_role,status,requested_at,approved_at,tips_total,orders_count")
      .eq("cafeteria_ref_code", cafeteriaRefCode)
      .in("status", ["pending", "active"])
      .order("requested_at", { ascending: false });
    if (error) { toast.error(error.message); return; }
    const list = (data ?? []) as ShiftRow[];
    setRows(list);
    if (list.length) {
      const ids = Array.from(new Set(list.map((r) => r.staff_user_id)));
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      const map: Record<string, Profile> = {};
      (profs ?? []).forEach((p) => { map[p.id] = p as Profile; });
      setProfiles(map);
    }
  }, [cafeteriaRefCode]);

  useEffect(() => {
    load();
    const ch = supabase.channel(`shifts-${cafeteriaRefCode}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts", filter: `cafeteria_ref_code=eq.${cafeteriaRefCode}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [cafeteriaRefCode, load]);

  const approve = async (id: string) => {
    const { error } = await supabase.rpc("approve_shift", { _shift_id: id });
    if (error) toast.error(error.message); else { toast.success(t("shift.approved")); load(); }
  };
  const reject = async (id: string) => {
    const { error } = await supabase.rpc("reject_shift", { _shift_id: id });
    if (error) toast.error(error.message); else { toast.success(t("shift.rejected")); load(); }
  };
  const close = async (id: string) => {
    const { error } = await supabase.rpc("close_shift", { _shift_id: id });
    if (error) toast.error(error.message); else { toast.success(t("shift.closed")); load(); }
  };

  return (
    <Card className="p-4">
      <h2 className="text-lg font-semibold mb-3">{t("shift.approvals.title")}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("shift.approvals.none")}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const p = profiles[r.staff_user_id];
            return (
              <div key={r.id} className="flex items-center justify-between border border-border rounded-md p-3 gap-2 flex-wrap">
                <div>
                  <div className="font-medium text-sm">{p?.full_name ?? "—"} <span className="text-muted-foreground">({p?.email ?? "—"})</span></div>
                  <div className="text-xs text-muted-foreground flex gap-2 mt-1 items-center">
                    <Badge variant="outline">{t(`staff.role.${r.staff_role}`)}</Badge>
                    <Badge variant={r.status === "active" ? "default" : "secondary"}>{t(`shift.status.${r.status}`)}</Badge>
                    <span>{new Date(r.requested_at).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => approve(r.id)} className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1">
                        <Check className="h-3 w-3" /> {t("common.approve")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => reject(r.id)} className="gap-1">
                        <X className="h-3 w-3" /> {t("common.reject")}
                      </Button>
                    </>
                  )}
                  {r.status === "active" && (
                    <Button size="sm" variant="destructive" onClick={() => close(r.id)} className="gap-1">
                      <Square className="h-3 w-3" /> {t("shift.force_close")}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
