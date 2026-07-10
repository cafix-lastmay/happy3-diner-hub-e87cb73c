// Owner: manage monthly free-points grants for a single cafeteria.
import { useCallback, useEffect, useState } from "react";
import { Gift, Ban, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Grant {
  id: string;
  monthly_points: number;
  duration_months: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
  note: string | null;
  created_at: string;
}

interface Balance {
  free_points: number;
  last_grant_date: string | null;
}

function firstOfNextMonth(): string {
  const d = new Date();
  const nm = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return nm.toISOString().slice(0, 10);
}

export function FreePointsGrantsPanel({ cafeteriaId }: { cafeteriaId: string }) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [open, setOpen] = useState(false);
  const [monthlyPoints, setMonthlyPoints] = useState("100");
  const [durationMonths, setDurationMonths] = useState("3");
  const [startDate, setStartDate] = useState(firstOfNextMonth());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Grant | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: g }, { data: b }] = await Promise.all([
      supabase.from("cafeteria_free_points_grants" as never)
        .select("*").eq("cafeteria_id", cafeteriaId).order("created_at", { ascending: false }),
      supabase.from("cafeteria_free_points_balance" as never)
        .select("free_points, last_grant_date").eq("cafeteria_id", cafeteriaId).maybeSingle(),
    ]);
    setGrants((g ?? []) as Grant[]);
    setBalance((b ?? null) as Balance | null);
  }, [cafeteriaId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.rpc("owner_grant_free_points" as never, {
        _cafeteria_id: cafeteriaId,
        _monthly_points: Number(monthlyPoints),
        _duration_months: Number(durationMonths),
        _start_date: startDate,
        _note: note || null,
      } as never);
      if (error) throw error;
      toast.success("تم منح النقاط المجانية");
      setOpen(false); setNote(""); setMonthlyPoints("100"); setDurationMonths("3"); setStartDate(firstOfNextMonth());
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally { setBusy(false); }
  };

  const cancel = async (id: string) => {
    setCancelBusy(true);
    try {
      const { error } = await supabase.rpc("owner_cancel_free_points_grant" as never, { _grant_id: id } as never);
      if (error) throw error;
      toast.success("تم الإلغاء");
      setCancelTarget(null);
      await load();
    } catch (err) {
      toast.error((err as Error).message || "تعذر إلغاء المنحة");
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Gift className="h-5 w-5 text-accent" /> النقاط المجانية الشهرية
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="h-4 w-4" /> منح نقاط مجانية
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>منح نقاط مجانية شهرية</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <Label>عدد النقاط شهرياً</Label>
                <Input type="number" min="1" required value={monthlyPoints} onChange={(e) => setMonthlyPoints(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>عدد الأشهر</Label>
                <Input type="number" min="1" required value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>تاريخ البداية</Label>
                <Input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <p className="text-xs text-muted-foreground">افتراضياً أول الشهر القادم. إن اخترت اليوم أو قبله سيُضاف الرصيد الأول فوراً.</p>
              </div>
              <div className="space-y-1">
                <Label>ملاحظة (اختياري)</Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy} className="w-full">{busy ? "جارٍ الحفظ..." : "حفظ"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4 rounded-lg bg-muted/40 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">الرصيد المجاني الحالي</span>
          <span className="font-bold text-accent text-lg">{balance?.free_points ?? 0}</span>
        </div>
        {balance?.last_grant_date && (
          <div className="text-xs text-muted-foreground mt-1">آخر منح: {balance.last_grant_date}</div>
        )}
      </div>

      {grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد منح.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="p-2 text-start">نقاط/شهر</th>
                <th className="p-2 text-start">المدة</th>
                <th className="p-2 text-start">من</th>
                <th className="p-2 text-start">إلى</th>
                <th className="p-2 text-start">الحالة</th>
                <th className="p-2 text-start">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id} className="border-t border-border">
                  <td className="p-2 font-semibold">{g.monthly_points}</td>
                  <td className="p-2">{g.duration_months} شهر</td>
                  <td className="p-2">{g.start_date}</td>
                  <td className="p-2">{g.end_date}</td>
                  <td className="p-2">
                    <Badge variant={g.is_active ? "default" : "secondary"}>
                      {g.is_active ? "نشطة" : "منتهية"}
                    </Badge>
                  </td>
                  <td className="p-2">
                    {g.is_active && (
                      <Button size="sm" variant="outline" className="gap-1" disabled={cancelBusy} onClick={() => setCancelTarget(g)}>
                        <Ban className="h-3 w-3" /> {cancelBusy && cancelTarget?.id === g.id ? "جارٍ الإلغاء..." : "إلغاء"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!cancelTarget} onOpenChange={(next) => !cancelBusy && !next && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء المنحة المجانية؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إيقاف هذه المنحة فوراً، وإذا لم توجد منحة نشطة أخرى لهذا الكافيه سيتم تصفير الرصيد المجاني الحالي.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelBusy}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelBusy || !cancelTarget}
              onClick={(e) => {
                e.preventDefault();
                if (cancelTarget) void cancel(cancelTarget.id);
              }}
            >
              {cancelBusy ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
