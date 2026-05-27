// Independent driver self-signup page.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bike, Coffee, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { extractEdgeError } from "@/lib/edge-error";
import { toast } from "sonner";

export const Route = createFileRoute("/signup/driver")({ component: SignupDriverPage });

function SignupDriverPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [maxRadius, setMaxRadius] = useState(15);
  const [photo, setPhoto] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    phone: "",
    vehicle_type: "motorcycle" as "bicycle" | "motorcycle" | "car",
    service_radius_km: 5,
    home_lat: null as number | null,
    home_lng: null as number | null,
  });

  useEffect(() => {
    supabase.from("app_settings").select("max_driver_radius_km").maybeSingle().then(({ data }) => {
      if (data?.max_driver_radius_km) setMaxRadius(data.max_driver_radius_km);
    });
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setForm((f) => ({ ...f, home_lat: p.coords.latitude, home_lng: p.coords.longitude })),
        () => undefined,
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = `drivers/anon-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("cafeteria-logos").upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) { toast.error(error.message); return; }
    const { data: pub } = supabase.storage.from("cafeteria-logos").getPublicUrl(path);
    setPhoto(pub.publicUrl);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.email || !form.password || !form.phone) {
      toast.error(t("error.required_field")); return;
    }
    if (form.password.length < 8) { toast.error(t("staff.password_min")); return; }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("signup-driver", {
      body: { ...form, photo_url: photo || undefined },
    });
    if (error || (data as { error?: string })?.error) {
      const msg = await extractEdgeError(error, data, t("common.error"));
      setLoading(false);
      toast.error(msg);
      return;
    }
    const { error: signErr } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    setLoading(false);
    if (signErr) { toast.error(signErr.message); return; }
    toast.success(t("common.success"));
    navigate({ to: "/driver" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/30 to-background flex flex-col">
      <header className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Coffee className="h-4 w-4" />
          </div>
          <span className="font-bold">{t("app.name")}</span>
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md p-6">
          <div className="mb-4 flex items-center gap-2">
            <Bike className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">{t("driver.signup.title")}</h1>
          </div>
          <form className="space-y-3" onSubmit={submit}>
            <div>
              <Label>{t("driver.full_name")} *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
            </div>
            <div>
              <Label>{t("common.email")} *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <Label>{t("common.password")} *</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            </div>
            <div>
              <Label>{t("driver.phone")} *</Label>
              <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </div>
            <div>
              <Label>{t("driver.vehicle_type")}</Label>
              <Select value={form.vehicle_type} onValueChange={(v) => setForm({ ...form, vehicle_type: v as "bicycle" | "motorcycle" | "car" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bicycle">{t("driver.vehicle.bicycle")}</SelectItem>
                  <SelectItem value="motorcycle">{t("driver.vehicle.motorcycle")}</SelectItem>
                  <SelectItem value="car">{t("driver.vehicle.car")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("driver.photo")}</Label>
              <div className="flex items-center gap-3">
                {photo && <img src={photo} alt="" className="h-14 w-14 rounded-full object-cover" />}
                <input id="dphoto" type="file" accept="image/*" className="hidden" onChange={onPhoto} />
                <Button type="button" variant="outline" disabled={uploading} onClick={() => document.getElementById("dphoto")?.click()}>
                  <Upload className="h-4 w-4" /> {uploading ? t("common.loading") : t("driver.upload_photo")}
                </Button>
              </div>
            </div>
            <div>
              <Label>{t("driver.service_radius")}: {form.service_radius_km} km <span className="text-muted-foreground text-xs">/ {maxRadius} km</span></Label>
              <Slider min={1} max={maxRadius} step={1} value={[form.service_radius_km]} onValueChange={(v) => setForm({ ...form, service_radius_km: v[0] })} />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {loading ? t("common.loading") : t("common.submit")}
            </Button>
          </form>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
