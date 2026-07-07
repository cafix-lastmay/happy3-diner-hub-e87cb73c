// Owner-only dialog: adjust marketer or cafeteria balance with delta + reason.
import { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  refCode: string;
  kind: "cafeteria_points" | "marketer";
  trigger: React.ReactNode;
  onDone?: () => void;
}

export function AdjustBalanceDialog({ refCode, kind, trigger, onDone }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [marketerKind, setMarketerKind] = useState<"available" | "frozen">("available");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = Number(delta);
    if (!d || isNaN(d)) { toast.error(t("error.required_field")); return; }
    setBusy(true);
    try {
      if (kind === "cafeteria_points") {
        const { error } = await supabase.rpc("owner_adjust_cafeteria_points", { _ref_code: refCode, _delta: d, _reason: reason || undefined });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("owner_adjust_marketer_balance", { _ref_code: refCode, _kind: marketerKind, _delta: d, _reason: reason || undefined });
        if (error) throw error;
      }
      toast.success(t("common.success"));
      setOpen(false); setDelta(""); setReason("");
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === "cafeteria_points" ? t("owner.actions.recharge_points") : t("owner.actions.adjust_balance")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {kind === "marketer" && (
            <div className="space-y-2">
              <Label>{t("owner.balance.kind")}</Label>
              <Select value={marketerKind} onValueChange={(v) => setMarketerKind(v as "available" | "frozen")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">{t("owner.balance.available")}</SelectItem>
                  <SelectItem value="frozen">{t("owner.balance.frozen")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>{t("owner.balance.delta")}</Label>
            <Input type="number" step="0.01" required value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="100 or -50" />
            <p className="text-xs text-muted-foreground">{t("owner.balance.delta_hint")}</p>
          </div>
          <div className="space-y-2">
            <Label>{t("owner.balance.reason")}</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {busy ? t("common.loading") : t("common.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
