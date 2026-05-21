// Customer-facing delivery tracker shown after order confirmation.
// Polls get_delivery_order_status every 5s and renders status timeline + driver card after accept.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bike, Phone, Star, Clock } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { DeliveryStatusTimeline, type DeliveryStatus } from "./DeliveryStatusTimeline";
import { RatingPrompt } from "./RatingPrompt";

interface Status {
  order_id: string; short_code: string; order_status: string;
  delivery_status: DeliveryStatus; fee_amount: number; total: number; eta_minutes: number | null;
  responded_at: string | null; on_the_way_at: string | null;
  driver: { name: string; phone: string | null; photo_url: string | null; vehicle_type: string | null; rating_avg: number } | null;
}

export function CustomerDeliveryTracker({ orderId, shortCode, currency, onNewOrder }:
  { orderId: string; shortCode: string | null; currency?: string | null; onNewOrder: () => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const { data: row } = await supabase.rpc("get_delivery_order_status", { _order_id: orderId });
      if (cancelled || !row) return;
      setData(row as unknown as Status);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [orderId]);

  const etaText = (() => {
    if (!data?.eta_minutes || !data.responded_at) return null;
    const start = new Date(data.on_the_way_at ?? data.responded_at).getTime();
    const eta = new Date(start + data.eta_minutes * 60 * 1000);
    return eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  })();

  const done = data?.delivery_status === "delivered";
  const cancelled = data?.delivery_status === "cancelled" || data?.delivery_status === "rejected";

  return (
    <Card className="p-6 mb-4 border-accent border-2 bg-accent/5">
      <div className="flex flex-col items-center text-center space-y-3 pb-4 border-b border-accent/30">
        <div className="text-5xl">{done ? "🎉" : cancelled ? "⛔" : "🛵"}</div>
        <h2 className="text-xl font-bold">{t("delivery.tracker.title")}</h2>
        <div className="bg-muted rounded-2xl p-4 w-full max-w-xs">
          <p className="text-xs text-muted-foreground mb-1">{t("delivery.tracker.code")}</p>
          <p className="text-3xl font-mono font-bold tracking-widest text-accent" dir="ltr">{shortCode ?? "—"}</p>
        </div>
        {etaText && !done && !cancelled && (
          <div className="text-sm inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" /> {t("delivery.tracker.eta")}: <span className="font-semibold text-foreground" dir="ltr">{etaText}</span>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <Badge className="bg-accent text-accent-foreground">{t(`delivery.status.${data?.delivery_status ?? "pending_assignment"}`)}</Badge>
        <DeliveryStatusTimeline status={data?.delivery_status ?? "pending_assignment"} />

        {data?.driver && (
          <Card className="p-3 bg-background border-accent/40">
            <div className="text-xs text-muted-foreground mb-2 font-semibold uppercase">{t("delivery.tracker.your_driver")}</div>
            <div className="flex items-center gap-3">
              {data.driver.photo_url
                ? <img src={data.driver.photo_url} alt="" className="h-12 w-12 rounded-full object-cover" />
                : <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center"><Bike className="h-5 w-5" /></div>}
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{data.driver.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  {data.driver.vehicle_type && <span>{t(`driver.vehicle.${data.driver.vehicle_type}`)}</span>}
                  <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3" /> {Number(data.driver.rating_avg ?? 0).toFixed(1)}</span>
                </div>
              </div>
              {data.driver.phone && (
                <a href={`tel:${data.driver.phone}`} className="h-10 w-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>
          </Card>
        )}

        {data && (
          <div className="text-xs space-y-1 pt-2 border-t border-border">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("delivery.invoice.items_subtotal")}</span><span>{(Number(data.total) - Number(data.fee_amount)).toFixed(2)} {currency}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("delivery.fee")}</span>
              <span>{data.fee_amount > 0 ? `${Number(data.fee_amount).toFixed(2)} ${currency}` : <span className="italic">{t("delivery.invoice.tbd")}</span>}</span>
            </div>
            <div className="flex justify-between font-bold text-base pt-1"><span>{t("delivery.invoice.total")}</span><span>{Number(data.total).toFixed(2)} {currency}</span></div>
            <p className="text-[11px] text-muted-foreground italic mt-1">{t("delivery.invoice.cod_note")}</p>
          </div>
        )}

        {done && (
          <RatingPrompt orderId={orderId} hasDriver={!!data?.driver} />
        )}

        {(done || cancelled) && (
          <Button variant="outline" className="w-full" onClick={onNewOrder}>{t("customer.new_order")}</Button>
        )}
      </div>
    </Card>
  );
}
