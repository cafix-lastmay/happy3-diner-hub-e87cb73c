// Public pickup display board — shows ready take-away orders by short code and customer name.
// Refreshes every 4s. Designed for a large screen at the counter.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { BellRing } from "lucide-react";

export const Route = createFileRoute("/pickup/$cafeRef")({ component: PickupBoard });

interface Row { short_code: string; customer_name: string | null; ready_at: string }

function PickupBoard() {
  const { cafeRef } = Route.useParams();
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.rpc("get_pickup_board", { _cafe_ref: cafeRef });
      setRows((data as Row[]) ?? []);
      setLoaded(true);
    };
    load();
    const id = setInterval(load, 4000);
    const channel = supabase.channel(`pickup-${cafeRef}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `cafeteria_ref_code=eq.${cafeRef}` }, () => load())
      .subscribe();
    return () => { clearInterval(id); supabase.removeChannel(channel); };
  }, [cafeRef]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30 p-6">
      <header className="text-center mb-8">
        <div className="inline-flex items-center gap-3">
          <BellRing className="h-8 w-8 text-accent" />
          <h1 className="text-4xl font-extrabold">{t("pickup.title")}</h1>
        </div>
        <p className="text-muted-foreground mt-2 text-lg">{t("pickup.subtitle")}</p>
      </header>
      {loaded && rows.length === 0 ? (
        <div className="text-center text-muted-foreground text-xl mt-20">{t("pickup.empty")}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => (
            <Card key={r.short_code + r.ready_at} className="p-6 text-center border-accent border-2 bg-accent/5 animate-in fade-in zoom-in">
              <div className="text-6xl font-mono font-extrabold text-accent tracking-widest" dir="ltr">{r.short_code}</div>
              {r.customer_name && <div className="mt-2 text-lg text-muted-foreground truncate">{r.customer_name}</div>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
