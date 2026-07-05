// Public customer-facing menu page accessed via QR code.
// Modern food-delivery-app layout: cover banner, search, sticky horizontal categories,
// "Most Popular" carousel, image-first item cards with qty + notes, floating cart, owner footer banner.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Coffee, Plus, Minus, ShoppingCart, ImageIcon, Check, BellRing, Sparkles, User, Search, MessageSquarePlus, Star, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
// sendServiceCall is only used for internal role→role toast calls now.
import { PromoBanner } from "@/components/PromoBanner";
import { MenuTypeBanner } from "@/components/customer/MenuTypeBanner";
import { FeedbackDialog } from "@/components/FeedbackDialog";

export const Route = createFileRoute("/m/$qrToken")({ component: CustomerMenu });

interface Tbl { id: string; cafeteria_ref_code: string; label: string }
interface Cafe { ref_code: string; name: string; currency_code: string | null; menu_header_url?: string | null; menu_footer_url?: string | null; banner_url?: string | null }
interface Cat { id: string; name: string; sort_order: number }
interface Size { id: string; name: string; description: string | null; price: number; is_default: boolean; sort_order: number }
interface Item { id: string; category_id: string | null; name: string; description: string | null; price: number; image_url: string | null; is_most_popular?: boolean; sizes?: Size[] }
interface CartLine { item_id: string; size_id: string | null; size_name: string | null; name: string; price: number; qty: number }
interface FooterBanner { enabled: boolean; text: string | null; cta_text: string | null; url: string | null }

const lineKey = (itemId: string, sizeId: string | null) => `${itemId}|${sizeId ?? ""}`;
const defaultSizeFor = (it: Item): Size | null => {
  if (!it.sizes || it.sizes.length === 0) return null;
  return it.sizes.find((s) => s.is_default) ?? it.sizes[0];
};
interface ActiveTier { id: string; name: string }

const ORDER_STORAGE_PREFIX = "cafeteria_order_";

function CustomerMenu() {
  const { qrToken } = Route.useParams();
  const { t } = useI18n();
  const [tbl, setTbl] = useState<Tbl | null>(null);
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [popular, setPopular] = useState<Item[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [selectedSize, setSelectedSize] = useState<Record<string, string>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [waiterName, setWaiterName] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [notesOpenFor, setNotesOpenFor] = useState<string | null>(null);
  const [footerBanner, setFooterBanner] = useState<FooterBanner | null>(null);
  const [activeTier, setActiveTier] = useState<ActiveTier | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Restore tracked order from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(ORDER_STORAGE_PREFIX + qrToken);
      if (raw) {
        const parsed = JSON.parse(raw) as { orderId: string; status?: string; ts: number };
        if (parsed.orderId && Date.now() - (parsed.ts || 0) < 6 * 60 * 60 * 1000) {
          setOrderId(parsed.orderId);
          setOrderStatus(parsed.status ?? "new");
        } else {
          localStorage.removeItem(ORDER_STORAGE_PREFIX + qrToken);
        }
      }
    } catch { /* ignore */ }
  }, [qrToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_menu_for_qr", { _qr_token: qrToken });
        if (cancelled) return;
        if (error || !data) { setInvalid(true); setLoading(false); return; }
        const payload = data as unknown as {
          table: Tbl;
          cafeteria: Cafe;
          categories: Cat[];
          items: Item[];
          popular?: Item[];
          footer_banner?: FooterBanner;
          active_tier?: ActiveTier | null;
        };
        setTbl(payload.table);
        setCafe(payload.cafeteria);
        const catList = payload.categories ?? [];
        setCats(catList);
        setItems(payload.items ?? []);
        setPopular(payload.popular ?? []);
        setFooterBanner(payload.footer_banner ?? null);
        setActiveTier(payload.active_tier ?? null);
        if (catList.length > 0) setActiveCat(catList[0].id);
      } catch (err) {
        console.error("QR menu load failed", err);
        if (!cancelled) setInvalid(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [qrToken]);

  // Track order live
  useEffect(() => {
    if (!orderId) return;
    const tick = async () => {
      const { data } = await supabase.rpc("get_order_status", { _order_id: orderId, _qr_token: qrToken });
      const row = (data as Array<{ status: string; waiter_name: string | null }> | null)?.[0];
      if (row) {
        setOrderStatus(row.status);
        setWaiterName(row.waiter_name ?? null);
        try {
          localStorage.setItem(ORDER_STORAGE_PREFIX + qrToken, JSON.stringify({ orderId, status: row.status, ts: Date.now() }));
          if (row.status === "served" || row.status === "cancelled") {
            setTimeout(() => { localStorage.removeItem(ORDER_STORAGE_PREFIX + qrToken); }, 60 * 1000);
          }
        } catch { /* ignore */ }
      }
    };
    tick();
    const interval = setInterval(tick, 4000);
    return () => clearInterval(interval);
  }, [orderId, qrToken]);

  const total = useMemo(() => Object.values(cart).reduce((s, ln) => s + ln.price * ln.qty, 0), [cart]);

  const itemCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b.qty, 0), [cart]);

  const getSelectedSize = (it: Item): Size | null => {
    if (!it.sizes || it.sizes.length === 0) return null;
    const chosen = selectedSize[it.id];
    if (chosen) return it.sizes.find((s) => s.id === chosen) ?? defaultSizeFor(it);
    return defaultSizeFor(it);
  };
  const setQtyFor = (it: Item, qty: number) => {
    const sz = getSelectedSize(it);
    const key = lineKey(it.id, sz?.id ?? null);
    setCart((c) => {
      const r = { ...c };
      if (qty <= 0) delete r[key];
      else r[key] = { item_id: it.id, size_id: sz?.id ?? null, size_name: sz?.name ?? null, name: it.name, price: sz ? sz.price : Number(it.price), qty };
      return r;
    });
  };
  const qtyOf = (it: Item) => {
    const sz = getSelectedSize(it);
    return cart[lineKey(it.id, sz?.id ?? null)]?.qty ?? 0;
  };
  const inc = (it: Item) => setQtyFor(it, qtyOf(it) + 1);
  const dec = (it: Item) => setQtyFor(it, qtyOf(it) - 1);

  const scrollToCat = (id: string) => {
    setActiveCat(id);
    const el = sectionRefs.current[id];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Filter items by search
  const q = search.trim().toLowerCase();
  const matchesSearch = (it: Item) =>
    !q || it.name.toLowerCase().includes(q) || (it.description?.toLowerCase().includes(q) ?? false);
  const filteredItems = useMemo(() => items.filter(matchesSearch), [items, q]);

  const submit = async () => {
    if (!tbl || sending) return;
    const itemsArr = Object.values(cart).map((ln) => ({
      item_id: ln.item_id,
      qty: ln.qty,
      size_id: ln.size_id,
      notes: itemNotes[lineKey(ln.item_id, ln.size_id)] || "",
    }));
    if (itemsArr.length === 0) return;
    setSending(true);
    try {
      const { data, error } = await supabase.rpc("place_order", { _qr_token: qrToken, _customer_name: name, _notes: notes, _items: itemsArr });
      if (error) {
        const errMsg = error.message || "";
        const msg = errMsg.includes("CAFETERIA_BLOCKED")
          ? t("customer.error.cafeteria_blocked")
          : errMsg.includes("INSUFFICIENT_BALANCE")
            ? t("customer.error.insufficient_balance")
            : errMsg;
        toast.error(msg);
        return;
      }
      const newId = data as string;
      try {
        localStorage.setItem(ORDER_STORAGE_PREFIX + qrToken, JSON.stringify({ orderId: newId, status: "new", ts: Date.now() }));
      } catch { /* ignore */ }
      toast.success(t("customer.order_sent"));
      setOrderId(newId);
      setOrderStatus("new");
      setCart({}); setNotes(""); setItemNotes({}); setCartOpen(false);
    } finally {
      setSending(false);
    }
  };

  const startNewOrder = () => {
    setOrderId(null);
    setOrderStatus(null);
    setWaiterName(null);
    try { localStorage.removeItem(ORDER_STORAGE_PREFIX + qrToken); } catch { /* ignore */ }
  };

  const [activeCalls, setActiveCalls] = useState<Record<string, string>>({});
  const refreshActiveCalls = async () => {
    const { data } = await supabase.rpc("get_active_calls_for_qr", { _qr_token: qrToken });
    const map: Record<string, string> = {};
    (data as { id: string; kind: string }[] | null)?.forEach((r) => { map[r.kind] = r.id; });
    setActiveCalls(map);
  };
  useEffect(() => {
    if (!qrToken || invalid || loading) return;
    refreshActiveCalls();
    const id = setInterval(refreshActiveCalls, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrToken, invalid, loading]);

  const callStaff = async (kind: "waiter" | "cleaner") => {
    if (!cafe?.ref_code) return;
    if (activeCalls[kind]) { toast.info(t("customer.call_pending")); return; }
    try {
      const { data, error } = await supabase.rpc("create_table_call", { _qr_token: qrToken, _kind: kind });
      if (error) throw error;
      setActiveCalls((m) => ({ ...m, [kind]: data as string }));
      toast.success(t("customer.call_sent"));
    } catch (e) {
      console.error("call failed", e);
      toast.error(t("customer.call_failed"));
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">{t("common.loading")}</div>;
  if (invalid) return <div className="min-h-screen flex items-center justify-center text-muted-foreground p-4 text-center">{t("customer.invalid_qr")}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/20 to-background pb-32">
      {/* === 1) Cover banner with cafeteria name === */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[3/1] max-h-[260px] overflow-hidden bg-muted">

        {cafe?.banner_url ? (
          <img src={cafe.banner_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent/30 via-accent/10 to-primary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
        <div className="absolute top-3 end-3 flex items-center gap-2">
          <FeedbackDialog defaultRole="customer" trigger={
            <Button variant="secondary" size="icon" aria-label="شكاوى واقتراحات" className="h-8 w-8">
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          } />
          <LanguageSwitcher />
        </div>
        <div className="absolute bottom-3 inset-x-0 px-4">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground drop-shadow-sm truncate">{cafe?.name}</h1>
          <div className="mt-1 text-base sm:text-lg font-bold text-sky-600 dark:text-sky-400">
            {t("customer.your_table")}: <span className="font-extrabold">{tbl?.label}</span>
          </div>
        </div>
      </div>

      {/* === 2) Search bar (sticky) === */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-2.5">
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("customer.search.placeholder")}
              className="ps-9 pe-9 h-10 rounded-full bg-muted/50 border-transparent focus-visible:bg-background"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute top-1/2 -translate-y-1/2 end-2 h-6 w-6 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center"
                aria-label="clear"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        {/* === 3) Horizontal categories === */}
        {!q && cats.length > 0 && (
          <div className="overflow-x-auto scrollbar-hide border-t border-border/50">
            <div className="flex gap-2 px-4 py-2 min-w-max">
              {cats.map((c) => {
                const count = items.filter((i) => i.category_id === c.id).length;
                if (count === 0) return null;
                return (
                  <button
                    key={c.id}
                    onClick={() => scrollToCat(c.id)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                      activeCat === c.id
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <main className="container mx-auto px-4 py-4">
        {orderId && (
          <Card className="p-6 mb-4 border-accent border-2 bg-accent/5">
            <div className="flex flex-col items-center text-center space-y-3 pb-4 border-b border-accent/30">
              <div className="text-5xl">✅</div>
              <h2 className="text-xl font-bold">{t("customer.order_received")}</h2>
              <div className="bg-muted rounded-2xl p-4 w-full max-w-xs">
                <p className="text-xs text-muted-foreground mb-1">{t("customer.order_number")}</p>
                <p className="text-3xl font-mono font-bold tracking-widest text-accent" dir="ltr">
                  #{orderId.slice(-6).toUpperCase()}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">📌 {t("customer.keep_number")}</p>
            </div>
            <div className="flex items-center justify-between gap-2 mt-3">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{t("customer.order_status")}</div>
                <Badge className="mt-1 text-sm bg-accent text-accent-foreground">
                  <Check className="h-3 w-3 me-1" />
                  {t(`status.${orderStatus ?? "new"}`)}
                </Badge>
                {waiterName && (
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{t("customer.your_waiter")}:</span>
                    <span className="font-medium text-foreground">{waiterName}</span>
                  </div>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={startNewOrder}>{t("customer.new_order")}</Button>
            </div>
          </Card>
        )}

        {/* Service call buttons */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <Button variant="outline" onClick={() => callStaff("waiter")} disabled={!!activeCalls["waiter"]} className="h-11 border-accent/40 hover:bg-accent/10">
            <BellRing className="h-4 w-4 me-1" /> {activeCalls["waiter"] ? t("customer.call_pending") : t("customer.call_waiter")}
          </Button>
          <Button variant="outline" onClick={() => callStaff("cleaner")} disabled={!!activeCalls["cleaner"]} className="h-11 border-accent/40 hover:bg-accent/10">
            <Sparkles className="h-4 w-4 me-1" /> {activeCalls["cleaner"] ? t("customer.call_pending") : t("customer.call_cleaner")}
          </Button>
        </div>

        {/* === 4) Most Popular (horizontal scroll) === */}
        {!q && popular.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Star className="h-4 w-4 text-accent fill-accent" />
              <h2 className="text-lg font-bold">{t("customer.most_popular")}</h2>
            </div>
            <div className="-mx-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-3 px-4 min-w-max">
                {popular.map((it) => {
                  const qty = qtyOf(it);
                  const sz = getSelectedSize(it);
                  const dispPrice = sz ? sz.price : Number(it.price);
                  return (
                    <Card
                      key={it.id}
                      className={`w-40 shrink-0 overflow-hidden transition-all ${qty > 0 ? "ring-2 ring-accent" : ""}`}
                    >
                      <div className="aspect-square bg-muted relative">
                        {it.image_url ? (
                          <img src={it.image_url} alt={it.name} loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-8 w-8 text-muted-foreground/40" /></div>
                        )}
                        <button
                          onClick={() => inc(it)}
                          className="absolute bottom-2 end-2 h-8 w-8 rounded-full bg-accent text-accent-foreground shadow-lg flex items-center justify-center active:scale-95"
                          aria-label={t("customer.add_to_cart")}
                        >
                          {qty > 0 ? <span className="text-xs font-bold">{qty}</span> : <Plus className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="p-2">
                        <div className="text-sm font-semibold leading-tight line-clamp-1">{it.name}</div>
                        <div className="font-bold text-accent text-sm mt-1">{dispPrice.toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground">{cafe?.currency_code}</span></div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* === 5) Full menu list === */}
        {q ? (
          <section className="mb-8">
            <h2 className="text-base font-semibold mb-3 text-muted-foreground">{t("customer.search.results")} ({filteredItems.length})</h2>
            <div className="grid gap-3">
              {filteredItems.map((it) => (
                <ItemCard
                  key={it.id}
                  it={it}
                  qty={qtyOf(it)}
                  selectedSizeId={getSelectedSize(it)?.id ?? null}
                  notes={itemNotes[it.id] ?? ""}
                  notesOpen={notesOpenFor === it.id}
                  currency={cafe?.currency_code}
                  onInc={() => inc(it)}
                  onDec={() => dec(it)}
                  onPickSize={(sid) => setSelectedSize((m) => ({ ...m, [it.id]: sid }))}
                  onSetNotes={(n) => setItemNotes((m) => ({ ...m, [it.id]: n }))}
                  onToggleNotes={() => setNotesOpenFor((v) => v === it.id ? null : it.id)}
                  t={t}
                />
              ))}
              {filteredItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">{t("customer.search.empty")}</p>
              )}
            </div>
          </section>
        ) : (
          cats.map((c) => {
            const ci = items.filter((i) => i.category_id === c.id);
            if (ci.length === 0) return null;
            return (
              <section
                key={c.id}
                ref={(el) => { sectionRefs.current[c.id] = el; }}
                className="mb-8 scroll-mt-32"
              >
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-1 w-6 rounded-full bg-accent" />
                  <h2 className="text-lg font-bold">{c.name}</h2>
                  <span className="text-xs text-muted-foreground">({ci.length})</span>
                </div>
                <div className="grid gap-3">
                  {ci.map((it) => (
                    <ItemCard
                      key={it.id}
                      it={it}
                      qty={qtyOf(it)}
                      selectedSizeId={getSelectedSize(it)?.id ?? null}
                      notes={itemNotes[it.id] ?? ""}
                      notesOpen={notesOpenFor === it.id}
                      currency={cafe?.currency_code}
                      onInc={() => inc(it)}
                      onDec={() => dec(it)}
                      onPickSize={(sid) => setSelectedSize((m) => ({ ...m, [it.id]: sid }))}
                      onSetNotes={(n) => setItemNotes((m) => ({ ...m, [it.id]: n }))}
                      onToggleNotes={() => setNotesOpenFor((v) => v === it.id ? null : it.id)}
                      t={t}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}

        {/* === 7) Footer banner (owner-managed, global) === */}
        {footerBanner && (
          <div className="mt-6">
            <PromoBanner
              enabled={footerBanner.enabled}
              text={footerBanner.text}
              ctaText={footerBanner.cta_text}
              url={footerBanner.url}
            />
          </div>
        )}
      </main>

      {/* === 6) Floating cart button === */}
      {itemCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 inset-x-4 z-30 bg-accent text-accent-foreground rounded-2xl p-4 shadow-2xl flex items-center justify-between hover:bg-accent/90 transition-all active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -top-2 -end-2 bg-background text-foreground text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center border border-accent">
                {itemCount}
              </span>
            </div>
            <span className="font-bold text-sm">{t("customer.cart")}</span>
          </div>
          <span className="font-bold">{total.toFixed(2)} {cafe?.currency_code}</span>
        </button>
      )}

      {/* Expanded cart */}
      {cartOpen && (
        <>
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={() => setCartOpen(false)} />
          <div className="fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border rounded-t-3xl shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="container mx-auto max-w-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold">
                  <ShoppingCart className="h-4 w-4" /> {t("customer.cart")}
                  <Badge variant="secondary">{itemCount}</Badge>
                </div>
                <button onClick={() => setCartOpen(false)} className="text-muted-foreground text-sm">✕</button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2 -mx-2 px-2">
                {Object.entries(cart).map(([key, ln]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-accent w-6">{ln.qty}×</span>
                    <span className="flex-1 truncate">
                      {ln.name}{ln.size_name ? <span className="text-muted-foreground"> — {ln.size_name}</span> : null}
                    </span>
                    <span className="font-medium">{(ln.price * ln.qty).toFixed(2)}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCart((c) => {
                      const r = { ...c }; if (ln.qty <= 1) delete r[key]; else r[key] = { ...ln, qty: ln.qty - 1 }; return r;
                    })}>
                      <Minus className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border font-bold">
                <span>{t("customer.cart")}</span>
                <span className="text-accent text-lg">{total.toFixed(2)} {cafe?.currency_code}</span>
              </div>
              <Input placeholder={t("customer.your_name_optional")} value={name} onChange={(e) => setName(e.target.value)} />
              <Textarea placeholder={t("customer.notes_placeholder")} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              <Button onClick={submit} disabled={sending} className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 font-bold">
                {sending ? t("common.loading") : t("customer.send_order")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// === Image-first item card with quantity input + sizes + notes ===
function ItemCard({
  it, qty, selectedSizeId, notes, notesOpen, currency, onInc, onDec, onPickSize, onSetNotes, onToggleNotes, t,
}: {
  it: Item;
  qty: number;
  selectedSizeId: string | null;
  notes: string;
  notesOpen: boolean;
  currency: string | null | undefined;
  onInc: () => void;
  onDec: () => void;
  onPickSize: (sizeId: string) => void;
  onSetNotes: (n: string) => void;
  onToggleNotes: () => void;
  t: (k: string) => string;
}) {
  const sizes = it.sizes ?? [];
  const sz = sizes.find((s) => s.id === selectedSizeId) ?? null;
  const displayPrice = sz ? sz.price : Number(it.price);
  return (
    <Card className={`overflow-hidden transition-all ${qty > 0 ? "ring-2 ring-accent" : ""}`}>
      <div className="flex gap-3 p-3">
        {it.image_url ? (
          <img
            src={it.image_url}
            alt={it.name}
            loading="lazy"
            className="h-24 w-24 sm:h-28 sm:w-28 rounded-xl object-cover shrink-0 bg-muted"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
          />
        ) : (
          <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start gap-1">
            {it.is_most_popular && <Star className="h-3.5 w-3.5 text-accent fill-accent shrink-0 mt-0.5" />}
            <div className="font-semibold text-sm leading-tight line-clamp-2 flex-1">{it.name}</div>
          </div>
          {it.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1">{it.description}</p>
          )}
          {sizes.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {sizes.map((s) => {
                const active = (sz?.id ?? "") === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => onPickSize(s.id)}
                    className={`text-[11px] px-2 py-0.5 rounded-full border ${active ? "bg-accent text-accent-foreground border-accent" : "border-border bg-muted text-foreground"}`}>
                    {s.name} · {Number(s.price).toFixed(2)}
                  </button>
                );
              })}
            </div>
          )}
          {sz?.description && <div className="text-[11px] text-muted-foreground italic mt-0.5">{sz.description}</div>}
          <div className="font-bold text-accent text-sm mt-1.5">
            {displayPrice.toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground">{currency}</span>
          </div>
          <div className="mt-auto pt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 bg-muted rounded-full p-0.5">
              <Button size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={onDec}>
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-9 text-center text-sm font-bold">{qty}</span>
              <Button size="icon" className="h-7 w-7 rounded-full bg-accent text-accent-foreground hover:bg-accent/90" onClick={onInc}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <button
              onClick={onToggleNotes}
              className={`text-[11px] flex items-center gap-1 px-2 py-1 rounded-full border ${notes ? "border-accent text-accent bg-accent/5" : "border-border text-muted-foreground hover:bg-muted"}`}
              type="button"
            >
              <MessageSquarePlus className="h-3 w-3" />
              {t("customer.add_notes")}
            </button>
          </div>
          {notesOpen && (
            <Textarea
              value={notes}
              onChange={(e) => onSetNotes(e.target.value)}
              placeholder={t("customer.item_notes.placeholder")}
              rows={2}
              className="mt-2 text-xs"
              maxLength={200}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
