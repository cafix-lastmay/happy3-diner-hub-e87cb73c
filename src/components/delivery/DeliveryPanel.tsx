// Waiter-side delivery panel: shown inside OrdersBoard for orders with mode='delivery'.
// Lets staff assign a driver + fee tier, view status, and cancel pre-pickup.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Bike, MapPin, Phone, Star, X, Heart } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DeliveryStatusTimeline, type DeliveryStatus } from "./DeliveryStatusTimeline";

interface DeliveryRow {
  order_id: string; cafeteria_ref_code: string;
  customer_name: string | null; customer_phone: string | null; customer_address: string;
  customer_lat: number | null; customer_lng: number | null;
  status: DeliveryStatus; fee_tier: string | null; fee_amount: number;
  driver_id: string | null; reject_reason: string | null;
}
interface CafeFees {
  delivery_fee_a_name: string | null; delivery_fee_a_amount: number;
  delivery_fee_b_name: string | null; delivery_fee_b_amount: number;
  delivery_fee_c_name: string | null; delivery_fee_c_amount: number;
  currency_code: string | null; lat: number | null; lng: number | null;
}
interface DriverOpt {
  id: string; full_name: string; phone: string | null; photo_url: string | null;
  vehicle_type: string | null; rating_avg: number; status: string;
  current_lat: number | null; current_lng: number | null;
  is_cafe_favorite: boolean; is_customer_favorite: boolean;
}
interface DriverProfile { full_name: string; phone: string | null; photo_url: string | null; vehicle_type: string | null; rating_avg: number }

function distanceKm(aLat: number | null, aLng: number | null, bLat: number | null, bLng: number | null): number | null {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function DeliveryPanel({ orderId, cafeteriaRefCode }: { orderId: string; cafeteriaRefCode: string }) {
  const { t } = useI18n();
  const [delivery, setDelivery] = useState<DeliveryRow | null>(null);
  const [fees, setFees] = useState<CafeFees | null>(null);
  const [driverProfile, setDriverProfile] = useState<DriverProfile | null>(null);
  const [drivers, setDrivers] = useState<DriverOpt[]>([]);
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<"a"|"b"|"c">("a");
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: dd }, { data: cf }] = await Promise.all([
      supabase.from("delivery_details").select("*").eq("order_id", orderId).maybeSingle(),
      supabase.from("cafeterias").select("delivery_fee_a_name,delivery_fee_a_amount,delivery_fee_b_name,delivery_fee_b_amount,delivery_fee_c_name,delivery_fee_c_amount,currency_code,lat,lng").eq("ref_code", cafeteriaRefCode).maybeSingle(),
    ]);
    setDelivery((dd as DeliveryRow | null) ?? null);
    setFees((cf as CafeFees | null) ?? null);
    if (dd?.driver_id) {
      const { data: drv } = await supabase.from("drivers").select("full_name,phone,photo_url,vehicle_type,rating_avg").eq("id", dd.driver_id).maybeSingle();
      setDriverProfile((drv as DriverProfile | null) ?? null);
    } else { setDriverProfile(null); }
  };

  useEffect(() => {
    load();
    const ch = supabase.channel(`delivery-${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_details", filter: `order_id=eq.${orderId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const openAssign = async () => {
    setOpen(true);
    await refreshDrivers();
  };

  const refreshDrivers = async () => {
    const { data } = await supabase.rpc("list_available_drivers_for_cafeteria", {
      _customer_phone: delivery?.customer_phone ?? undefined,
    });
    const list = (data ?? []) as DriverOpt[];
    // Server orders by favorites first; then we tie-break by distance from customer or cafe.
    const refLat = delivery?.customer_lat ?? fees?.lat ?? null;
    const refLng = delivery?.customer_lng ?? fees?.lng ?? null;
    list.sort((a, b) => {
      const av = a.status === "available" ? 0 : 1, bv = b.status === "available" ? 0 : 1;
      if (av !== bv) return av - bv;
      const fa = (a.is_customer_favorite ? 0 : 1) + (a.is_cafe_favorite ? 0 : 1);
      const fb = (b.is_customer_favorite ? 0 : 1) + (b.is_cafe_favorite ? 0 : 1);
      if (fa !== fb) return fa - fb;
      const da = distanceKm(refLat, refLng, a.current_lat, a.current_lng) ?? 9999;
      const db = distanceKm(refLat, refLng, b.current_lat, b.current_lng) ?? 9999;
      if (da !== db) return da - db;
      return (b.rating_avg ?? 0) - (a.rating_avg ?? 0);
    });
    setDrivers(list);
    setSelectedDriver((prev) => prev ?? list.find((d) => d.status === "available")?.id ?? null);
  };

  const toggleCafeFavorite = async (driverId: string, currently: boolean) => {
    const { error } = await supabase.rpc("toggle_cafe_favorite_driver", { _driver_id: driverId, _favorite: !currently });
    if (error) { toast.error(error.message); return; }
    toast.success(t("favorites.toggle_success"));
    refreshDrivers();
  };

  const assign = async () => {
    if (!selectedDriver) return;
    setBusy(true);
    const { error } = await supabase.rpc("assign_delivery_driver", { _order_id: orderId, _driver_id: selectedDriver, _fee_tier: tier });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delivery.panel.assigned"));
    setOpen(false);
    load();
  };

  const cancel = async () => {
    const reason = window.prompt(t("delivery.panel.cancel_reason")) ?? "";
    if (reason === null) return;
    setBusy(true);
    const { error } = await supabase.rpc("cancel_delivery", { _order_id: orderId, _reason: reason });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("delivery.panel.cancelled"));
    load();
  };

  if (!delivery || !fees) return null;
  const canCancel = !["picked_up", "on_the_way", "delivered", "cancelled"].includes(delivery.status);
  const canAssign = ["pending_assignment", "rejected"].includes(delivery.status);
  const cur = fees.currency_code ?? "";

  return (
    <Card className="mt-3 p-3 border-accent/40 bg-accent/5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Bike className="h-4 w-4 text-accent" /> {t("delivery.panel.title")}
        <Badge variant="outline" className="text-[10px]">{t(`delivery.status.${delivery.status}`)}</Badge>
      </div>

      <div className="text-xs space-y-1">
        <div><span className="text-muted-foreground">{t("delivery.address")}:</span> {delivery.customer_address}</div>
        {delivery.customer_phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {delivery.customer_phone}</div>}
        {delivery.customer_lat != null && delivery.customer_lng != null && (
          <a className="text-accent underline inline-flex items-center gap-1" target="_blank" rel="noreferrer"
             href={`https://www.google.com/maps?q=${delivery.customer_lat},${delivery.customer_lng}`}>
            <MapPin className="h-3 w-3" /> {t("delivery.driver.map_link")}
          </a>
        )}
      </div>

      {driverProfile && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
          {driverProfile.photo_url
            ? <img src={driverProfile.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
            : <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center"><Bike className="h-4 w-4" /></div>}
          <div className="flex-1 min-w-0 text-xs">
            <div className="font-semibold truncate">{driverProfile.full_name}</div>
            <div className="text-muted-foreground flex items-center gap-2">
              {driverProfile.vehicle_type && <span>{t(`driver.vehicle.${driverProfile.vehicle_type}`)}</span>}
              <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3" /> {Number(driverProfile.rating_avg ?? 0).toFixed(1)}</span>
              {driverProfile.phone && <span dir="ltr">{driverProfile.phone}</span>}
            </div>
          </div>
          <div className="text-sm font-bold text-accent">{Number(delivery.fee_amount).toFixed(2)} <span className="text-[10px] text-muted-foreground">{cur}</span></div>
        </div>
      )}

      <DeliveryStatusTimeline status={delivery.status} />
      {delivery.reject_reason && <p className="text-xs text-destructive">{delivery.reject_reason}</p>}

      <div className="flex flex-wrap gap-2">
        {canAssign && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openAssign} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {delivery.driver_id ? t("delivery.panel.reassign") : t("delivery.panel.assign")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{t("delivery.panel.assign")}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs font-semibold uppercase">{t("delivery.tier.title")}</Label>
                  <RadioGroup value={tier} onValueChange={(v) => setTier(v as "a"|"b"|"c")} className="mt-2 space-y-2">
                    {(["a","b","c"] as const).map((tk) => {
                      const name = fees[`delivery_fee_${tk}_name` as keyof CafeFees] as string | null;
                      const amt = fees[`delivery_fee_${tk}_amount` as keyof CafeFees] as number;
                      return (
                        <Label key={tk} className="flex items-center gap-3 border rounded-md p-2 cursor-pointer hover:bg-muted/50">
                          <RadioGroupItem value={tk} />
                          <span className="flex-1 text-sm">{name || t(`delivery.tier.${tk}`)}</span>
                          <span className="font-bold text-accent text-sm">{Number(amt).toFixed(2)} {cur}</span>
                        </Label>
                      );
                    })}
                  </RadioGroup>
                </div>

                <div>
                  <Label className="text-xs font-semibold uppercase">{t("delivery.panel.choose_driver")}</Label>
                  {drivers.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">{t("delivery.panel.no_drivers")}</p>
                  ) : (
                    <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                      {drivers.map((d) => {
                        const refLat = delivery?.customer_lat ?? fees.lat;
                        const refLng = delivery?.customer_lng ?? fees.lng;
                        const dist = distanceKm(refLat, refLng, d.current_lat, d.current_lng);
                        const sel = selectedDriver === d.id;
                        const dis = d.status !== "available";
                        return (
                          <div key={d.id}
                            className={`w-full flex items-center gap-2 border rounded-md p-2 ${sel ? "border-accent bg-accent/10" : ""} ${dis ? "opacity-50" : "hover:bg-muted/50"}`}>
                            <button type="button" disabled={dis}
                              onClick={() => setSelectedDriver(d.id)}
                              className="flex-1 flex items-center gap-2 text-start min-w-0">
                              {d.photo_url
                                ? <img src={d.photo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                                : <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center"><Bike className="h-4 w-4" /></div>}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate flex items-center gap-1">
                                  {d.full_name}
                                  {d.is_customer_favorite && <Heart aria-label={t("favorites.customer_favorite")} className="h-3 w-3 fill-pink-500 text-pink-500" />}
                                  {d.is_cafe_favorite && <Heart aria-label={t("favorites.cafe_favorite")} className="h-3 w-3 fill-accent text-accent" />}
                                </div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                                  {d.vehicle_type && <span>{t(`driver.vehicle.${d.vehicle_type}`)}</span>}
                                  <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3" /> {Number(d.rating_avg ?? 0).toFixed(1)}</span>
                                  {dist != null && <span>{dist.toFixed(1)} km</span>}
                                  <span>{t(`driver.status.${d.status}`)}</span>
                                </div>
                              </div>
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleCafeFavorite(d.id, d.is_cafe_favorite); }}
                              className="p-1.5 rounded-md hover:bg-background"
                              aria-label={d.is_cafe_favorite ? t("favorites.remove_from_cafe") : t("favorites.add_to_cafe")}>
                              <Heart className={`h-4 w-4 ${d.is_cafe_favorite ? "fill-accent text-accent" : "text-muted-foreground"}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={assign} disabled={busy || !selectedDriver} className="bg-accent text-accent-foreground hover:bg-accent/90">
                  {busy ? t("common.loading") : t("delivery.panel.assign")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        {canCancel && (
          <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>
            <X className="h-3 w-3 me-1" /> {t("delivery.panel.cancel")}
          </Button>
        )}
      </div>
    </Card>
  );
}
