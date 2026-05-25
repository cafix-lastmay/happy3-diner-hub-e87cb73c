// Driver dashboard: profile, status, GPS tracking, nearby cafeterias on a Leaflet map, join requests.
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Bike, MapPin, LayoutDashboard, Bell, User, Upload } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { DriverDeliveries } from "@/components/delivery/DriverDeliveries";
import { DriverWallet } from "@/components/delivery/DriverWallet";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/driver/")({ component: DriverHome });

const NearbyMap = lazy(() => import("@/components/NearbyMap"));

interface DriverRow {
  id: string;
  full_name: string;
  phone: string | null;
  vehicle_type: string | null;
  photo_url: string | null;
  service_radius_km: number;
  home_lat: number | null;
  home_lng: number | null;
  current_lat: number | null;
  current_lng: number | null;
  status: "available" | "busy" | "unavailable";
  rating_avg: number;
  rating_count: number;
}

interface NearbyCafe {
  cafeteria_id: string;
  ref_code: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distance_km: number;
  link_status: "none" | "pending" | "approved" | "rejected";
  link_id: string | null;
}

function DriverHome() {
  const { t } = useI18n();
  const { ready } = useRequireRole("driver");
  const { user } = useAuth();
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [maxRadius, setMaxRadius] = useState(15);
  const [nearby, setNearby] = useState<NearbyCafe[]>([]);
  const [uploading, setUploading] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const lastWriteRef = useRef<number>(0);

  const load = async () => {
    if (!user) return;
    const { data: d } = await supabase.from("drivers").select("*").eq("user_id", user.id).maybeSingle();
    if (d) setDriver(d as unknown as DriverRow);
    const { data: nb } = await supabase.rpc("get_nearby_cafeterias_for_driver");
    setNearby((nb ?? []) as NearbyCafe[]);
  };

  useEffect(() => {
    if (!ready) return;
    supabase.from("app_settings").select("max_driver_radius_km").maybeSingle().then(({ data }) => {
      if (data?.max_driver_radius_km) setMaxRadius(data.max_driver_radius_km);
    });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  useEffect(() => {
    if (!driver) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    if (driver.status !== "available") {
      if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
      return;
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (p) => {
        const now = Date.now();
        if (now - lastWriteRef.current < 30_000) return;
        lastWriteRef.current = now;
        await supabase.rpc("update_driver_location", { _lat: p.coords.latitude, _lng: p.coords.longitude });
        setDriver((d) => d ? { ...d, current_lat: p.coords.latitude, current_lng: p.coords.longitude } : d);
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15000 }
    );
    return () => {
      if (watchIdRef.current !== null) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    };
  }, [driver?.status]);

  const setStatus = async (s: "available" | "busy" | "unavailable") => {
    if (!driver) return;
    const { error } = await supabase.from("drivers").update({ status: s }).eq("id", driver.id);
    if (error) { toast.error(error.message); return; }
    setDriver({ ...driver, status: s });
  };

  const saveProfile = async () => {
    if (!driver) return;
    const { error } = await supabase.from("drivers").update({
      full_name: driver.full_name,
      phone: driver.phone,
      vehicle_type: driver.vehicle_type,
      service_radius_km: driver.service_radius_km,
      photo_url: driver.photo_url,
    }).eq("id", driver.id);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
    load();
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !driver) return;
    setUploading(true);
    const path = `drivers/${driver.id}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("cafeteria-logos").upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    const { data: pub } = supabase.storage.from("cafeteria-logos").getPublicUrl(path);
    setDriver({ ...driver, photo_url: pub.publicUrl });
  };

  const requestJoin = async (ref_code: string) => {
    const { error } = await supabase.rpc("driver_request_join", { _cafeteria_ref_code: ref_code });
    if (error) { toast.error(error.message); return; }
    toast.success(t("driver.join_requested"));
    load();
  };
  const cancelJoin = async (link_id: string) => {
    const { error } = await supabase.rpc("driver_cancel_join_request", { _link_id: link_id });
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (!ready || !driver) return null;

  const center: [number, number] = [
    driver.current_lat ?? driver.home_lat ?? 24.7136,
    driver.current_lng ?? driver.home_lng ?? 46.6753,
  ];
  const hasLocation = (driver.current_lat ?? driver.home_lat) !== null;

  const navItems = [
    { to: "/driver", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/notifications", label: t("notifications.title"), icon: Bell },
    { to: "/settings/account", label: t("common.account"), icon: User },
  ];

  return (
    <DashboardShell title={t("driver.dashboard.title")} navItems={navItems.filter(n => n.to !== "/driver")}>
      <Card className="p-4 mb-4 border-2 border-accent/40">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Bike className="h-5 w-5 text-accent" />
            <div>
              <div className="text-sm font-semibold">{t("driver.status_label")}</div>
              <Badge variant={driver.status === "available" ? "default" : "secondary"} className="mt-1">
                {t(`driver.status.${driver.status}`)}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["available","busy","unavailable"] as const).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={driver.status === s ? "default" : "outline"}
                onClick={() => setStatus(s)}
                className={driver.status === s && s === "available" ? "bg-accent text-accent-foreground hover:bg-accent/90" : ""}
              >
                {t(`driver.status.${s}`)}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <Tabs defaultValue="deliveries" className="w-full">
        <TabsList className="mb-4 w-full overflow-x-auto justify-start">
          <TabsTrigger value="deliveries">{t("driver.tabs.deliveries") || "التوصيلات والمحفظة"}</TabsTrigger>
          <TabsTrigger value="map">{t("driver.tabs.map") || "الخريطة والكافيتريات"}</TabsTrigger>
          <TabsTrigger value="profile">{t("driver.tabs.profile") || "ملفي الشخصي"}</TabsTrigger>
        </TabsList>

        <TabsContent value="deliveries" className="space-y-4">
          <DriverDeliveries />
          <DriverWallet />
        </TabsContent>

        <TabsContent value="profile">
          <Card className="p-4 max-w-xl space-y-4">
            <div className="flex items-center gap-3">
              {driver.photo_url ? (
                <img src={driver.photo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center"><Bike className="h-6 w-6" /></div>
              )}
              <div>
                <div className="font-semibold">{driver.full_name}</div>
                <Badge variant={driver.status === "available" ? "default" : "secondary"}>{t(`driver.status.${driver.status}`)}</Badge>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <span className="text-yellow-500">⭐</span>
                  <span className="font-semibold text-foreground">{Number(driver.rating_avg ?? 0).toFixed(2)}</span>
                  <span>({driver.rating_count ?? 0} تقييم)</span>
                </div>
              </div>
            </div>

            <div>
              <Label>{t("driver.status_label")}</Label>
              <div className="flex gap-2 mt-1">
                {(["available","busy","unavailable"] as const).map((s) => (
                  <Button key={s} size="sm" variant={driver.status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
                    {t(`driver.status.${s}`)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <Label>{t("driver.full_name")}</Label>
                <Input value={driver.full_name} onChange={(e) => setDriver({ ...driver, full_name: e.target.value })} />
              </div>
              <div>
                <Label>{t("driver.phone")}</Label>
                <Input value={driver.phone ?? ""} onChange={(e) => setDriver({ ...driver, phone: e.target.value })} />
              </div>
              <div>
                <Label>{t("driver.vehicle_type")}</Label>
                <Select value={driver.vehicle_type ?? "motorcycle"} onValueChange={(v) => setDriver({ ...driver, vehicle_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bicycle">{t("driver.vehicle.bicycle")}</SelectItem>
                    <SelectItem value="motorcycle">{t("driver.vehicle.motorcycle")}</SelectItem>
                    <SelectItem value="car">{t("driver.vehicle.car")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("driver.service_radius")}: {driver.service_radius_km} km <span className="text-muted-foreground text-xs">/ {maxRadius} km</span></Label>
                <Slider min={1} max={maxRadius} step={1} value={[driver.service_radius_km]} onValueChange={(v) => setDriver({ ...driver, service_radius_km: v[0] })} />
              </div>
              <div>
                <input id="dphoto2" type="file" accept="image/*" className="hidden" onChange={onPhoto} />
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => document.getElementById("dphoto2")?.click()}>
                  <Upload className="h-4 w-4" /> {uploading ? t("common.loading") : t("driver.upload_photo")}
                </Button>
              </div>
              <Button onClick={saveProfile} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                {t("common.save")}
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="map" className="space-y-4">
          <Card className="p-2 overflow-hidden">
            <div className="h-[360px] w-full rounded-md overflow-hidden">
              {hasLocation ? (
                <Suspense fallback={<div className="h-full w-full bg-muted" />}>
                  <NearbyMap
                    center={center}
                    radiusKm={driver.service_radius_km}
                    cafes={nearby.map((c) => ({ cafeteria_id: c.cafeteria_id, name: c.name, lat: c.lat, lng: c.lng, distance_km: c.distance_km }))}
                    youAreHereLabel={t("driver.you_are_here")}
                  />
                </Suspense>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm p-4 text-center">
                  <div className="space-y-3">
                    <MapPin className="mx-auto h-8 w-8" />
                    <p>{t("driver.enable_location")}</p>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (typeof navigator === "undefined" || !navigator.geolocation) {
                          toast.error(t("driver.location_denied"));
                          return;
                        }
                        navigator.geolocation.getCurrentPosition(
                          async (p) => {
                            const lat = p.coords.latitude;
                            const lng = p.coords.longitude;
                            const { error } = await supabase
                              .from("drivers")
                              .update({ home_lat: lat, home_lng: lng, current_lat: lat, current_lng: lng })
                              .eq("id", driver.id);
                            if (error) { toast.error(error.message); return; }
                            toast.success(t("driver.location_enabled"));
                            load();
                          },
                          () => toast.error(t("driver.location_denied")),
                          { enableHighAccuracy: true, timeout: 10000 }
                        );
                      }}
                    >
                      <MapPin className="h-4 w-4" /> {t("driver.enable_location_btn")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">{t("driver.join_by_code")}</h2>
            <JoinByCode onJoin={requestJoin} />
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">{t("driver.nearby_cafes")}</h2>
            {nearby.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("driver.no_nearby")}</p>
            ) : (
              <div className="space-y-2">
                {nearby.map((c) => (
                  <div key={c.cafeteria_id} className="flex items-center justify-between border-b border-border py-2 gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.distance_km.toFixed(1)} km · {c.address ?? ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {c.link_status === "approved" && <Badge>{t("driver.link.approved")}</Badge>}
                      {c.link_status === "rejected" && <Badge variant="secondary">{t("driver.link.rejected")}</Badge>}
                      {c.link_status === "pending" && (
                        <>
                          <Badge variant="secondary">{t("driver.link.pending")}</Badge>
                          <Button size="sm" variant="outline" onClick={() => c.link_id && cancelJoin(c.link_id)}>{t("common.cancel")}</Button>
                        </>
                      )}
                      {(c.link_status === "none" || c.link_status === "rejected") && (
                        <Button size="sm" onClick={() => requestJoin(c.ref_code)} className="bg-accent text-accent-foreground hover:bg-accent/90">
                          {t("driver.request_join")}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}

function JoinByCode({ onJoin }: { onJoin: (refCode: string) => void | Promise<void> }) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const submit = async () => {
    const v = code.trim();
    if (!v) return;
    await onJoin(v);
    setCode("");
  };
  return (
    <div className="flex gap-2">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t("driver.cafe_code_placeholder")}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
      />
      <Button onClick={submit} className="bg-accent text-accent-foreground hover:bg-accent/90">
        {t("driver.join")}
      </Button>
    </div>
  );
}
