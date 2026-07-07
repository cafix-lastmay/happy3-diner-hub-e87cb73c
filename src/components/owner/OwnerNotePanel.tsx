// Owner: edit private note shown on cafeteria detail + at every recharge.
import { useEffect, useState } from "react";
import { StickyNote, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function OwnerNotePanel({ refCode, initial }: { refCode: string; initial: string | null }) {
  const [note, setNote] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setNote(initial ?? ""); }, [initial]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("cafeterias").update({ owner_note: note || null }).eq("ref_code", refCode);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحفظ");
  };

  return (
    <Card className="p-6 mb-6 border-amber-500/40 bg-amber-500/5">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
        <StickyNote className="h-5 w-5 text-amber-600" /> ملاحظة خاصة (للمالك فقط)
      </h2>
      <p className="text-xs text-muted-foreground mb-2">تظهر هذه الملاحظة كبانر بارز عند فتح شاشة شحن النقاط لهذه الكافيه.</p>
      <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: هذه الكافيه لها معاملة خاصة..." />
      <Button size="sm" className="mt-2 gap-2" onClick={save} disabled={busy}>
        <Save className="h-4 w-4" /> {busy ? "جارٍ الحفظ..." : "حفظ الملاحظة"}
      </Button>
    </Card>
  );
}
