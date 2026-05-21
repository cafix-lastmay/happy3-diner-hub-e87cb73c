// Shift history report for a cafeteria. Filters by date range and role.
// Shows tips, order count, duration per shift + totals.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ShiftRow {
  id: string;
  staff_user_id: string;
  staff_role: "manager" | "waiter" | "chef";
  status: string;
  requested_at: string;
  approved_at: string | null;
  closed_at: string | null;
  tips_total: number;
  orders_count: number;
}
interface Profile { id: string; full_name: string | null; email: string | null }

export function ShiftReports({ cafeteriaRefCode }: { cafeteriaRefCode: string }) {
  const { t } = useI18n();
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const [from, setFrom] = useState(fmt(weekAgo));
  const [to, setTo] = useState(fmt(today));
  const [role, setRole] = useState<string>("all");
  const [rows, setRows] = useState<ShiftRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  useEffect(() => {
    const fromTs = new Date(from + "T00:00:00").toISOString();
    const toTs = new Date(to + "T23:59:59").toISOString();
    supabase.from("shifts")
      .select("id,staff_user_id,staff_role,status,requested_at,approved_at,closed_at,tips_total,orders_count")
      .eq("cafeteria_ref_code", cafeteriaRefCode)
      .gte("requested_at", fromTs)
      .lte("requested_at", toTs)
      .order("requested_at", { ascending: false })
      .then(async ({ data, error }) => {
        if (error) { toast.error(error.message); return; }
        const list = (data ?? []) as ShiftRow[];
        setRows(list);
        const ids = Array.from(new Set(list.map((r) => r.staff_user_id)));
        if (ids.length) {
          const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
          const map: Record<string, Profile> = {};
          (profs ?? []).forEach((p) => { map[p.id] = p as Profile; });
          setProfiles(map);
        }
      });
  }, [cafeteriaRefCode, from, to]);

  const filtered = useMemo(() => role === "all" ? rows : rows.filter((r) => r.staff_role === role), [rows, role]);
  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        tips: acc.tips + Number(r.tips_total ?? 0),
        orders: acc.orders + Number(r.orders_count ?? 0),
        count: acc.count + 1,
      }),
      { tips: 0, orders: 0, count: 0 },
    );
  }, [filtered]);

  const duration = (a: string, b: string | null) => {
    if (!b) return "—";
    const ms = new Date(b).getTime() - new Date(a).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div><Label>{t("reports.from")}</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>{t("reports.to")}</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div>
            <Label>{t("common.role")}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("reports.all_roles")}</SelectItem>
                <SelectItem value="manager">{t("staff.role.manager")}</SelectItem>
                <SelectItem value="waiter">{t("staff.role.waiter")}</SelectItem>
                <SelectItem value="chef">{t("staff.role.chef")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 bg-accent/5"><div className="text-xs text-muted-foreground">{t("reports.shifts_count")}</div><div className="text-2xl font-bold">{totals.count}</div></Card>
        <Card className="p-4 bg-accent/5"><div className="text-xs text-muted-foreground">{t("reports.orders_total")}</div><div className="text-2xl font-bold">{totals.orders}</div></Card>
        <Card className="p-4 bg-accent/5"><div className="text-xs text-muted-foreground">{t("reports.tips_total")}</div><div className="text-2xl font-bold text-accent">{totals.tips.toFixed(2)}</div></Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr>
            <th className="p-3 text-start">{t("staff.full_name")}</th>
            <th className="p-3 text-start">{t("common.role")}</th>
            <th className="p-3 text-start">{t("common.status")}</th>
            <th className="p-3 text-start">{t("reports.start")}</th>
            <th className="p-3 text-start">{t("reports.duration")}</th>
            <th className="p-3 text-end">{t("reports.orders")}</th>
            <th className="p-3 text-end">{t("reports.tips")}</th>
          </tr></thead>
          <tbody>
            {filtered.map((r) => {
              const p = profiles[r.staff_user_id];
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-3">{p?.full_name ?? "—"}</td>
                  <td className="p-3"><Badge variant="outline">{t(`staff.role.${r.staff_role}`)}</Badge></td>
                  <td className="p-3"><Badge>{t(`shift.status.${r.status}`)}</Badge></td>
                  <td className="p-3 text-xs">{new Date(r.requested_at).toLocaleString()}</td>
                  <td className="p-3 text-xs">{duration(r.requested_at, r.closed_at)}</td>
                  <td className="p-3 text-end">{r.orders_count}</td>
                  <td className="p-3 text-end font-medium text-accent">{Number(r.tips_total).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
