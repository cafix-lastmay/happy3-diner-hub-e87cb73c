// Cafeteria dashboard indicator for daily points consumption cap.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Gauge, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Status { cap: number | null; scope: string; used: number }

export function DailyPointsCapCard({ refCode }: { refCode: string }) {
  const [s, setS] = useState<Status | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data, error } = await supabase.rpc("get_my_daily_points_cap_status", { _ref_code: refCode });
      if (!alive) return;
      if (!error && data) setS(data as unknown as Status);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [refCode]);

  if (!s) return null;
  const { cap, used } = s;
  if (cap == null) {
    return (
      <Card className="p-4 mb-4 flex items-center gap-3 max-w-md">
        <div className="rounded-full bg-mint/15 p-2 text-mint-foreground"><Gauge className="h-4 w-4" /></div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">النقاط المستهلكة اليوم</p>
          <p className="text-sm font-semibold">{used.toLocaleString()} <span className="text-muted-foreground font-normal">— بلا حد</span></p>
        </div>
      </Card>
    );
  }
  const pct = cap === 0 ? 100 : Math.min(100, Math.round((used / cap) * 100));
  const reached = used >= cap;
  const warn = pct >= 80;

  return (
    <Card className="p-4 mb-4 max-w-md">
      <div className="flex items-center gap-3 mb-2">
        <div className={`rounded-full p-2 ${reached ? "bg-destructive/15 text-destructive" : warn ? "bg-orange-500/15 text-orange-600" : "bg-violet/15 text-violet"}`}>
          {reached ? <AlertTriangle className="h-4 w-4" /> : <Gauge className="h-4 w-4" />}
        </div>
        <div className="flex-1">
          <p className="text-xs text-muted-foreground">النقاط المستهلكة اليوم</p>
          <p className="text-sm font-semibold">
            {used.toLocaleString()} <span className="text-muted-foreground font-normal">من أصل {cap.toLocaleString()}</span>
          </p>
        </div>
      </div>
      <Progress value={pct} className={reached ? "[&>div]:bg-destructive" : warn ? "[&>div]:bg-orange-500" : ""} />
      {reached && (
        <p className="text-xs text-destructive mt-2">
          تم الوصول للحد اليومي — الطلبات ستُسجَّل مدفوعة بدون خصم من رصيدك. سيستمر الخصم غداً.
        </p>
      )}
    </Card>
  );
}
