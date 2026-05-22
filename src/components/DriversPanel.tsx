// Drivers panel for cafe admin/manager: staff drivers, pending requests, approved independent drivers.
import { useEffect, useState } from "react";
import { Bike, Check, X, UserPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Row {
  scope: "staff" | "independent";
  link_id: string | null;
  driver_id: string;
  full_name: string;
  phone: string | null;
  vehicle_type: string | null;
  photo_url: string | null;
  status: string;
  rating_avg: number;
  kind: "staff" | "independent";
  link_status: "pending" | "approved" | "rejected" | null;
  requested_at: string | null;
}

const allowedDriverStatuses = new Set(["available", "busy", "unavailable"]);
const allowedVehicleTypes = new Set(["bicycle", "motorcycle", "car"]);
const safeString = (value: unknown) => typeof value === "string" ? value : "";
const safeNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function DriversPanel() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);

  const load = async () => {
    const { data, error } = await supabase.rpc("get_cafe_drivers_panel");
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []).filter((r: any) => !!r?.driver_id).map((r: any) => ({
      ...r,
      scope: r.scope === "independent" ? "independent" : "staff",
      full_name: typeof r.full_name === "string" && r.full_name.trim() ? r.full_name : "—",
      phone: safeString(r.phone),
      vehicle_type: allowedVehicleTypes.has(r.vehicle_type) ? r.vehicle_type : null,
      photo_url: safeString(r.photo_url),
      status: allowedDriverStatuses.has(r.status) ? r.status : "unavailable",
      rating_avg: safeNumber(r.rating_avg),
      kind: r.kind === "independent" ? "independent" : "staff",
      link_status: r.link_status === "pending" || r.link_status === "approved" || r.link_status === "rejected" ? r.link_status : null,
      requested_at: r.requested_at ?? null,
    })) as Row[]);
  };
  useEffect(() => { load(); }, []);

  const decide = async (link_id: string, approve: boolean) => {
    const { error } = await supabase.rpc("decide_driver_join_request", { _link_id: link_id, _approve: approve });
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
    load();
  };

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const invite = async () => {
    const q = inviteQuery.trim();
    if (!q) return;
    setInviting(true);
    const { error } = await supabase.rpc("cafe_invite_driver", { _query: q });
    setInviting(false);
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("DRIVER_NOT_FOUND")) toast.error(t("drivers.driver_not_found"));
      else toast.error(msg);
      return;
    }
    toast.success(t("drivers.invited"));
    setInviteOpen(false);
    setInviteQuery("");
    load();
  };

  const staffDrivers = rows.filter((r) => r.scope === "staff");
  const pending = rows.filter((r) => r.scope === "independent" && r.link_status === "pending");
  const approved = rows.filter((r) => r.scope === "independent" && r.link_status === "approved");

  const renderRow = (r: Row, actions?: React.ReactNode) => (
    <div key={r.link_id ?? r.driver_id} className="flex items-center justify-between border-b border-border py-2 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {r.photo_url ? (
          <img src={r.photo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center"><Bike className="h-4 w-4" /></div>
        )}
        <div className="min-w-0">
          <div className="font-medium truncate">{r.full_name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {(r.phone || "—")} · {r.vehicle_type ? t(`driver.vehicle.${r.vehicle_type}`) : "—"} · <Badge variant="secondary">{t(`driver.status.${r.status}`)}</Badge>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    </div>
  );

  return (
    <Card className="p-4 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bike className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">{t("drivers.panel.title")}</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
          <UserPlus className="h-3 w-3" /> {t("drivers.invite")}
        </Button>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("drivers.invite_title")}</DialogTitle>
            <DialogDescription>{t("drivers.invite_help")}</DialogDescription>
          </DialogHeader>
          <Input
            value={inviteQuery}
            onChange={(e) => setInviteQuery(e.target.value)}
            placeholder={t("drivers.invite_placeholder")}
            onKeyDown={(e) => { if (e.key === "Enter") invite(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={invite} disabled={inviting} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {inviting ? t("common.loading") : t("drivers.invite")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section>
        <h3 className="text-sm font-semibold mb-2">{t("drivers.staff_drivers")}</h3>
        {staffDrivers.length === 0 ? <p className="text-xs text-muted-foreground">{t("drivers.none")}</p> :
          <div>{staffDrivers.map((r) => renderRow(r))}</div>}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">{t("drivers.pending_requests")}</h3>
        {pending.length === 0 ? <p className="text-xs text-muted-foreground">{t("drivers.no_pending")}</p> :
          <div>{pending.map((r) => renderRow(r, (
            <>
              <Button size="sm" onClick={() => r.link_id && decide(r.link_id, true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Check className="h-3 w-3" /> {t("common.approve")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => r.link_id && decide(r.link_id, false)}>
                <X className="h-3 w-3" /> {t("common.reject")}
              </Button>
            </>
          )))}</div>}
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">{t("drivers.approved_independent")}</h3>
        {approved.length === 0 ? <p className="text-xs text-muted-foreground">{t("drivers.none")}</p> :
          <div>{approved.map((r) => renderRow(r, (
            <Button size="sm" variant="outline" onClick={() => r.link_id && decide(r.link_id, false)}>{t("common.reject")}</Button>
          )))}</div>}
      </section>
    </Card>
  );
}
