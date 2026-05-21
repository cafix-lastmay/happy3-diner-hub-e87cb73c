// Owner-managed promotional banner displayed inside dashboards above the footer.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PromoBanner } from "@/components/PromoBanner";

interface Settings {
  footer_banner_enabled: boolean;
  footer_banner_text: string | null;
  footer_banner_cta_text: string | null;
  footer_banner_url: string | null;
}

export function PlatformPromoBanner() {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    supabase.from("app_settings")
      .select("footer_banner_enabled,footer_banner_text,footer_banner_cta_text,footer_banner_url")
      .maybeSingle()
      .then(({ data }) => { if (data) setS(data as Settings); });
  }, []);
  if (!s?.footer_banner_enabled) return null;
  return (
    <div className="px-4 md:px-6 lg:px-8 pb-4">
      <PromoBanner enabled={s.footer_banner_enabled} text={s.footer_banner_text} ctaText={s.footer_banner_cta_text} url={s.footer_banner_url} />
    </div>
  );
}
