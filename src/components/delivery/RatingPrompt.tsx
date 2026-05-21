// Customer rating prompt shown after delivery is delivered.
// Verifies caller via order_id + customer_phone (server-side).
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Star, Heart } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function RatingPrompt({ orderId, hasDriver, driverId }: { orderId: string; hasDriver: boolean; driverId?: string | null }) {
  const { t } = useI18n();
  const [phone, setPhone] = useState("");
  const [driverStars, setDriverStars] = useState(0);
  const [driverComment, setDriverComment] = useState("");
  const [cafeStars, setCafeStars] = useState(0);
  const [cafeComment, setCafeComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ driver: boolean; cafe: boolean }>({ driver: false, cafe: false });
  const [isCustFav, setIsCustFav] = useState<boolean | null>(null);
  const [favBusy, setFavBusy] = useState(false);
  const [items, setItems] = useState<{ item_id: string; name: string; qty: number }[]>([]);
  const [itemStars, setItemStars] = useState<Record<string, number>>({});
  const [itemsSubmitted, setItemsSubmitted] = useState(false);
  const [itemsBusy, setItemsBusy] = useState(false);

  useEffect(() => {
    supabase.rpc("get_delivery_rating_status", { _order_id: orderId }).then(({ data }) => {
      const row = (data ?? [])[0] as { driver_rated: boolean; cafe_rated: boolean } | undefined;
      if (row) setDone({ driver: row.driver_rated, cafe: row.cafe_rated });
    });
  }, [orderId]);

  useEffect(() => {
    if (!phone.trim()) { setItems([]); return; }
    supabase.rpc("get_delivery_order_items", { _order_id: orderId, _customer_phone: phone.trim() })
      .then(({ data, error }) => { if (!error && data) setItems(data as any); });
  }, [orderId, phone]);

  useEffect(() => {
    if (!driverId || !phone.trim()) return;
    supabase.rpc("is_customer_favorite_driver", { _customer_phone: phone.trim(), _driver_id: driverId })
      .then(({ data }) => setIsCustFav(Boolean(data)));
  }, [driverId, phone, done.driver]);

  const submitItemRatings = async () => {
    const ratings = Object.entries(itemStars).filter(([, s]) => s > 0).map(([item_id, stars]) => ({ item_id, stars }));
    if (ratings.length === 0) { toast.error(t("rating.choose_stars")); return; }
    setItemsBusy(true);
    const { error } = await supabase.rpc("submit_item_ratings", {
      _order_id: orderId, _customer_phone: phone.trim(), _ratings: ratings as any,
    });
    setItemsBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("rating.submitted"));
    setItemsSubmitted(true);
  };

  const toggleCustomerFavorite = async () => {
    if (!driverId || !phone.trim()) return;
    setFavBusy(true);
    const next = !isCustFav;
    const { error } = await supabase.rpc("toggle_customer_favorite_driver", {
      _order_id: orderId, _customer_phone: phone.trim(), _driver_id: driverId, _favorite: next,
    });
    setFavBusy(false);
    if (error) {
      const m = error.message ?? "";
      if (m.includes("PHONE_MISMATCH")) toast.error(t("rating.phone_mismatch"));
      else if (m.includes("DRIVER_MISMATCH")) toast.error(t("favorites.driver_mismatch"));
      else if (m.includes("NOT_DELIVERED")) toast.error(t("rating.not_delivered"));
      else toast.error(m);
      return;
    }
    setIsCustFav(next);
    toast.success(t("favorites.toggle_success"));
  };

  const allDone = (!hasDriver || done.driver) && done.cafe;
  if (allDone) {
    return (
      <Card className="p-4 text-center text-sm text-muted-foreground space-y-3">
        <div>⭐ {t("rating.thanks")}</div>
        {hasDriver && driverId && phone.trim() && isCustFav !== null && (
          <Button size="sm" variant={isCustFav ? "secondary" : "default"} onClick={toggleCustomerFavorite} disabled={favBusy}
            className={isCustFav ? "" : "bg-accent text-accent-foreground hover:bg-accent/90"}>
            <Heart className={`h-4 w-4 ${isCustFav ? "fill-pink-500 text-pink-500" : ""}`} />
            {isCustFav ? t("favorites.remove_customer") : t("favorites.add_customer")}
          </Button>
        )}
      </Card>
    );
  }

  const submit = async () => {
    if (!phone.trim()) { toast.error(t("rating.phone_required")); return; }
    if (cafeStars === 0 && (!hasDriver || driverStars === 0)) {
      toast.error(t("rating.choose_stars")); return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("submit_delivery_rating", {
      _order_id: orderId,
      _customer_phone: phone.trim(),
      _driver_stars: hasDriver ? driverStars : 0,
      _driver_comment: driverComment,
      _cafe_stars: cafeStars,
      _cafe_comment: cafeComment,
    });
    setBusy(false);
    if (error) {
      const m = error.message ?? "";
      if (m.includes("PHONE_MISMATCH")) toast.error(t("rating.phone_mismatch"));
      else if (m.includes("NOT_DELIVERED")) toast.error(t("rating.not_delivered"));
      else toast.error(m);
      return;
    }
    toast.success(t("rating.submitted"));
    setDone({ driver: hasDriver, cafe: true });
  };

  return (
    <Card className="p-4 space-y-3 border-accent/40 bg-accent/5">
      <h3 className="font-semibold text-center">{t("rating.title")}</h3>
      <p className="text-xs text-muted-foreground text-center">{t("rating.subtitle")}</p>

      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder={t("rating.phone_placeholder")}
        dir="ltr"
      />

      {hasDriver && !done.driver && (
        <div className="space-y-2">
          <div className="text-sm font-medium">{t("rating.driver_label")}</div>
          <StarRow value={driverStars} onChange={setDriverStars} />
          <Textarea rows={2} value={driverComment} onChange={(e) => setDriverComment(e.target.value)} placeholder={t("rating.comment_placeholder")} />
        </div>
      )}

      {!done.cafe && (
        <div className="space-y-2">
          <div className="text-sm font-medium">{t("rating.cafe_label")}</div>
          <StarRow value={cafeStars} onChange={setCafeStars} />
          <Textarea rows={2} value={cafeComment} onChange={(e) => setCafeComment(e.target.value)} placeholder={t("rating.comment_placeholder")} />
        </div>
      )}

      <Button onClick={submit} disabled={busy} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
        {busy ? t("common.loading") : t("rating.submit")}
      </Button>
    </Card>
  );
}

function StarRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1 justify-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" onClick={() => onChange(n)}
          className="p-1 transition-transform hover:scale-110"
          aria-label={`${n} stars`}
        >
          <Star className={`h-7 w-7 ${n <= value ? "fill-accent text-accent" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}
