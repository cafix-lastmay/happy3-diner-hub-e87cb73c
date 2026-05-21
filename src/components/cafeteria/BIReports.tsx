// BI reports: sales timeseries, top items, orders by mode, peak hours.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Series = { day: string; orders_count: number; revenue: number };
type TopItem = { item_name: string; qty: number; revenue: number };
type ByMode = { mode: string; orders_count: number; revenue: number };
type Peak = { hour: number; orders_count: number; revenue: number };

const COLORS = ["hsl(var(--chart-1, 25 95% 53%))", "hsl(var(--chart-2, 0 0% 18%))", "hsl(var(--chart-3, 30 85% 50%))", "hsl(var(--chart-4, 0 0% 55%))", "hsl(var(--chart-5, 35 80% 70%))"];
const ORANGE = "oklch(0.72 0.19 50)";
const BLACK = "oklch(0.18 0.01 60)";

export function BIReports() {
  const { t } = useI18n();
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState<Series[]>([]);
  const [top, setTop] = useState<TopItem[]>([]);
  const [byMode, setByMode] = useState<ByMode[]>([]);
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      supabase.rpc("get_cafe_sales_timeseries", { _days: days }),
      supabase.rpc("get_cafe_top_items", { _days: days, _limit: 10 }),
      supabase.rpc("get_cafe_orders_by_mode", { _days: days }),
      supabase.rpc("get_cafe_peak_hours", { _days: days }),
    ]).then(([s, ti, bm, ph]) => {
      if (!active) return;
      setSeries((s.data as Series[]) || []);
      setTop((ti.data as TopItem[]) || []);
      setByMode((bm.data as ByMode[]) || []);
      setPeaks((ph.data as Peak[]) || []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [days]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{t("bi.title") || "تحليلات الأعمال"}</h2>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t("bi.last_7") || "آخر 7 أيام"}</SelectItem>
            <SelectItem value="30">{t("bi.last_30") || "آخر 30 يوم"}</SelectItem>
            <SelectItem value="90">{t("bi.last_90") || "آخر 90 يوم"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("bi.sales_timeseries") || "المبيعات اليومية"}</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Line type="monotone" dataKey="revenue" stroke={ORANGE} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="orders" stroke={BLACK} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("bi.top_items") || "أكثر الأصناف مبيعًا"}</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" fontSize={10} />
                <YAxis type="category" dataKey="item_name" width={100} fontSize={10} />
                <Tooltip />
                <Bar dataKey="qty" fill={ORANGE} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("bi.by_mode") || "الطلبات حسب النوع"}</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byMode} dataKey="orders" nameKey="mode" cx="50%" cy="50%" outerRadius={90} label>
                  {byMode.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("bi.peak_hours") || "ساعات الذروة"}</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peaks}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="hour" fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip />
                <Bar dataKey="orders" fill={BLACK} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
