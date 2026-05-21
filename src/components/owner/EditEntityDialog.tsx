// Owner-only dialog: edit basic info of marketer or cafeteria.
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Entity {
  ref_code: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  country_code?: string | null;
  currency_code?: string | null;
  is_active: boolean;
  free_trial_until?: string | null;
}

interface Props {
  kind: "marketer" | "cafeteria";
  entity: Entity;
  trigger: React.ReactNode;
  onDone?: () => void;
}

export function EditEntityDialog({ kind, entity, trigger, onDone }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: entity.name,
    email: entity.email ?? "",
    phone: entity.phone ?? "",
    whatsapp: entity.whatsapp ?? "",
    address: entity.address ?? "",
    is_active: entity.is_active,
    free_trial_until: entity.free_trial_until ? entity.free_trial_until.slice(0, 10) : "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {
        name: form.name, email: form.email || null, phone: form.phone || null,
        whatsapp: form.whatsapp || null, address: form.address || null, is_active: form.is_active,
      };
      if (kind === "cafeteria") patch.free_trial_until = form.free_trial_until ? new Date(form.free_trial_until).toISOString() : null;
      const { data, error } = await supabase.functions.invoke("owner-admin", {
        body: { action: kind === "marketer" ? "update_marketer" : "update_cafeteria", ref_code: entity.ref_code, patch },
      });
      if (error || (data as { error?: string })?.error) throw new Error((data as { error?: string })?.error ?? error?.message);
      toast.success(t("common.success"));
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("owner.actions.edit")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2"><Label>{t("common.name")}</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>{t("common.email")}</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t("common.phone")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>{t("common.whatsapp")}</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
            <div className="space-y-2"><Label>{t("common.address")}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          {kind === "cafeteria" && (
            <div className="space-y-2"><Label>Free trial until</Label><Input type="date" value={form.free_trial_until} onChange={(e) => setForm({ ...form, free_trial_until: e.target.value })} /></div>
          )}
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label htmlFor="is_active">{t("common.status")} ({form.is_active ? "Active" : "Inactive"})</Label>
            <Switch id="is_active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">{busy ? t("common.loading") : t("common.save")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
