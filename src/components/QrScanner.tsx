import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Camera, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { toast } from "sonner";

interface Props {
  onDecoded: (token: string) => void;
}

/**
 * Camera-based QR scanner. Decodes either a full URL (extracts the last path
 * segment after /m/) or a raw token, then calls onDecoded(token).
 */
export function QrScanner({ onDecoded }: Props) {
  const { t } = useI18n();
  const [active, setActive] = useState(false);
  const containerId = "qr-scanner-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const start = async () => {
      try {
        const instance = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = instance;
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (cancelled) return;
            // Extract token from URL or use raw value
            let token = decoded.trim();
            const match = token.match(/\/m\/([^/?#]+)/);
            if (match) token = match[1];
            instance.stop().catch(() => {});
            setActive(false);
            onDecoded(token);
          },
          () => {},
        );
      } catch (e) {
        toast.error(t("scanner.error"));
        setActive(false);
      }
    };
    start();

    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      if (inst) {
        inst.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [active, onDecoded, t]);

  if (!active) {
    return (
      <Button
        size="lg"
        onClick={() => setActive(true)}
        className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
      >
        <Camera className="h-5 w-5" />
        {t("scanner.start")}
      </Button>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div id={containerId} className="overflow-hidden rounded-xl border border-border bg-black" />
      <Button variant="outline" className="mt-3 w-full gap-2" onClick={() => setActive(false)}>
        <X className="h-4 w-4" />
        {t("scanner.stop")}
      </Button>
    </div>
  );
}
