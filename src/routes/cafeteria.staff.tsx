import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Wallet, History, BookOpen, QrCode, Users, ClipboardList, Plus, KeyRound, BarChart3 } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";
import { StaffActivePanel } from "@/components/StaffActivePanel";
import { DriversPanel } from "@/components/DriversPanel";
import { SettlementsPanel } from "@/components/delivery/SettlementsPanel";

export const Route = createFileRoute("/cafeteria/staff")({ component: CafeStaff });

type StaffRole = "waiter" | "chef" | "manager" | "driver";
interface S { id: string; user_id: string; role: StaffRole; is_active: boolean; created_at: string; email?: string; full_name?: string }

const isStaffRole = (value: unknown): value is StaffRole => ["waiter", "chef", "manager", "driver"].includes(String(value));
const safeString = (value: unknown) => typeof value === "string" ? value : "";

function CafeStaff() {
  const { t } = useI18n();
  const { ready } = useRequireRole("cafeteria_admin");
  const { user } = useAuth();
  const [refCode, setRefCode] = useState<string | null>(null);
  const [rows, setRows] = useState<S[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", full_name: "", role: "waiter" as StaffRole, phone: "", vehicle_type: "motorcycle" });
  const [busy, setBusy] = useState(false);
  const [resetTarget, setResetTarget] = useState<S | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const load = async (_rc: string) => {
    const { data, error } = await supabase.rpc("get_my_staff_with_profiles");
    if (error) { toast.error(error.message); setRows([]); return; }
    setRows((data ?? []).filter((r: any) => !!r?.staff_id && isStaffRole(r.role)).map((r: any) => ({
      id: r.staff_id,
      user_id: safeString(r.user_id),
      role: r.role,
      is_active: r.is_active !== false,
      created_at: safeString(r.created_at),
      email: safeString(r.email),
      full_name: safeString(r.full_name),
    })) as S[]);
  };
  useEffect(() => {
    if (!ready || !user) return;
    supabase.from("cafeterias").select("ref_code").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) { setRefCode(data.ref_code); load(data.ref_code); }
    });
  }, [ready, user]);

  const add = async () => {
    if (!form.email || !form.password || !form.full_name) { toast.error(t("error.required_field")); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("add-staff", { body: form });
    setBusy(false);
    if (error || (data && (data as any).error)) { toast.error((data as any)?.error ?? error?.message ?? "Error"); return; }
    toast.success(t("staff.added"));
    setOpen(false); setForm({ email: "", password: "", full_name: "", role: "waiter", phone: "", vehicle_type: "motorcycle" });
    if (refCode) load(refCode);
  };
  const toggle = async (s: S) => {
    if (!refCode) return;
    await supabase.from("staff").update({ is_active: !s.is_active }).eq("id", s.id);
    load(refCode);
  };
  const resetPassword = async () => {
    if (!resetTarget || newPassword.length < 8) { toast.error(t("staff.password_min")); return; }
    setResetBusy(true);
    const { data, error } = await supabase.functions.invoke("reset-staff-password", {
      body: { staff_user_id: resetTarget.user_id, new_password: newPassword },
    });
    setResetBusy(false);
    if (error || (data && (data as any).error)) { toast.error((data as any)?.error ?? error?.message ?? "Error"); return; }
    toast.success(t("staff.password_reset"));
    setResetTarget(null); setNewPassword("");
  };

  if (!ready) return null;
  const navItems = [
    { to: "/cafeteria", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/cafeteria/menu", label: t("cafeteria.nav.menu"), icon: BookOpen },
    { to: "/cafeteria/tables", label: t("cafeteria.nav.tables"), icon: QrCode },
    { to: "/cafeteria/staff", label: t("cafeteria.nav.staff"), icon: Users },
    { to: "/cafeteria/orders", label: t("cafeteria.nav.orders"), icon: ClipboardList },
    { to: "/cafeteria/reports", label: t("cafeteria.nav.reports"), icon: BarChart3 },
    { to: "/cafeteria/recharge", label: t("cafeteria.nav.recharge"), icon: Wallet },
    { to: "/cafeteria/history", label: t("cafeteria.nav.history"), icon: History },
  ];
  return (
    <DashboardShell title={t("cafeteria.dashboard.title")} navItems={navItems.filter((n) => n.to !== "/cafeteria")} showTrialCard>
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("staff.title")}</h1>
        <Button onClick={() => setOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="h-4 w-4" /> {t("staff.add")}</Button>
      </div>
      {refCode && (
        <div className="mb-6 space-y-6">
          <StaffActivePanel cafeteriaRefCode={refCode} />
          <DriversPanel />
          <SettlementsPanel />
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t("staff.no_staff")}</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50"><tr>
              <th className="p-3 text-start">{t("staff.full_name")}</th>
              <th className="p-3 text-start">{t("common.email")}</th>
              <th className="p-3 text-start">{t("common.role")}</th>
              <th className="p-3 text-start">{t("common.status")}</th>
              <th className="p-3 text-start">{t("common.actions")}</th>
            </tr></thead>
          <tbody>{rows.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-3">{s.full_name || "—"}</td>
                <td className="p-3">{s.email || "—"}</td>
                <td className="p-3"><Badge>{t(`staff.role.${s.role}`)}</Badge></td>
                <td className="p-3"><Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "✓" : "✗"}</Badge></td>
                <td className="p-3">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setResetTarget(s); setNewPassword(""); }}><KeyRound className="h-3 w-3" /> {t("staff.reset_password")}</Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(s)}>{s.is_active ? t("common.delete") : t("common.confirm")}</Button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("staff.add")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("staff.full_name")} *</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>{t("common.email")} *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>{t("staff.temp_password")} *</Label><Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div>
              <Label>{t("common.role")}</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as StaffRole })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="waiter">{t("staff.role.waiter")}</SelectItem>
                  <SelectItem value="chef">{t("staff.role.chef")}</SelectItem>
                  <SelectItem value="manager">{t("staff.role.manager")}</SelectItem>
                  <SelectItem value="driver">{t("staff.role.driver")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.role === "driver" && (
              <>
                <div><Label>{t("driver.phone")}</Label><Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div>
                  <Label>{t("driver.vehicle_type")}</Label>
                  <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bicycle">{t("driver.vehicle.bicycle")}</SelectItem>
                      <SelectItem value="motorcycle">{t("driver.vehicle.motorcycle")}</SelectItem>
                      <SelectItem value="car">{t("driver.vehicle.car")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={add} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">{busy ? t("common.loading") : t("common.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetTarget} onOpenChange={(o) => { if (!o) { setResetTarget(null); setNewPassword(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("staff.reset_password")} — {resetTarget?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("staff.new_password")} *</Label>
              <Input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••" />
              <p className="text-xs text-muted-foreground mt-1">{t("staff.password_min")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setResetTarget(null); setNewPassword(""); }}>{t("common.cancel")}</Button>
            <Button onClick={resetPassword} disabled={resetBusy} className="bg-accent text-accent-foreground hover:bg-accent/90">{resetBusy ? t("common.loading") : t("common.confirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
