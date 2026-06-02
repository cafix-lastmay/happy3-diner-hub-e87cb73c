// Public take-away menu — customer scans cafeteria-level QR, places an order to pick up at the counter.
// Order flow: awaiting_payment -> paid_at_counter -> preparing -> ready -> served
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Coffee, Plus, Minus, ShoppingCart, ImageIcon, Check, Sparkles, Search, X, ShoppingBag, MapPin, Bike } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CustomerDeliveryTracker } from "@/components/delivery/CustomerDeliveryTracker";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlatformPromoBanner } from "@/components/PlatformPromoBanner";
import { MenuTypeBanner } from "@/components/customer/MenuTypeBanner";

export const Route = createFileRoute("/t/$qrToken")({ component: TakeawayMenu });

interface Cafe { ref_code: string; name: string; currency_code: string | null; banner_url?: string | null; mode_dine_in: boolean; mode_takeaway: boolean; mode_delivery: boolean }
interface Cat { id: string; name: string; sort_order: number }
interface Item { id: string; category_id: string | null; name: string; description: string | null; price: number; image_url: string | null; is_most_popular?: boolean }

const STORAGE_PREFIX = "takeaway_order_";

function TakeawayMenu() {
  const { qrToken } = Route.useParams();
  const { t } = useI18n();
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [popular, setPopular] = useState<Item[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [orderMode, setOrderMode] = useState<"takeaway" | "delivery">("takeaway");
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const lastNotifiedStatus = useRef<string | null>(null);

  // Restore tracked order (including mode)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + qrToken);
      if (raw) {
        const p = JSON.parse(raw) as { orderId: string; shortCode?: string; mode?: "takeaway" | "delivery"; ts: number };
        if (p.orderId && Date.now() - p.ts < 6 * 60 * 60 * 1000) {
          setOrderId(p.orderId);
          setShortCode(p.shortCode ?? null);
          if (p.mode === "delivery" || p.mode === "takeaway") setOrderMode(p.mode);
        } else localStorage.removeItem(STORAGE_PREFIX + qrToken);
      }
    } catch { /* ignore */ }
  }, [qrToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_takeaway_menu", { _takeaway_token: qrToken });
        if (cancelled) return;
        if (error || !data) { setInvalid(true); setLoading(false); return; }
        const payload = data as unknown as { cafeteria: Cafe; categories: Cat[]; items: Item[]; popular?: Item[] };
        setCafe(payload.cafeteria);
        setCats(payload.categories ?? []);
        setItems(payload.items ?? []);
        setPopular(payload.popular ?? []);
        if ((payload.categories ?? []).length > 0) setActiveCat(payload.categories[0].id);
      } catch (err) {
        console.error("Takeaway menu load failed", err);
        if (!cancelled) setInvalid(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [qrToken]);

  // Poll order status (takeaway only; delivery has its own tracker)
  useEffect(() => {
    if (!orderId || orderMode === "delivery") return;
    const tick = async () => {
      const { data } = await supabase.rpc("get_takeaway_order_status", { _order_id: orderId });
      const row = (data as Array<{ status: string; short_code: string; total: number }> | null)?.[0];
      if (row) {
        setOrderStatus(row.status);
        setShortCode(row.short_code);
        try { localStorage.setItem(STORAGE_PREFIX + qrToken, JSON.stringify({ orderId, shortCode: row.short_code, ts: Date.now() })); } catch { /* ignore */ }

        // Push-like notification when status hits "ready"
        if (row.status === "ready" && lastNotifiedStatus.current !== "ready") {
          lastNotifiedStatus.current = "ready";
          const title = t("takeaway.notify.ready.title");
          const body = t("takeaway.notify.ready.body").replace("{code}", row.short_code);
          toast.success(title, { description: body, duration: 15000 });
          try {
            if (typeof window !== "undefined" && "Notification" in window) {
              if (Notification.permission === "granted") {
                new Notification(title, { body });
              } else if (Notification.permission !== "denied") {
                Notification.requestPermission().then((p) => {
                  if (p === "granted") new Notification(title, { body });
                });
              }
            }
          } catch { /* ignore */ }
        } else if (row.status !== "ready") {
          lastNotifiedStatus.current = row.status;
        }

        if (row.status === "served" || row.status === "cancelled") {
          setTimeout(() => { try { localStorage.removeItem(STORAGE_PREFIX + qrToken); } catch { /* ignore */ } }, 60 * 1000);
        }
      }
    };
    tick();
    const interval = setInterval(tick, 4000);
    return () => clearInterval(interval);
  }, [orderId, qrToken, t]);

  // Ask for notification permission early so the "ready" toast can show OS notification.
  useEffect(() => {
    if (orderId && typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch { /* ignore */ }
    }
  }, [orderId]);

  const total = useMemo(() => Object.entries(cart).reduce((s, [id, qty]) => {
    const it = items.find((x) => x.id === id);
    return s + (it ? Number(it.price) * qty : 0);
  }, 0), [cart, items]);

  const itemCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart]);
  const setQty = (id: string, qty: number) => {
    setCart((c) => { const r = { ...c }; if (qty <= 0) delete r[id]; else r[id] = qty; return r; });
  };
  const inc = (id: string) => setQty(id, (cart[id] ?? 0) + 1);
  const dec = (id: string) => setQty(id, (cart[id] ?? 0) - 1);

  const scrollToCat = (id: string) => {
    setActiveCat(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const q = search.trim().toLowerCase();
  const matchesSearch = (it: Item) => !q || it.name.toLowerCase().includes(q) || (it.description?.toLowerCase().includes(q) ?? false);
  const filteredItems = useMemo(() => items.filter(matchesSearch), [items, q]);

  const submit = async () => {
    if (sending) return;
    if (orderMode === "delivery" && !address.trim()) {
      setAddressError(true);
      return;
    }
    const itemsArr = Object.entries(cart).map(([item_id, qty]) => ({ item_id, qty, notes: itemNotes[item_id] || "" }));
    if (itemsArr.length === 0) return;
    // For delivery: show invoice first, only place order after explicit confirm
    if (orderMode === "delivery" && !showInvoice) { setShowInvoice(true); return; }
    setSending(true);
    try {
      let result: { order_id: string; short_code: string } | null = null;
      if (orderMode === "delivery") {
        const { data, error } = await supabase.rpc("place_delivery_order" as never, {
          _takeaway_token: qrToken,
          _customer_name: name,
          _customer_address: address,
          _customer_lat: (gps?.lat ?? null) as unknown as number,
          _customer_lng: (gps?.lng ?? null) as unknown as number,
          _notes: notes,
          _items: itemsArr,
        } as never);
        if (error) {
          const msg = (error.message || "").includes("INSUFFICIENT_BALANCE")
            ? t("customer.error.insufficient_balance") : error.message;
          toast.error(msg); return;
        }
        result = data as unknown as { order_id: string; short_code: string };
      } else {
        const { data, error } = await supabase.rpc("place_takeaway_order" as never, {
          _takeaway_token: qrToken, _customer_name: name, _notes: notes, _items: itemsArr,
        } as never);
        if (error) {
          const msg = (error.message || "").includes("INSUFFICIENT_BALANCE")
            ? t("customer.error.insufficient_balance") : error.message;
          toast.error(msg); return;
        }
        result = data as unknown as { order_id: string; short_code: string };
      }
      try { localStorage.setItem(STORAGE_PREFIX + qrToken, JSON.stringify({ orderId: result.order_id, shortCode: result.short_code, mode: orderMode, ts: Date.now() })); } catch { /* ignore */ }
      toast.success(t(orderMode === "delivery" ? "delivery.tracker.title" : "takeaway.order_placed"));
      setOrderId(result.order_id);
      setShortCode(result.short_code);
      setOrderStatus(orderMode === "delivery" ? "pending_assignment" : "awaiting_payment");
      setCart({}); setNotes(""); setItemNotes({}); setCartOpen(false); setShowInvoice(false);
    } finally {
      setSending(false);
    }
  };

  const useMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { toast.error(t("delivery.location_error")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setGps({ lat: p.coords.latitude, lng: p.coords.longitude }); toast.success(t("delivery.location_set")); },
      () => toast.error(t("delivery.location_error")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const startNewOrder = () => {
    setOrderId(null); setOrderStatus(null); setShortCode(null);
    lastNotifiedStatus.current = null;
    try { localStorage.removeItem(STORAGE_PREFIX + qrToken); } catch { /* ignore */ }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">{t("common.loading")}</div>;
  if (invalid) return <div className="min-h-screen flex items-center justify-center text-muted-foreground p-4 text-center">{t("takeaway.invalid_token")}</div>;

  const statusHint = orderStatus ? t(`takeaway.status.hint.${orderStatus}`) : "";

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/20 to-background pb-32">
      <MenuTypeBanner mode="take_away" />
      <div className="relative w-full aspect-[16/9] sm:aspect-[3/1] max-h-[260px] overflow-hidden bg-muted">

        {cafe?.banner_url ? (
          <img src={cafe.banner_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent/30 via-accent/10 to-primary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
        <div className="absolute top-3 end-3"><LanguageSwitcher /></div>
        <div className="absolute bottom-3 inset-x-0 px-4 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground drop-shadow-sm truncate">{cafe?.name}</h1>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <ShoppingBag className="h-3 w-3" />
              <span className="font-semibold text-foreground">{t("takeaway.title")}</span>
              <span>· {t("takeaway.subtitle")}</span>
            </div>
          </div>
          <div className="h-12 w-12 rounded-full bg-accent/90 text-accent-foreground flex items-center justify-center shadow-lg shrink-0">
            <Coffee className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Mode selector — clickable when delivery is available */}
      {cafe && !orderId && (
        <div className="container mx-auto px-4 pt-3">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setOrderMode("takeaway")}
              className={`px-3 py-1 rounded-full text-sm font-medium ${orderMode === "takeaway" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
              🥡 {t("mode.take_away")}
            </button>
            {cafe.mode_delivery && (
              <button onClick={() => setOrderMode("delivery")}
                className={`px-3 py-1 rounded-full text-sm font-medium ${orderMode === "delivery" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                🛵 {t("mode.delivery")}
              </button>
            )}
            {cafe.mode_dine_in && <Badge variant="outline" className="opacity-60">🍽️ {t("mode.dine_in")}</Badge>}
          </div>
        </div>
      )}

      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border shadow-sm mt-3">
        <div className="container mx-auto px-4 py-2.5">
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("customer.search.placeholder")} className="ps-9 pe-9 h-10 rounded-full bg-muted/50 border-transparent focus-visible:bg-background" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute top-1/2 -translate-y-1/2 end-2 h-6 w-6 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center" aria-label="clear"><X className="h-3 w-3" /></button>
            )}
          </div>
        </div>
        {!q && cats.length > 0 && (
          <div className="overflow-x-auto scrollbar-hide border-t border-border/50">
            <div className="flex gap-2 px-4 py-2 min-w-max">
              {cats.map((c) => {
                const count = items.filter((i) => i.category_id === c.id).length;
                if (count === 0) return null;
                return (
                  <button key={c.id} onClick={() => scrollToCat(c.id)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${activeCat === c.id ? "bg-accent text-accent-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <main className="container mx-auto px-4 py-4">
        {orderId && orderMode === "delivery" && (
          <CustomerDeliveryTracker orderId={orderId} shortCode={shortCode} currency={cafe?.currency_code} customerPhone="" onNewOrder={startNewOrder} />
        )}

        {orderId && orderMode === "takeaway" && (
          <Card className="p-6 mb-4 border-accent border-2 bg-accent/5">
            <div className="flex flex-col items-center text-center space-y-3 pb-4 border-b border-accent/30">
              <div className="text-5xl">{orderStatus === "ready" ? "🔔" : orderStatus === "awaiting_payment" ? "💳" : "🥡"}</div>
              <h2 className="text-xl font-bold">{t("customer.order_received")}</h2>
              <div className="bg-muted rounded-2xl p-4 w-full max-w-xs">
                <p className="text-xs text-muted-foreground mb-1">{t("takeaway.short_code")}</p>
                <p className="text-4xl font-mono font-bold tracking-widest text-accent" dir="ltr">{shortCode}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-3">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{t("customer.order_status")}</div>
                <Badge className="mt-1 text-sm bg-accent text-accent-foreground"><Check className="h-3 w-3 me-1" />{t(`status.${orderStatus ?? "awaiting_payment"}`)}</Badge>
                {statusHint && <p className="mt-2 text-xs text-muted-foreground">{statusHint}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={startNewOrder}>{t("customer.new_order")}</Button>
            </div>
          </Card>
        )}

        {!q && popular.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3"><Sparkles className="h-4 w-4 text-accent" /><h2 className="text-lg font-bold">{t("customer.most_popular")}</h2></div>
            <div className="-mx-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 px-4 min-w-max">
                {popular.map((it) => {
                  const qty = cart[it.id] ?? 0;
                  return (
                    <Card key={it.id} className={`w-40 shrink-0 overflow-hidden transition-all ${qty > 0 ? "ring-2 ring-accent" : ""}`}>
                      <div className="aspect-square bg-muted relative">
                        {it.image_url ? <img src={it.image_url} alt={it.name} loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-8 w-8 text-muted-foreground/40" /></div>}
                        <button onClick={() => inc(it.id)} className="absolute bottom-2 end-2 h-8 w-8 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center active:scale-95">
                          {qty > 0 ? <span className="text-xs font-bold">{qty}</span> : <Plus className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="p-2">
                        <div className="text-sm font-semibold leading-tight line-clamp-1">{it.name}</div>
                        <div className="font-bold text-accent text-sm mt-1">{Number(it.price).toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground">{cafe?.currency_code}</span></div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {q ? (
          <section className="mb-8">
            <h2 className="text-base font-semibold mb-3 text-muted-foreground">{t("customer.search.results")} ({filteredItems.length})</h2>
            <div className="grid gap-3">{filteredItems.map((it) => <SimpleItemRow key={it.id} it={it} qty={cart[it.id] ?? 0} inc={() => inc(it.id)} dec={() => dec(it.id)} currency={cafe?.currency_code} />)}</div>
          </section>
        ) : (
          cats.map((c) => {
            const catItems = items.filter((i) => i.category_id === c.id);
            if (catItems.length === 0) return null;
            return (
              <section key={c.id} className="mb-8" ref={(el) => { sectionRefs.current[c.id] = el; }}>
                <h2 className="text-lg font-bold mb-3">{c.name}</h2>
                <div className="grid gap-3">{catItems.map((it) => <SimpleItemRow key={it.id} it={it} qty={cart[it.id] ?? 0} inc={() => inc(it.id)} dec={() => dec(it.id)} currency={cafe?.currency_code} />)}</div>
              </section>
            );
          })
        )}
      </main>

      {/* Floating cart */}
      {itemCount > 0 && !cartOpen && !orderId && (
        <div className="fixed bottom-4 inset-x-0 px-4 z-50">
          <Button onClick={() => setCartOpen(true)} className="w-full h-14 bg-accent hover:bg-accent/90 text-accent-foreground shadow-2xl rounded-2xl flex items-center justify-between px-5">
            <span className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /><Badge className="bg-background text-foreground">{itemCount}</Badge></span>
            <span className="font-bold">{total.toFixed(2)} {cafe?.currency_code}</span>
            <span>{t("customer.cart")}</span>
          </Button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-bold text-lg">
              {showInvoice ? t("delivery.invoice.title") : t("customer.cart")}
            </h2>
            <button onClick={() => { if (showInvoice) setShowInvoice(false); else setCartOpen(false); }} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
          </div>

          {showInvoice && orderMode === "delivery" ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <Card className="p-4 space-y-2">
                  {Object.entries(cart).map(([id, qty]) => {
                    const it = items.find((x) => x.id === id); if (!it) return null;
                    return (
                      <div key={id} className="flex justify-between text-sm">
                        <span className="truncate">{qty}× {it.name}</span>
                        <span className="font-semibold shrink-0 ms-2">{(Number(it.price) * qty).toFixed(2)} {cafe?.currency_code}</span>
                      </div>
                    );
                  })}
                </Card>
                <Card className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span>{t("delivery.invoice.items_subtotal")}</span><span className="font-semibold">{total.toFixed(2)} {cafe?.currency_code}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>{t("delivery.fee")}</span><span className="italic">{t("delivery.invoice.tbd")}</span></div>
                  <div className="border-t pt-2 flex justify-between font-bold text-base"><span>{t("delivery.invoice.total")}</span><span>{total.toFixed(2)}+ {cafe?.currency_code}</span></div>
                  <div className="text-xs text-muted-foreground pt-1">{t("delivery.invoice.cod_note")}</div>
                </Card>
                <Card className="p-3 text-xs space-y-1">
                  <div><span className="text-muted-foreground">{t("takeaway.your_name")}: </span><span className="font-medium">{name || "—"}</span></div>
                  <div><span className="text-muted-foreground">{t("delivery.address")}: </span><span className="font-medium">{address}</span></div>
                  {gps && <div className="text-muted-foreground">📍 {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</div>}
                </Card>
              </div>
              <div className="p-4 border-t space-y-2">
                <Button variant="outline" className="w-full" onClick={() => setShowInvoice(false)}>{t("delivery.invoice.back")}</Button>
                <Button className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90" onClick={submit} disabled={sending}>
                  {sending ? t("common.loading") : t("delivery.invoice.confirm")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {Object.entries(cart).map(([id, qty]) => {
                  const it = items.find((x) => x.id === id); if (!it) return null;
                  return (
                    <Card key={id} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{it.name}</div>
                        <div className="text-xs text-accent font-bold">{(Number(it.price) * qty).toFixed(2)} {cafe?.currency_code}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => dec(id)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-6 text-center font-bold">{qty}</span>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => inc(id)}><Plus className="h-3 w-3" /></Button>
                      </div>
                    </Card>
                  );
                })}
                <Input placeholder={t("takeaway.your_name")} value={name} onChange={(e) => setName(e.target.value)} />



                {orderMode === "delivery" && (
                  <>
                    <Textarea
                      placeholder={t("delivery.address_placeholder")}
                      value={address}
                      onChange={(e) => { setAddress(e.target.value); setAddressError(false); }}
                      rows={2}
                      className={addressError ? "border-red-500 focus-visible:ring-red-500" : ""}
                    />
                    {addressError && <p className="text-red-500 text-xs">{t("delivery.address_required")}</p>}
                    <Button type="button" variant="outline" className="w-full" onClick={useMyLocation}>
                      <MapPin className="h-4 w-4 me-2" />
                      {gps ? `📍 ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : t("delivery.use_my_location")}
                    </Button>
                  </>
                )}

                <Textarea placeholder={t("customer.notes_placeholder")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <div className="p-4 border-t space-y-2">
                <div className="flex justify-between font-bold text-lg">
                  <span>{orderMode === "delivery" ? <span className="flex items-center gap-1"><Bike className="h-4 w-4" />{t("delivery.order")}</span> : t("customer.cart")}</span>
                  <span>{total.toFixed(2)} {cafe?.currency_code}</span>
                </div>
                <Button className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90" onClick={submit} disabled={sending || itemCount === 0}>
                  {sending ? t("common.loading") : orderMode === "delivery" ? t("delivery.invoice.title") : t("takeaway.send_order")}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      <PlatformPromoBanner />
    </div>
  );
}

function SimpleItemRow({ it, qty, inc, dec, currency }: { it: Item; qty: number; inc: () => void; dec: () => void; currency?: string | null }) {
  return (
    <Card className={`overflow-hidden flex gap-3 p-2 ${qty > 0 ? "ring-2 ring-accent" : ""}`}>
      <div className="h-20 w-20 shrink-0 rounded-lg bg-muted overflow-hidden">
        {it.image_url ? <img src={it.image_url} alt={it.name} loading="lazy" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-6 w-6 text-muted-foreground/40" /></div>}
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
        <div>
          <div className="font-semibold text-sm leading-tight line-clamp-1">{it.name}</div>
          {it.description && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{it.description}</div>}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="font-bold text-accent text-sm">{Number(it.price).toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground">{currency}</span></span>
          <div className="flex items-center gap-1">
            {qty > 0 && <>
              <Button size="icon" variant="outline" className="h-7 w-7" onClick={dec}><Minus className="h-3 w-3" /></Button>
              <span className="w-5 text-center text-sm font-bold">{qty}</span>
            </>}
            <Button size="icon" className="h-7 w-7 bg-accent text-accent-foreground hover:bg-accent/90" onClick={inc}><Plus className="h-3 w-3" /></Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
