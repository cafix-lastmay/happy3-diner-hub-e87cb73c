// Owner: reset password for any user (marketer/cafeteria admin).
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractEdgeError } from "@/lib/edge-error";

interface Props { userId: string; trigger: React.ReactNode }

export function ResetPasswordDialog({ userId, trigger }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) { toast.error(t("staff.password_min")); return; }
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) { toast.error(t("staff.password_strength")); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("owner-admin", { body: { action: "reset_password", user_id: userId, new_password: pw } });
      if (error || (data as { error?: string })?.error) {
        const msg = await extractEdgeError(error, data, t("common.error"));
        throw new Error(msg);
      }
      toast.success(t("common.success"));
      setOpen(false); setPw("");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("owner.actions.reset_password")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("owner.password.new")}</Label>
            <Input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} />
            <p className="text-xs text-muted-foreground">8+ characters with letters and numbers. Avoid common passwords like "12345678".</p>
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">{busy ? t("common.loading") : t("common.save")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
