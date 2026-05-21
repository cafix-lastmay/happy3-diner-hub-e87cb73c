// Lists cafeteria staff: persistent shift permission toggle + work scope dialog.
// Used by both cafeteria admin and manager. Manager scope: only sees waiter/chef.
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StaffScopeDialog } from "@/components/StaffScopeDialog";

interface StaffRow {
  staff_id: string;
  user_id: string;
  role: "manager" | "waiter" | "chef";
  is_active: boolean;
  shift_enabled: boolean;
  email: string | null;
  full_name: string | null;
}

export function StaffActivePanel({ managerScope = false, cafeteriaRefCode }: { managerScope?: boolean; cafeteriaRefCode: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [scopeTarget, setScopeTarget] = useState<StaffRow | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_my_staff_with_profiles");
    if (error) { toast.error(error.message); return; }
    let list = (data ?? []) as StaffRow[];
    if (managerScope) list = list.filter((r) => r.role !== "manager");
    setRows(list);
  }, [managerScope]);

  useEffect(() => { load(); }, [load]);

  const togglePermission = async (r: StaffRow) => {
    const { error } = await supabase.rpc("set_staff_shift_enabled", { _staff_id: r.staff_id, _enabled: !r.shift_enabled });
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
    load();
  };

  return (
    <Card className="p-4">
      <h2 className="text-lg font-semibold mb-1">{t("staff.access.title")}</h2>
      <p className="text-xs text-muted-foreground mb-3">{t("staff.access.desc")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("staff.no_staff")}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.staff_id} className="flex items-center justify-between border border-border rounded-md p-3 gap-3 flex-wrap">
              <div>
                <div className="font-medium text-sm">{r.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground flex gap-2 mt-1 items-center flex-wrap">
                  <Badge variant="outline">{t(`staff.role.${r.role}`)}</Badge>
                  <span>{r.email ?? "—"}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {(r.role === "chef" || r.role === "waiter") && (
                  <Button size="sm" variant="outline" onClick={() => setScopeTarget(r)} className="gap-1">
                    <Settings2 className="h-3 w-3" />
                    {t(`staff.scope.${r.role === "chef" ? "category" : "section"}.button`)}
                  </Button>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{r.shift_enabled ? t("staff.access.enabled") : t("staff.access.disabled")}</span>
                  <Switch checked={r.shift_enabled} onCheckedChange={() => togglePermission(r)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {scopeTarget && (scopeTarget.role === "chef" || scopeTarget.role === "waiter") && (
        <StaffScopeDialog
          open={!!scopeTarget}
          onOpenChange={(o) => { if (!o) setScopeTarget(null); }}
          staffId={scopeTarget.staff_id}
          staffName={scopeTarget.full_name ?? "—"}
          role={scopeTarget.role}
          cafeteriaRefCode={cafeteriaRefCode}
        />
      )}
    </Card>
  );
}
