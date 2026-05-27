// Owner-only suspend/unsuspend dialog for a cafeteria.
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  refCode: string;
  isSuspended: boolean;
  currentReason?: string | null;
  onDone?: () => void;
  trigger: ReactNode;
}

export function SuspendCafeteriaDialog({ refCode, isSuspended, currentReason, onDone, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(currentReason ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("owner_set_cafeteria_suspension", {
      _ref_code: refCode,
      _suspended: !isSuspended,
      _reason: !isSuspended ? (reason.trim() || undefined) : undefined,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isSuspended ? "تم تفعيل الكافيتريا" : "تم إيقاف الكافيتريا");
    setOpen(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isSuspended ? "تفعيل الكافيتريا" : "إيقاف الكافيتريا"}</DialogTitle>
        </DialogHeader>
        {!isSuspended ? (
          <div className="space-y-2">
            <Label>سبب الإيقاف (يظهر للكافيتريا)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} placeholder="مثال: مخالفة الشروط..." />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">سيتم رفع الإيقاف وتعود الكافيتريا للعمل فوراً.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button
            onClick={submit}
            disabled={busy}
            className={isSuspended ? "bg-green-600 hover:bg-green-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
          >
            {busy ? "..." : isSuspended ? "تفعيل" : "إيقاف"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
