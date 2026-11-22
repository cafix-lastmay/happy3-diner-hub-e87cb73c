// Marketer: read-only details of a direct child (sub-marketer or cafeteria).
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/marketer/children_/$ref")({ component: MarketerChildDetail });

interface Tx { id: string; amount_usd: number; status: string; created_at: string; level_distance: number }

function MarketerChildDetail() {
  const { t } = useI18n();
  const { ready } = useRequireRole("marketer");
  const { ref } = useParams({ from: "/marketer/children_/$ref" });
  const [info, setInfo] = useState<{ name: string; type: "marketer" | "cafeteria"; is_active?: boolean; created_at?: string } | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [totals, setTotals] = useState({ total: 0, released: 0, frozen: 0 });

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const [{ data: m }, { data: c }, { data: descendants }, { data: cafeterias }] = await Promise.all([
        supabase.from("marketers").select("name,is_active,created_at").eq("ref_code", ref).maybeSingle(),
        supabase.from("cafeterias").select("name,is_active,created_at").eq("ref_code", ref).maybeSingle(),
        supabase.rpc("get_my_marketer_descendants"),
        supabase.rpc("get_my_marketer_cafeterias"),
      ]);
      const marketer = (descendants ?? []).find((child) => child.ref_code === ref);
      const cafeteria = (cafeterias ?? []).find((child) => child.ref_code === ref);
      if (m) setInfo({ name: m.name || marketer?.name || "", type: "marketer", is_active: m.is_active, created_at: m.created_at });
      else if (c) setInfo({ name: c.name || cafeteria?.name || "", type: "cafeteria", is_active: c.is_active, created_at: c.created_at });
      else if (marketer) setInfo({ name: marketer.name, type: "marketer" });
      else if (cafeteria) setInfo({ name: cafeteria.name, type: "cafeteria" });

      const { data } = await supabase.from("commission_transactions")
        .select("id,amount_usd,status,created_at,level_distance")
        .eq("source_cafeteria_ref_code", ref)
        .order("created_at", { ascending: false }).limit(100);
      const list = (data ?? []) as Tx[];
      setTxs(list);
      const total = list.reduce((s, t) => s + Number(t.amount_usd), 0);
      const released = list.filter((t) => t.status === "released").reduce((s, t) => s + Number(t.amount_usd), 0);
      setTotals({ total, released, frozen: total - released });
    })();
  }, [ready, ref]);

  if (!ready) return <Redirecting />;
  return (
    <DashboardShell title={t("marketer.dashboard.title")} navItems={[]}>
      <Link to="/marketer"><Button variant="ghost" size="sm" className="gap-2 mb-4"><ArrowLeft className="h-4 w-4" /> {t("common.back") || "رجوع"}</Button></Link>

      <Card className="p-6 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-xs text-muted-foreground font-mono">{ref}</div>
            <h1 className="text-2xl font-bold mt-1">{info?.name ?? "—"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{info?.type}</Badge>
            {info && <Badge variant={info.is_active ? "default" : "secondary"}>{info.is_active ? t("common.active") || "نشط" : t("common.inactive") || "غير نشط"}</Badge>}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Card className="p-4"><div className="text-sm text-muted-foreground">{t("marketer.reports.total") || "إجمالي العمولات"}</div><div className="text-2xl font-bold text-accent mt-1">${totals.total.toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">{t("marketer.balance.available")}</div><div className="text-2xl font-bold mt-1">${totals.released.toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-sm text-muted-foreground">{t("marketer.balance.frozen")}</div><div className="text-2xl font-bold text-muted-foreground mt-1">${totals.frozen.toFixed(2)}</div></Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-3 text-start">{t("common.date")}</th>
              <th className="p-3 text-start">Level</th>
              <th className="p-3 text-start">{t("marketer.reports.total") || "Amount"}</th>
              <th className="p-3 text-start">{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {txs.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">—</td></tr>}
            {txs.map((tx) => (
              <tr key={tx.id} className="border-t border-border">
                <td className="p-3 text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</td>
                <td className="p-3">L{tx.level_distance}</td>
                <td className="p-3 font-semibold">${Number(tx.amount_usd).toFixed(2)}</td>
                <td className="p-3"><Badge variant={tx.status === "released" ? "default" : "secondary"}>{tx.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
