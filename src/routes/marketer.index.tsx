import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Network, Percent, Banknote, Plus, BarChart3, ChevronLeft, Calculator } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReferralShare } from "@/components/ReferralShare";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";
import { extractEdgeError } from "@/lib/edge-error";

export const Route = createFileRoute("/marketer/")({
  component: MarketerDashboard,
});

interface Me { ref_code: string; commission_balance_available: number; commission_balance_frozen: number; currency_code: string | null; level: number }
interface Child { ref_code: string; name: string; type: "marketer" | "cafeteria" }

function MarketerDashboard() {
  const { t } = useI18n();
  const { ready } = useRequireRole("marketer");
  const { user } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"marketer" | "cafeteria">("cafeteria");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", whatsapp: "", address: "" });

  const load = async () => {
    if (!user) return;
    const { data: m } = await supabase.from("marketers").select("*").eq("user_id", user.id).maybeSingle();
    if (m) setMe(m as Me);
    const { data: subM } = await supabase.rpc("get_my_marketer_descendants");
    const { data: subC } = await supabase.rpc("get_my_marketer_cafeterias");
    setChildren([
      ...((subM ?? []).map((x) => ({ ref_code: x.ref_code, name: x.name, type: "marketer" as const }))),
      ...((subC ?? []).map((x: { ref_code: string; name: string }) => ({ ref_code: x.ref_code, name: x.name, type: "cafeteria" as const }))),
    ]);
  };
  useEffect(() => { if (ready) load(); }, [ready, user]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.functions.invoke("create-child", { body: { entity_type: kind, ...form } });
    if (error || (data as { error?: string })?.error) {
      const msg = await extractEdgeError(error, data, t("common.error"));
      toast.error(msg);
      return;
    }
    toast.success(`${t("common.success")} — ${(data as { ref_code: string }).ref_code}`);
    setOpen(false);
    setForm({ name: "", email: "", password: "", phone: "", whatsapp: "", address: "" });
    load();
  };

  const requestWithdrawal = async () => {
    if (!me) return;
    const amt = me.commission_balance_available;
    if (amt <= 0) { toast.error("Balance is 0"); return; }
    const { error } = await supabase.from("withdrawal_requests").insert({ marketer_ref_code: me.ref_code, amount_usd: amt });
    if (error) toast.error(error.message); else toast.success(t("common.success"));
  };

  if (!ready) return <Redirecting />;
  const navItems = [
    { to: "/marketer", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/marketer/calculator", label: t("calc.nav"), icon: Calculator },
    { to: "/marketer/commissions", label: t("marketer.nav.commissions"), icon: Percent },
    { to: "/marketer/withdrawals", label: t("marketer.nav.withdrawals"), icon: Banknote },
    { to: "/marketer/reports", label: t("marketer.nav.reports") || "التقارير", icon: BarChart3 },
  ];

  return (
    <DashboardShell title={t("marketer.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-6">{t("marketer.dashboard.title")}</h1>

      <div className="grid gap-4 sm:grid-cols-2 mb-6">
        <Card className="p-6">
          <div className="text-sm text-muted-foreground">{t("marketer.balance.available")}</div>
          <div className="mt-2 text-3xl font-bold text-accent">${Number(me?.commission_balance_available ?? 0).toFixed(2)}</div>
          <Button onClick={requestWithdrawal} size="sm" className="mt-3 bg-accent text-accent-foreground hover:bg-accent/90">{t("marketer.request_withdrawal")}</Button>
        </Card>
        <Card className="p-6">
          <div className="text-sm text-muted-foreground">{t("marketer.balance.frozen")}</div>
          <div className="mt-2 text-3xl font-bold text-muted-foreground">${Number(me?.commission_balance_frozen ?? 0).toFixed(2)}</div>
        </Card>
      </div>

      {me && <div className="mb-6"><ReferralShare refCode={me.ref_code} /></div>}

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2"><Network className="h-5 w-5" /> {t("marketer.nav.network")}</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="h-4 w-4" /> {t("common.create")}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{kind === "marketer" ? t("marketer.create.marketer") : t("marketer.create.cafeteria")}</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as "marketer" | "cafeteria")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {me && me.level < 4 && <SelectItem value="marketer">Marketer</SelectItem>}
                    <SelectItem value="cafeteria">Cafeteria</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{t("common.name")} *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-2"><Label>{t("common.email")} *</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>{t("common.password")} *</Label><Input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2"><Label>{t("common.phone")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-2"><Label>{t("common.whatsapp")}</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>{t("common.address")}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">{t("common.create")}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr><th className="p-3 text-start">{t("common.ref_code")}</th><th className="p-3 text-start">{t("common.name")}</th><th className="p-3 text-start">Type</th><th className="p-3"></th></tr></thead>
          <tbody>
            {children.map((c) => (
              <tr key={c.ref_code} className="border-t border-border hover:bg-muted/30">
                <td className="p-3 font-mono">{c.ref_code}</td>
                <td className="p-3">{c.name}</td>
                <td className="p-3 capitalize">{c.type}</td>
                <td className="p-3 text-end">
                  <Link to="/marketer/children/$ref" params={{ ref: c.ref_code }}>
                    <Button variant="ghost" size="sm" className="gap-1"><ChevronLeft className="h-4 w-4 rtl:rotate-180" />{t("common.details") || "تفاصيل"}</Button>
                  </Link>
                </td>
              </tr>
            ))}
            {children.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">—</td></tr>}
          </tbody>
        </table>
      </Card>
    </DashboardShell>
  );
}
