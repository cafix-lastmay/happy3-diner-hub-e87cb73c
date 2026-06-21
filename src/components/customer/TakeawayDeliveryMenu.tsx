// Shared customer-facing menu page for Takeaway and Delivery orders.
// - Takeaway: name only (no phone).
// - Delivery: requires login, supports saved customer addresses with a default.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Coffee, Plus, Minus, ShoppingCart, ImageIcon, Check, Search, X, MapPin, User, Bike, Package, Locate, Star, StarOff, LogIn, MessageCircle, Wallet, Upload, Loader2
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PlatformPromoBanner } from "@/components/PlatformPromoBanner";
import { MenuTypeBanner } from "@/components/customer/MenuTypeBanner";

type Mode = "take_away" | "delivery";

interface Cafe {
  ref_code: string; name: string; currency_code: string | null;
  banner_url?: string | null; service_percent?: number; tax_percent?: number;
  tax_apply_takeaway?: boolean; tax_apply_delivery?: boolean;
  estimated_delivery_minutes?: number;
  whatsapp?: string | null;
}
interface Cat { id: string; name: string; sort_order: number }
interface Size { id: string; name: string; description: string | null; price: number; is_default: boolean; sort_order: number }
interface Item { id: string; category_id: string | null; name: string; description: string | null; price: number; image_url: string | null; is_most_popular?: boolean; sizes?: Size[] }
interface CartLine { item_id: string; size_id: string | null; size_name: string | null; name: string; price: number; qty: number }
interface SavedAddress { id: string; label: string | null; address: string; lat: number | null; lng: number | null; is_default: boolean }

const lineKey = (itemId: string, sizeId: string | null) => `${itemId}|${sizeId ?? ""}`;
const defaultSizeFor = (it: Item): Size | null => {
  if (!it.sizes || it.sizes.length === 0) return null;
  return it.sizes.find((s) => s.is_default) ?? it.sizes[0];
};

export function TakeawayDeliveryMenu({ token, mode }: { token: string; mode: Mode }) {
  const { t } = useI18n();
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [selectedSize, setSelectedSize] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [lastSnapshot, setLastSnapshot] = useState<{ lines: { name: string; qty: number; price: number }[]; total: number; address: string; lat: number | null; lng: number | null; notes: string; name: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Delivery-only auth + saved addresses (kept for legacy logged-in customers)
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string | "new" | null>(null);

  // Payment
  type PMethod = "cash_on_delivery" | "vodafone_cash" | "instapay";
  const [paymentMethods, setPaymentMethods] = useState<{ method: PMethod; wallet_number: string | null }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PMethod | null>(null);
  const [payerWallet, setPayerWallet] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rpc = mode === "take_away" ? "get_menu_for_takeaway" : "get_menu_for_delivery";
        const { data, error } = await supabase.rpc(rpc as never, { _token: token } as never);
        if (cancelled) return;
        if (error || !data) { setInvalid(true); setLoading(false); return; }
        const payload = data as unknown as { cafeteria: Cafe; categories: Cat[]; items: Item[] };
        setCafe(payload.cafeteria);
        const catList = payload.categories ?? [];
        setCats(catList);
        setItems(payload.items ?? []);
        if (catList.length > 0) setActiveCat(catList[0].id);
      } catch (err) {
        console.error("menu load failed", err);
        if (!cancelled) setInvalid(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token, mode]);

  // Load enabled payment methods for this cafeteria
  useEffect(() => {
    if (!cafe?.ref_code) return;
    (async () => {
      const { data } = await (supabase as any).rpc("get_enabled_payment_methods", { _ref_code: cafe.ref_code });
      const list = (data as { method: PMethod; wallet_number: string | null }[]) ?? [];
      setPaymentMethods(list);
      if (list.length === 1) setPaymentMethod(list[0].method);
    })();
  }, [cafe?.ref_code]);

  // Auth listener (only matters for delivery)
  useEffect(() => {
    if (mode !== "delivery") { setAuthChecked(true); return; }
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setAuthChecked(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [mode]);

  // Phone-based local restore: when the customer types a phone number we know,
  // pre-fill name/address/coords from localStorage (and from DB if reachable).
  useEffect(() => {
    const p = phone.replace(/[^\d+]/g, "");
    if (p.length < 6) return;
    try {
      const raw = localStorage.getItem(`cx:${p}`);
      if (raw) {
        const j = JSON.parse(raw) as { name?: string; address?: string; lat?: number | null; lng?: number | null };
        if (j.name && !name) setName(j.name);
        if (j.address && !address) setAddress(j.address);
        if (j.lat != null && lat == null) setLat(j.lat);
        if (j.lng != null && lng == null) setLng(j.lng);
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);


  // Load profile + saved addresses for delivery
  useEffect(() => {
    if (mode !== "delivery" || !session?.user) return;
    (async () => {
      const { data: addrs } = await supabase.from("customer_addresses").select("*").eq("user_id", session.user.id).order("is_default", { ascending: false });
      // Do NOT auto-fill the customer name from the auth profile: the same browser
      // may be logged in as the cafeteria owner, and we'd leak the cafeteria name
      // into the "your name" field. The customer always types their own name.
      const list = (addrs ?? []) as SavedAddress[];
      setAddresses(list);
      const def = list.find((a) => a.is_default) ?? list[0];
      if (def) {
        setSelectedAddrId(def.id);
        setAddress(def.address);
        setLat(def.lat);
        setLng(def.lng);
      } else {
        setSelectedAddrId("new");
      }
    })();
  }, [mode, session?.user]);

  const pickAddress = (a: SavedAddress) => {
    setSelectedAddrId(a.id);
    setAddress(a.address);
    setLat(a.lat);
    setLng(a.lng);
  };

  const startNewAddress = () => {
    setSelectedAddrId("new");
    setAddress("");
    setLat(null);
    setLng(null);
  };

  const setDefault = async (id: string) => {
    if (!session?.user) return;
    const { error } = await supabase.from("customer_addresses").update({ is_default: true }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })));
    toast.success(t("delivery.addresses.default"));
  };

  const subtotal = useMemo(() => Object.values(cart).reduce((s, ln) => s + ln.price * ln.qty, 0), [cart]);

  const serviceFee = useMemo(() => {
    if (!cafe?.service_percent) return 0;
    return subtotal * (cafe.service_percent / 100);
  }, [subtotal, cafe]);

  const taxFee = useMemo(() => {
    if (!cafe?.tax_percent) return 0;
    const apply = mode === "take_away" ? cafe.tax_apply_takeaway : cafe.tax_apply_delivery;
    if (!apply) return 0;
    return subtotal * (cafe.tax_percent / 100);
  }, [subtotal, cafe, mode]);

  const total = subtotal + serviceFee + taxFee;
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
  const decKey = (key: string) => setCart((c) => {
    const ln = c[key]; if (!ln) return c;
    const r = { ...c }; if (ln.qty <= 1) delete r[key]; else r[key] = { ...ln, qty: ln.qty - 1 };
    return r;
  });
  const incKey = (key: string) => setCart((c) => {
    const ln = c[key]; if (!ln) return c;
    return { ...c, [key]: { ...ln, qty: ln.qty + 1 } };
  });

  const scrollToCat = (id: string) => {
    setActiveCat(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error(t("customer.geo_unsupported")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); toast.success(t("customer.geo_captured")); },
      () => toast.error(t("customer.geo_failed"))
    );
  };

  // Normalize a phone number to E.164-ish digits for wa.me (strips +, spaces, dashes).
  const normalizeWa = (raw: string) => raw.replace(/[^\d]/g, "");

  // Build a nicely formatted WhatsApp message for the cafeteria with the order details.
  const buildWaMessage = (opts: { includeLocation?: boolean; locLat?: number | null; locLng?: number | null } = {}) => {
    const snap = lastSnapshot;
    const out: string[] = [];
    out.push(`🛵 *${mode === "delivery" ? t("mode.delivery") : t("mode.take_away")}* — ${cafe?.name ?? ""}`);
    if (orderId) out.push(`#${orderId.slice(-6).toUpperCase()}`);
    out.push("");
    out.push(`👤 ${snap?.name ?? name}`);
    const addr = snap?.address ?? address;
    if (mode === "delivery" && addr.trim()) {
      out.push(`📍 ${addr}`);
    }
    const useLat = opts.locLat ?? snap?.lat ?? lat;
    const useLng = opts.locLng ?? snap?.lng ?? lng;
    if (opts.includeLocation && useLat != null && useLng != null) {
      out.push(`🗺️ https://maps.google.com/?q=${useLat},${useLng}`);
    }
    out.push("");
    out.push(`🧾 *${t("customer.your_order")}:*`);
    if (snap) {
      snap.lines.forEach((l) => {
        out.push(`• ${l.name} × ${l.qty} = ${(l.price * l.qty).toFixed(2)} ${cafe?.currency_code ?? ""}`);
      });
    } else {
      Object.values(cart).forEach((ln) => {
        const label = ln.size_name ? `${ln.name} — ${ln.size_name}` : ln.name;
        out.push(`• ${label} × ${ln.qty} = ${(ln.price * ln.qty).toFixed(2)} ${cafe?.currency_code ?? ""}`);
      });
    }
    out.push("");
    out.push(`💰 ${t("customer.total")}: *${(snap?.total ?? total).toFixed(2)} ${cafe?.currency_code ?? ""}*`);
    const n = snap?.notes ?? notes;
    if (n.trim()) {
      out.push("");
      out.push(`📝 ${n}`);
    }
    return out.join("\n");
  };

  const openWhatsApp = (includeLocation: boolean) => {
    const num = normalizeWa(cafe?.whatsapp ?? "");
    if (!num) { toast.error(t("customer.wa_missing")); return; }
    const send = (locLat: number | null, locLng: number | null) => {
      const msg = buildWaMessage({ includeLocation, locLat, locLng });
      const url = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank", "noopener");
    };
    if (includeLocation && (lat == null || lng == null) && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); send(pos.coords.latitude, pos.coords.longitude); },
        () => { toast.error(t("customer.geo_failed")); send(null, null); }
      );
      return;
    }
    send(lat, lng);
  };


  const submit = async () => {
    if (sending) return;
    if (!name.trim()) { toast.error(t("customer.name_required")); return; }
    const phoneClean = phone.replace(/[^\d+]/g, "");
    if (phoneClean.length < 6) { toast.error("رقم هاتف غير صحيح"); return; }
    if (mode === "delivery") {
      if (!address.trim()) { toast.error(t("customer.address_required")); return; }
    }
    const itemsArr = Object.values(cart).map((ln) => ({ item_id: ln.item_id, qty: ln.qty, size_id: ln.size_id }));
    if (itemsArr.length === 0) { toast.error(t("customer.empty_cart")); return; }

    // Payment validation (only when the cafeteria has any methods configured)
    if (paymentMethods.length > 0) {
      if (!paymentMethod) { toast.error("اختر طريقة الدفع"); return; }
      if (paymentMethod !== "cash_on_delivery" && !payerWallet.trim()) {
        toast.error("أدخل رقم المحفظة التي حوّلت منها"); return;
      }
    }

    setSending(true);
    let proofUrl: string | null = null;
    try {
      if (proofFile && paymentMethod && paymentMethod !== "cash_on_delivery" && cafe) {
        setUploadingProof(true);
        const ext = proofFile.name.split(".").pop() || "jpg";
        const path = `${cafe.ref_code}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("payment-proofs").upload(path, proofFile, { upsert: false });
        setUploadingProof(false);
        if (upErr) { toast.error("تعذّر رفع إثبات التحويل: " + upErr.message); setSending(false); return; }
        proofUrl = path;
      }

      const rpc = mode === "take_away" ? "place_order_takeaway" : "place_order_delivery";
      const baseArgs: Record<string, unknown> = mode === "take_away"
        ? { _token: token, _customer_name: name, _notes: notes, _items: itemsArr,
            _customer_phone: phoneClean, _customer_address: address || null,
            _customer_lat: lat, _customer_lng: lng }
        : { _token: token, _customer_name: name, _customer_address: address,
            _customer_lat: lat, _customer_lng: lng, _notes: notes, _items: itemsArr,
            _customer_phone: phoneClean };
      const args = {
        ...baseArgs,
        _payment_method: paymentMethod ?? null,
        _payer_wallet_number: paymentMethod && paymentMethod !== "cash_on_delivery" ? payerWallet.trim() : null,
        _payment_proof_url: proofUrl,
      };
      const { data, error } = await supabase.rpc(rpc as never, args as never);
      if (error) {
        const msg = error.message?.includes("CAFETERIA_BLOCKED")
          ? t("customer.error.cafeteria_blocked")
          : error.message;
        toast.error(msg);
        return;
      }
      // Save to localStorage keyed by phone for next visit
      try {
        localStorage.setItem(`cx:${phoneClean}`, JSON.stringify({ name, address, lat, lng }));
        localStorage.setItem("cx:last_phone", phoneClean);
      } catch { /* ignore */ }

      setOrderId(data as string);
      const snapLines = Object.values(cart).map((ln) => ({
        name: ln.size_name ? `${ln.name} — ${ln.size_name}` : ln.name,
        qty: ln.qty,
        price: ln.price,
      }));
      setLastSnapshot({ lines: snapLines, total, address, lat, lng, notes, name });
      setCart({}); setNotes(""); setCartOpen(false);
      setPayerWallet(""); setProofFile(null);
      toast.success(t("customer.order_sent"));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">{t("common.loading")}</div>;
  if (invalid) return <div className="min-h-screen flex items-center justify-center text-muted-foreground p-4 text-center">{t("customer.invalid_qr")}</div>;


  const ModeIcon = mode === "take_away" ? Package : Bike;
  const modeLabel = mode === "take_away" ? t("mode.take_away") : t("mode.delivery");

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/20 to-background pb-32">
      {/* Cover */}
      <div className="relative w-full aspect-[16/9] sm:aspect-[3/1] max-h-[240px] overflow-hidden bg-muted">

        {cafe?.banner_url ? (
          <img src={cafe.banner_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent/30 via-accent/10 to-primary/20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/30 to-transparent" />
        <div className="absolute top-3 end-3"><LanguageSwitcher /></div>
        <div className="absolute bottom-3 inset-x-0 px-4">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground drop-shadow-sm truncate">{cafe?.name}</h1>
          <div className={`mt-1 text-base sm:text-lg font-extrabold ${mode === "take_away" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {mode === "take_away" ? "Take away" : "Delivery"}
          </div>
        </div>
      </div>

      {/* Search + categories */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="container mx-auto px-4 py-2.5">
          <div className="relative">
            <Search className="absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("customer.search.placeholder")} className="ps-9 pe-9 h-10 rounded-full bg-muted/50 border-transparent" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute top-1/2 -translate-y-1/2 end-2 h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        {!search && cats.length > 0 && (
          <div className="overflow-x-auto scrollbar-hide border-t border-border/50">
            <div className="flex gap-2 px-4 py-2 min-w-max">
              {cats.map((c) => {
                const count = items.filter((i) => i.category_id === c.id).length;
                if (count === 0) return null;
                return (
                  <button key={c.id} onClick={() => scrollToCat(c.id)} className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${activeCat === c.id ? "bg-accent text-accent-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
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
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="text-5xl">✅</div>
              <h2 className="text-xl font-bold">{t("customer.order_received")}</h2>
              <div className="bg-muted rounded-2xl p-4 w-full max-w-xs">
                <p className="text-xs text-muted-foreground mb-1">{t("customer.order_number")}</p>
                <p className="text-3xl font-mono font-bold tracking-widest text-accent" dir="ltr">
                  #{orderId.slice(-6).toUpperCase()}
                </p>
              </div>
              <p className="text-sm text-foreground">
                {mode === "take_away"
                  ? t("customer.takeaway.confirmation")
                  : t("customer.delivery.confirmation").replace("{mins}", String(cafe?.estimated_delivery_minutes ?? 30))}
              </p>
              {cafe?.whatsapp && (
                <div className="w-full max-w-xs space-y-2 pt-1">
                  <Button onClick={() => openWhatsApp(false)} className="w-full bg-[#25D366] hover:bg-[#1ebe57] text-white">
                    <MessageCircle className="h-4 w-4 me-2" />{t("customer.wa_send")}
                  </Button>
                  {mode === "delivery" && (
                    <Button onClick={() => openWhatsApp(true)} variant="outline" className="w-full border-[#25D366] text-[#128C7E] hover:bg-[#25D366]/10">
                      <MapPin className="h-4 w-4 me-2" />{t("customer.wa_send_with_location")}
                    </Button>
                  )}
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={() => setOrderId(null)}>{t("customer.new_order")}</Button>
            </div>
          </Card>
        )}

        {!orderId && (
          <>
            {cats.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">{t("customer.no_items")}</p>
            ) : cats.map((c) => {
              const catItems = items
                .filter((it) => it.category_id === c.id)
                .filter((it) => !search.trim() || it.name.toLowerCase().includes(search.toLowerCase()) || (it.description?.toLowerCase().includes(search.toLowerCase()) ?? false));
              if (catItems.length === 0) return null;
              return (
                <section key={c.id} ref={(el) => { sectionRefs.current[c.id] = el; }} className="mb-6">
                  <h2 className="text-lg font-bold mb-3 px-1">{c.name}</h2>
                  <div className="grid gap-3">
                    {catItems.map((it) => {
                      const sz = getSelectedSize(it);
                      const qty = qtyOf(it);
                      const displayPrice = sz ? sz.price : Number(it.price);
                      return (
                        <Card key={it.id} className={`p-3 flex gap-3 transition-all ${qty > 0 ? "ring-2 ring-accent" : ""}`}>
                          <div className="w-20 h-20 rounded-lg bg-muted overflow-hidden shrink-0">
                            {it.image_url ? (
                              <img src={it.image_url} alt={it.name} loading="lazy" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><ImageIcon className="h-6 w-6 text-muted-foreground/40" /></div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm">{it.name}</div>
                            {it.description && <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{it.description}</div>}
                            {it.sizes && it.sizes.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {it.sizes.map((s) => {
                                  const active = (sz?.id ?? "") === s.id;
                                  return (
                                    <button key={s.id} type="button" onClick={() => setSelectedSize((m) => ({ ...m, [it.id]: s.id }))}
                                      className={`text-[11px] px-2 py-0.5 rounded-full border ${active ? "bg-accent text-accent-foreground border-accent" : "border-border bg-muted text-foreground"}`}>
                                      {s.name} · {Number(s.price).toFixed(2)}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {sz?.description && <div className="text-[11px] text-muted-foreground mt-0.5 italic">{sz.description}</div>}
                            <div className="mt-1 flex items-center justify-between">
                              <div className="font-bold text-accent text-sm">
                                {displayPrice.toFixed(2)} <span className="text-[10px] font-normal text-muted-foreground">{cafe?.currency_code}</span>
                              </div>
                              {qty === 0 ? (
                                <Button size="sm" onClick={() => inc(it)} className="h-7 bg-accent text-accent-foreground hover:bg-accent/90">
                                  <Plus className="h-3 w-3" />
                                </Button>
                              ) : (
                                <div className="inline-flex items-center gap-1 rounded-full bg-muted">
                                  <button onClick={() => dec(it)} className="h-7 w-7 inline-flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                                  <span className="text-xs font-bold w-6 text-center">{qty}</span>
                                  <button onClick={() => inc(it)} className="h-7 w-7 inline-flex items-center justify-center bg-accent text-accent-foreground rounded-full"><Plus className="h-3 w-3" /></button>
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>

      {!orderId && itemCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 inset-x-4 z-30 bg-accent text-accent-foreground rounded-2xl shadow-2xl px-4 py-3 flex items-center justify-between hover:bg-accent/90 active:scale-[0.99] transition"
        >
          <div className="flex items-center gap-2">
            <div className="relative"><ShoppingCart className="h-5 w-5" /><span className="absolute -top-2 -end-2 bg-background text-accent text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">{itemCount}</span></div>
            <span className="font-semibold">{t("customer.view_cart")}</span>
          </div>
          <div className="font-bold">{total.toFixed(2)} {cafe?.currency_code}</div>
        </button>
      )}

      {cartOpen && !orderId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end" onClick={() => setCartOpen(false)}>
          <div className="bg-background w-full max-h-[92vh] rounded-t-3xl overflow-y-auto p-4 border-t-2 border-accent/40" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">{t("customer.your_order")}</h2>
              <button onClick={() => setCartOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <ul className="space-y-2 mb-4">
              {Object.entries(cart).map(([key, ln]) => (
                <li key={key} className="flex items-center justify-between gap-2 border-b border-border pb-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {ln.name}{ln.size_name ? <span className="text-muted-foreground"> — {ln.size_name}</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{ln.price.toFixed(2)} × {ln.qty}</div>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-full bg-muted">
                    <button onClick={() => decKey(key)} className="h-7 w-7 inline-flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                    <span className="text-xs font-bold w-6 text-center">{ln.qty}</span>
                    <button onClick={() => incKey(key)} className="h-7 w-7 inline-flex items-center justify-center bg-accent text-accent-foreground rounded-full"><Plus className="h-3 w-3" /></button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="space-y-1 text-sm mb-4 border-t border-border pt-3">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.subtotal")}</span><span>{subtotal.toFixed(2)}</span></div>
              {serviceFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.service_fee")}</span><span>{serviceFee.toFixed(2)}</span></div>}
              {taxFee > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.tax")}</span><span>{taxFee.toFixed(2)}</span></div>}
              {mode === "delivery" && (
                <div className="flex justify-between text-xs text-muted-foreground italic"><span>{t("customer.delivery_fee_pending")}</span><span>—</span></div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t border-border mt-1"><span>{t("customer.total")}</span><span className="text-accent">{total.toFixed(2)} {cafe?.currency_code}</span></div>
            </div>

            {/* Customer info form */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-medium flex items-center gap-1 mb-1"><User className="h-3 w-3" />{t("customer.your_name")} *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("customer.your_name")} />
              </div>

              {mode === "delivery" && (
                <>
                  {addresses.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium">{t("delivery.addresses.saved")}</label>
                      <div className="space-y-1.5">
                        {addresses.map((a) => (
                          <div key={a.id} className={`p-2 rounded-lg border ${selectedAddrId === a.id ? "border-accent bg-accent/5" : "border-border"}`}>
                            <div className="flex items-start gap-2">
                              <button type="button" onClick={() => pickAddress(a)} className="flex-1 text-start text-sm min-w-0">
                                <div className="font-medium truncate flex items-center gap-1">
                                  {a.address}
                                  {a.is_default && <Badge variant="secondary" className="text-[9px] px-1 py-0">{t("delivery.addresses.default")}</Badge>}
                                </div>
                                {a.lat && a.lng && <div className="text-[10px] text-muted-foreground">📍 {a.lat.toFixed(4)}, {a.lng.toFixed(4)}</div>}
                              </button>
                              {!a.is_default && (
                                <button type="button" onClick={() => setDefault(a.id)} title={t("delivery.addresses.set_default")} className="text-muted-foreground hover:text-accent">
                                  <StarOff className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {a.is_default && <Star className="h-3.5 w-3.5 text-accent" />}
                            </div>
                          </div>
                        ))}
                        <Button type="button" variant="outline" size="sm" onClick={startNewAddress} className="w-full">
                          <Plus className="h-3 w-3 me-1" />{t("delivery.addresses.new")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {(selectedAddrId === "new" || addresses.length === 0) && (
                    <>
                      <div>
                        <label className="text-xs font-medium flex items-center gap-1 mb-1"><MapPin className="h-3 w-3" />{t("customer.your_address")} *</label>
                        <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder={t("customer.address_placeholder")} />
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={useMyLocation} className="w-full">
                        <Locate className="h-3 w-3 me-1" />
                        {lat ? t("customer.geo_captured") : t("customer.use_my_location")}
                      </Button>
                    </>
                  )}
                </>
              )}

              <div>
                <label className="text-xs font-medium mb-1 block">{t("customer.order_notes")}</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("customer.notes_placeholder")} />
              </div>
            </div>

            {/* Payment methods */}
            {paymentMethods.length > 0 && (
              <div className="mb-4 space-y-2 rounded-lg border p-3">
                <div className="text-sm font-semibold flex items-center gap-1"><Wallet className="h-4 w-4" /> طريقة الدفع *</div>
                <div className="space-y-1.5">
                  {paymentMethods.map((pm) => {
                    const label = pm.method === "cash_on_delivery" ? "الدفع عند الاستلام"
                      : pm.method === "vodafone_cash" ? "فودافون كاش" : "إنستاباي";
                    return (
                      <button
                        key={pm.method}
                        type="button"
                        onClick={() => setPaymentMethod(pm.method)}
                        className={`w-full text-start p-2 rounded-md border text-sm ${paymentMethod === pm.method ? "border-accent bg-accent/5 font-semibold" : "border-border"}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {paymentMethod && paymentMethod !== "cash_on_delivery" && (() => {
                  const pm = paymentMethods.find((x) => x.method === paymentMethod);
                  const wallet = pm?.wallet_number ?? "";
                  return (
                    <div className="space-y-2 pt-1">
                      {wallet && (
                        <div className="rounded-md border bg-muted/40 p-2 space-y-1">
                          <div className="text-[11px] text-muted-foreground">حوّل إلى:</div>
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-mono text-sm font-bold" dir="ltr">{wallet}</div>
                            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(wallet).then(() => toast.success("تم النسخ"))}>
                              نسخ
                            </Button>
                          </div>
                        </div>
                      )}
                      <div>
                        <label className="text-xs font-medium block mb-1">رقم المحفظة الذي حوّلت منه *</label>
                        <Input value={payerWallet} onChange={(e) => setPayerWallet(e.target.value)} placeholder="01XXXXXXXXX" dir="ltr" />
                      </div>
                      <div>
                        <label className="text-xs font-medium block mb-1">صورة إثبات التحويل (اختياري)</label>
                        <Input type="file" accept="image/*" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} />
                        {proofFile && <div className="text-[11px] text-muted-foreground mt-1 truncate">{proofFile.name}</div>}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <Button onClick={submit} disabled={sending || uploadingProof} className="w-full h-12 bg-accent text-accent-foreground hover:bg-accent/90 text-base font-bold">
              {sending || uploadingProof ? <><Loader2 className="h-4 w-4 me-2 animate-spin" />{uploadingProof ? "جارٍ رفع الإثبات…" : t("common.loading")}</> : <><Check className="h-4 w-4 me-2" />{t("customer.send_order")}</>}
            </Button>
          </div>
        </div>
      )}
      <PlatformPromoBanner />
    </div>
  );
}

function DeliveryAuthGate() {
  const { t } = useI18n();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password.trim()) return;
    setBusy(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
            data: { full_name: fullName },
          },
        });
        if (error) { toast.error(error.message); return; }
        toast.success(t("delivery.auth.signup"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { toast.error(error.message); return; }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-secondary/20 to-background">
      <Card className="p-6 w-full max-w-sm space-y-4">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-accent/15 text-accent flex items-center justify-center mb-2">
            <LogIn className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold">{t("delivery.auth.required")}</h2>
        </div>
        <div className="space-y-2">
          {isSignup && (
            <div>
              <label className="text-xs font-medium">{t("customer.your_name")}</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          )}
          <div>
            <label className="text-xs font-medium">{t("common.email")}</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
          </div>
          <div>
            <label className="text-xs font-medium">{t("common.password")}</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
          </div>
        </div>
        <Button onClick={submit} disabled={busy} className="w-full">
          {busy ? t("common.loading") : (isSignup ? t("delivery.auth.signup") : t("delivery.auth.login"))}
        </Button>
        <button type="button" onClick={() => setIsSignup((v) => !v)} className="text-xs text-muted-foreground hover:text-accent w-full text-center">
          {isSignup ? t("delivery.auth.toggle_login") : t("delivery.auth.toggle_signup")}
        </button>
      </Card>
    </div>
  );
}
