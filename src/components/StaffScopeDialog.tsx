// Dialog for assigning chef categories or waiter sections.
// Empty selection = "All" (no scope filtering applied for that staff).
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Option { id: string; name: string }
interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  staffId: string;
  staffName: string;
  role: "chef" | "waiter";
  cafeteriaRefCode: string;
}

export function StaffScopeDialog({ open, onOpenChange, staffId, staffName, role, cafeteriaRefCode }: Props) {
  const { t } = useI18n();
  const kind = role === "chef" ? "category" : "section";
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const table = kind === "category" ? "menu_categories" : "table_sections";
      const [{ data: opts }, { data: scopes }] = await Promise.all([
        supabase.from(table).select("id,name").eq("cafeteria_ref_code", cafeteriaRefCode).eq("is_active", true).order("sort_order"),
        supabase.from("staff_scopes").select("ref_id").eq("staff_id", staffId).eq("kind", kind),
      ]);
      setOptions((opts ?? []) as Option[]);
      setSelected(new Set((scopes ?? []).map((s: { ref_id: string }) => s.ref_id)));
      setLoading(false);
    })();
  }, [open, staffId, kind, cafeteriaRefCode]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const selectAll = () => setSelected(new Set(options.map((o) => o.id)));
  const clearAll = () => setSelected(new Set());

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("set_staff_scopes", {
      _staff_id: staffId,
      _kind: kind,
      _ref_ids: Array.from(selected),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`staff.scope.${kind}.title`)} — {staffName}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2 mb-2">{t(`staff.scope.${kind}.hint`)}</p>
        <div className="flex gap-2 mb-2">
          <Button size="sm" variant="outline" onClick={selectAll}>{t("staff.scope.select_all")}</Button>
          <Button size="sm" variant="ghost" onClick={clearAll}>{t("staff.scope.clear")}</Button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(`staff.scope.${kind}.empty`)}</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 border border-border rounded-md p-2 cursor-pointer hover:bg-muted/40">
                <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} />
                <span className="text-sm">{o.name}</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {busy ? t("common.loading") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
