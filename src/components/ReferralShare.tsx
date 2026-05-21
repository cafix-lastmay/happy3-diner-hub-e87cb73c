// Referral link + QR sharing card for marketers.
import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, Share2, Download } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/i18n/I18nProvider";

interface Props {
  refCode: string;
  /** Override subtitle translation key */
  subtitleKey?: string;
}

export function ReferralShare({ refCode, subtitleKey = "referral.subtitle" }: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"cafeteria" | "marketer">("cafeteria");
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = useMemo(
    () => `${origin}/signup/${tab}?ref=${encodeURIComponent(refCode)}`,
    [origin, tab, refCode],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success(t("referral.copied"));
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("common.error"));
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: t("referral.share_title"), url: link });
      } catch { /* user cancelled */ }
    } else {
      copy();
    }
  };

  const downloadQR = () => {
    const svg = document.getElementById("referral-qr") as SVGSVGElement | null;
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `referral-${refCode}-${tab}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Share2 className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-semibold">{t("referral.title")}</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{t(subtitleKey)}</p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "cafeteria" | "marketer")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="cafeteria">{t("referral.tab.cafeteria")}</TabsTrigger>
          <TabsTrigger value="marketer">{t("referral.tab.marketer")}</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-4">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4">
            <div className="rounded-md bg-white p-3">
              <QRCodeSVG id="referral-qr" value={link} size={176} level="M" includeMargin={false} />
            </div>
            <div className="text-xs text-muted-foreground font-mono break-all text-center">
              {t("common.ref_code")}: <span className="font-semibold text-foreground">{refCode}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Input readOnly value={link} className="font-mono text-xs" onClick={(e) => (e.target as HTMLInputElement).select()} />
            <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={t("referral.copy")}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <div className="flex gap-2">
            <Button type="button" onClick={share} className="flex-1 gap-2 bg-accent text-accent-foreground hover:bg-accent/90">
              <Share2 className="h-4 w-4" /> {t("referral.share")}
            </Button>
            <Button type="button" variant="outline" onClick={downloadQR} className="gap-2">
              <Download className="h-4 w-4" /> {t("referral.download_qr")}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
