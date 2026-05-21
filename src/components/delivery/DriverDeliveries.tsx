// Driver-side delivery panel with two tabs: incoming requests + active delivery.
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Inbox, Bike, MapPin, Phone, User, ClipboardList, Check, X, Timer } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeliveryRow {
  order_id: string; short_code: string;
  cafeteria_ref_code: string; cafeteria_name: string; cafeteria_address: string | null;
  cafeteria_lat: number | null; cafeteria_lng: number | null;
  customer_name: string | null; customer_phone: string | null; customer_address: string;
  customer_lat: number | null; customer_lng: number | null;
  fee_amount: number; fee_tier: string | null;
  order_total: number; status: string;
  requested_at: string | null;
}
interface ItemRow { id: string; order_id: string; name_snapshot: string; qty: number; price_snapshot: number }

function useCountdown(fromIso: string | null, seconds: number) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(id); }, []);
  if (!fromIso) return seconds;
  const elapsed = Math.floor((Date.now() - new Date(fromIso).getTime()) / 1000);
  return Math.max(0, seconds - elapsed);
}

export function DriverDeliveries() {
  const { t } = useI18n();
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    const { data } = await supabase.rpc("get_my_active_deliveries");
    const list = (data ?? []) as DeliveryRow[];
    setRows(list);
    if (list.length) {
      const { data: it } = await supabase.from("order_items").select("id,order_id,name_snapshot,qty,price_snapshot").in("order_id", list.map((r) => r.order_id));
      setItems((it ?? []) as ItemRow[]);
    } else { setItems([]); }
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("driver-deliveries")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_details" }, () => load())
      .subscribe();
    const id = setInterval(load, 15000);
    return () => { supabase.removeChannel(ch); clearInterval(id); };
  }, []);

  const incoming = useMemo(() => rows.filter((r) => r.status === "requested"), [rows]);
  const active = useMemo(() => rows.filter((r) => ["accepted","picked_up","on_the_way"].includes(r.status)), [rows]);

  const respond = async (orderId: string, accept: boolean, reason?: string) => {
    setBusy(orderId);
    const { error } = await supabase.rpc("respond_to_delivery", { _order_id: orderId, _accept: accept, _reason: reason });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(accept ? t("delivery.driver.accepted") : t("delivery.driver.rejected"));
    setRejectFor(null); setRejectReason("");
    load();
  };

  const advance = async (orderId: string, status: "picked_up" | "on_the_way" | "delivered") => {
    setBusy(orderId);
    const { error } = await supabase.rpc("update_delivery_status", { _order_id: orderId, _new_status: status });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(t(`delivery.status.${status}`));
    load();
  };

  return (
    <Card className="p-4">
      <Tabs defaultValue="incoming">
        <TabsList>
          <TabsTrigger value="incoming" data-incoming-count={incoming.length}>
            <Inbox className="h-4 w-4 me-1" />
            {t("delivery.driver.incoming")}
            {incoming.length > 0 && (
              <Badge key={`in-${incoming.length}`} className="ms-2 bg-accent text-accent-foreground">{incoming.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" data-active-count={active.length}>
            <Bike className="h-4 w-4 me-1" />
            {t("delivery.driver.active_tab")}
            {active.length > 0 && (
              <Badge key={`ac-${active.length}`} className="ms-2">{active.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="incoming" className="mt-3 space-y-3">
          {incoming.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">{t("delivery.driver.no_incoming")}</p>}
          {incoming.map((r) => (
            <IncomingCard key={r.order_id} r={r} items={items.filter((i) => i.order_id === r.order_id)}
              busy={busy === r.order_id}
              onAccept={() => respond(r.order_id, true)}
              onRejectOpen={() => setRejectFor(r.order_id)} />
          ))}
        </TabsContent>

        <TabsContent value="active" className="mt-3 space-y-3">
          {active.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">{t("delivery.driver.no_active")}</p>}
          {active.map((r) => (
            <ActiveCard key={r.order_id} r={r} items={items.filter((i) => i.order_id === r.order_id)}
              busy={busy === r.order_id} onAdvance={advance} />
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!rejectFor} onOpenChange={(o) => { if (!o) { setRejectFor(null); setRejectReason(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("delivery.driver.reject_reason")}</DialogTitle></DialogHeader>
          <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} placeholder={t("delivery.driver.reject_placeholder")} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectFor(null); setRejectReason(""); }}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => rejectFor && respond(rejectFor, false, rejectReason)}>{t("delivery.driver.reject")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function IncomingCard({ r, items, busy, onAccept, onRejectOpen }:
  { r: DeliveryRow; items: ItemRow[]; busy: boolean; onAccept: () => void; onRejectOpen: () => void }) {
  const { t } = useI18n();
  const remaining = useCountdown(r.requested_at, 120);
  const mm = Math.floor(remaining / 60), ss = remaining % 60;
  return (
    <Card className="p-3 border-accent/40">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm flex items-center gap-1"><ClipboardList className="h-3 w-3" /> {r.cafeteria_name}</div>
          {r.cafeteria_address && <div className="text-[11px] text-muted-foreground truncate">{r.cafeteria_address}</div>}
        </div>
        <div className={`text-xs font-mono inline-flex items-center gap-1 ${remaining < 30 ? "text-destructive" : "text-muted-foreground"}`}>
          <Timer className="h-3 w-3" />{String(mm).padStart(2,"0")}:{String(ss).padStart(2,"0")}
        </div>
      </div>
      <div className="text-xs space-y-0.5">
        <div className="flex items-start gap-1"><MapPin className="h-3 w-3 mt-0.5" /><span className="text-muted-foreground">{r.customer_address}</span></div>
        <div className="text-muted-foreground">{items.length} {t("delivery.driver.items")} · {Number(r.order_total).toFixed(2)}</div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-sm">
          <span className="text-muted-foreground text-xs">{t("delivery.fee")}:</span>{" "}
          <span className="font-bold text-accent">{Number(r.fee_amount).toFixed(2)}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onRejectOpen} disabled={busy}><X className="h-3 w-3 me-1" />{t("delivery.driver.reject")}</Button>
          <Button size="sm" onClick={onAccept} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Check className="h-3 w-3 me-1" />{t("delivery.driver.accept")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ActiveCard({ r, items, busy, onAdvance }:
  { r: DeliveryRow; items: ItemRow[]; busy: boolean; onAdvance: (id: string, s: "picked_up"|"on_the_way"|"delivered") => void }) {
  const { t } = useI18n();
  const mapsHref = r.customer_lat != null && r.customer_lng != null
    ? `https://www.google.com/maps?q=${r.customer_lat},${r.customer_lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.customer_address)}`;
  return (
    <Card className="p-3 border-accent/40">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{r.cafeteria_name} · #{r.short_code}</div>
          <div className="font-semibold text-sm flex items-center gap-1"><User className="h-3 w-3" /> {r.customer_name || t("delivery.driver.customer")}</div>
        </div>
        <Badge variant="outline">{t(`delivery.status.${r.status}`)}</Badge>
      </div>
      <div className="text-xs space-y-1 mb-2">
        {r.customer_phone && (
          <a href={`tel:${r.customer_phone}`} className="text-accent inline-flex items-center gap-1" dir="ltr">
            <Phone className="h-3 w-3" /> {r.customer_phone}
          </a>
        )}
        <a href={mapsHref} target="_blank" rel="noreferrer" className="block text-accent inline-flex items-center gap-1">
          <MapPin className="h-3 w-3" /> {r.customer_address}
        </a>
      </div>
      <ul className="text-xs border-t border-border pt-2 mb-2 space-y-0.5">
        {items.map((it) => (
          <li key={it.id} className="flex justify-between"><span>{it.qty}× {it.name_snapshot}</span><span className="text-muted-foreground">{(it.price_snapshot * it.qty).toFixed(2)}</span></li>
        ))}
      </ul>
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-muted-foreground text-xs">{t("delivery.fee")}: <span className="font-bold text-accent">{Number(r.fee_amount).toFixed(2)}</span></span>
        <span className="font-semibold">{t("delivery.invoice.total")}: {Number(r.order_total).toFixed(2)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {r.status === "accepted" && (
          <Button size="sm" onClick={() => onAdvance(r.order_id, "picked_up")} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {t("delivery.driver.btn_picked_up")}
          </Button>
        )}
        {r.status === "picked_up" && (
          <Button size="sm" onClick={() => onAdvance(r.order_id, "on_the_way")} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {t("delivery.driver.btn_on_the_way")}
          </Button>
        )}
        {r.status === "on_the_way" && (
          <Button size="sm" onClick={() => onAdvance(r.order_id, "delivered")} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {t("delivery.driver.btn_delivered")}
          </Button>
        )}
      </div>
    </Card>
  );
}
