// Takeaway + Delivery QR cards for /cafeteria/tables page.
import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, RefreshCw, Copy, Package, Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/I18nProvider";
import { toast } from "sonner";

interface Cafe {
  ref_code: string; name: string;
  mode_takeaway: boolean; mode_delivery: boolean;
  takeaway_qr_token: string | null; delivery_qr_token: string | null;
}

export function OtherServicesQr({ refCode }: { refCode: string }) {
  const { t } = useI18n();
  const [cafe, setCafe] = useState<Cafe | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("cafeterias")
      .select("ref_code,name,mode_takeaway,mode_delivery,takeaway_qr_token,delivery_qr_token")
      .eq("ref_code", refCode)
      .maybeSingle();
    if (data) setCafe(data as Cafe);
  };
  useEffect(() => { load(); }, [refCode]);

  if (!cafe) return null;
  if (!cafe.mode_takeaway && !cafe.mode_delivery) return null;

  const regenerate = async (col: "takeaway_qr_token" | "delivery_qr_token") => {
    if (!confirm(t("common.confirm"))) return;
    const newToken = crypto.randomUUID().replace(/-/g, "");
    const update = col === "takeaway_qr_token" ? { takeaway_qr_token: newToken } : { delivery_qr_token: newToken };
    const { error } = await supabase.from("cafeterias").update(update).eq("ref_code", refCode);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
    load();
  };

  return (
    <Card className="mb-6 p-4">
      <h2 className="font-semibold mb-3">{t("tables.other_services.title")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {cafe.mode_takeaway && cafe.takeaway_qr_token && (
          <QrCard
            title={t("tables.other_services.takeaway")}
            icon={<Package className="h-4 w-4" />}
            url={`${window.location.origin}/m/takeaway/${cafe.takeaway_qr_token}`}
            onRegenerate={() => regenerate("takeaway_qr_token")}
          />
        )}
        {cafe.mode_delivery && cafe.delivery_qr_token && (
          <QrCard
            title={t("tables.other_services.delivery")}
            icon={<Bike className="h-4 w-4" />}
            url={`${window.location.origin}/m/delivery/${cafe.delivery_qr_token}`}
            onRegenerate={() => regenerate("delivery_qr_token")}
          />
        )}
      </div>
    </Card>
  );
}

function QrCard({ title, icon, url, onRegenerate }: { title: string; icon: React.ReactNode; url: string; onRegenerate: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const canvas = ref.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    w.document.write(`<html><head><title>${title}</title></head><body style="display:flex;flex-direction:column;align-items:center;font-family:sans-serif;padding:40px"><h2>${title}</h2><img src="${canvas.toDataURL()}" style="width:300px"/><p style="word-break:break-all;font-size:11px">${url}</p><script>window.print()</script></body></html>`);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success(t("tables.qr.link_copied"));
  };
  return (
    <div className="border border-border rounded-lg p-4 flex flex-col items-center text-center">
      <div className="flex items-center gap-2 mb-2 font-semibold text-sm">{icon}{title}</div>
      <div ref={ref} className="bg-white p-2 rounded">
        <QRCodeCanvas value={url} size={160} />
      </div>
      <p className="text-[10px] text-muted-foreground mt-2 break-all" dir="ltr">{url}</p>
      <div className="mt-3 flex flex-wrap gap-2 justify-center">
        <Button variant="outline" size="sm" onClick={print}><Printer className="h-3 w-3 me-1" />{t("common.print") || "طباعة"}</Button>
        <Button variant="outline" size="sm" onClick={onRegenerate}><RefreshCw className="h-3 w-3 me-1" />{t("common.refresh") || "تجديد"}</Button>
        <Button variant="outline" size="sm" onClick={copy}><Copy className="h-3 w-3 me-1" />{t("tables.qr.copy_link")}</Button>
      </div>
    </div>
  );
}
