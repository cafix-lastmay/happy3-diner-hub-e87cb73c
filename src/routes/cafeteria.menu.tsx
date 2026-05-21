import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Wallet, History, BookOpen, QrCode, Users, ClipboardList, Plus, Trash2, Pencil, ImageIcon, X, Loader2, BarChart3, Star, ArrowUp, ArrowDown, Upload, Tags, Copy, Eye, EyeOff, Utensils, ShoppingBag, Bike } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";
import { processMenuImage, validateImageFile } from "@/lib/image-utils";

export const Route = createFileRoute("/cafeteria/menu")({ component: () => <CafeMenu mode="admin" /> });

type ModeKey = "dine_in" | "take_away" | "delivery";

interface Cat { id: string; name: string; sort_order: number; is_active: boolean }
interface Item { id: string; category_id: string | null; name: string; description: string | null; price: number; image_url: string | null; is_available: boolean; is_most_popular: boolean; sort_order: number }
interface Tier { id: string; name: string; is_default: boolean }
interface ItemPrice { item_id: string; tier_id: string; price: number }
interface ModeOverride { item_id: string; mode: ModeKey; name: string | null; description: string | null; image_url: string | null; price: number | null; is_visible: boolean }
interface CatVis { category_id: string; mode: ModeKey; is_visible: boolean }
interface CafeModes { mode_dine_in: boolean; mode_takeaway: boolean; mode_delivery: boolean; delivery_fee_a_name: string | null; delivery_fee_a_amount: number; delivery_fee_b_name: string | null; delivery_fee_b_amount: number; delivery_fee_c_name: string | null; delivery_fee_c_amount: number; estimated_delivery_minutes: number; currency_code: string | null }

export function CafeMenu({ mode = "admin" }: { mode?: "admin" | "manager" }) {
  const { t } = useI18n();
  const { ready } = useRequireRole(mode === "manager" ? "manager" : "cafeteria_admin");
  const { user } = useAuth();
  const [refCode, setRefCode] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [catName, setCatName] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [itemPrices, setItemPrices] = useState<ItemPrice[]>([]);
  const [overrides, setOverrides] = useState<ModeOverride[]>([]);
  const [catVis, setCatVis] = useState<CatVis[]>([]);
  const [cafeModes, setCafeModes] = useState<CafeModes | null>(null);
  const [modeTab, setModeTab] = useState<ModeKey>("dine_in");
  const [tierOverrides, setTierOverrides] = useState<Record<string, string>>({});
  const [itemDialog, setItemDialog] = useState<{ open: boolean; editing?: Item; categoryId?: string }>({ open: false });
  const [form, setForm] = useState({ name: "", description: "", price: "0", category_id: "", is_available: true, is_most_popular: false, image_url: "" });
  const [pendingBlob, setPendingBlob] = useState<{ blob: Blob; ext: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [imgState, setImgState] = useState<"idle" | "processing" | "ready">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);

  const isDineIn = modeTab === "dine_in";

  const load = async (rc: string) => {
    const [{ data: c }, { data: i }, { data: tiersData }, { data: ovr }, { data: cv }] = await Promise.all([
      supabase.from("menu_categories").select("*").eq("cafeteria_ref_code", rc).order("sort_order").order("name"),
      supabase.from("menu_items").select("*").eq("cafeteria_ref_code", rc).order("sort_order").order("name"),
      supabase.from("price_tiers").select("id,name,is_default").eq("cafeteria_ref_code", rc).eq("is_active", true).order("sort_order"),
      supabase.from("menu_mode_overrides").select("item_id,mode,name,description,image_url,price,is_visible"),
      supabase.from("category_mode_visibility").select("category_id,mode,is_visible"),
    ]);
    setCats((c ?? []) as Cat[]);
    setItems((i ?? []) as Item[]);
    setTiers((tiersData ?? []) as Tier[]);
    setOverrides((ovr ?? []) as ModeOverride[]);
    setCatVis((cv ?? []) as CatVis[]);
    const itemIds = (i ?? []).map((x: { id: string }) => x.id);
    if (itemIds.length > 0) {
      const { data: prices } = await supabase.from("menu_item_prices").select("item_id,tier_id,price").in("item_id", itemIds);
      setItemPrices((prices ?? []) as ItemPrice[]);
    } else {
      setItemPrices([]);
    }
  };

  useEffect(() => {
    if (!ready || !user) return;
    if (mode === "manager") {
      supabase.from("staff").select("cafeteria_ref_code").eq("user_id", user.id).eq("role", "manager").eq("is_active", true).maybeSingle()
        .then(({ data }) => {
          if (data) {
            setRefCode(data.cafeteria_ref_code);
            load(data.cafeteria_ref_code);
            supabase.from("cafeterias").select("banner_url,mode_dine_in,mode_takeaway,mode_delivery,delivery_fee_a_name,delivery_fee_a_amount,delivery_fee_b_name,delivery_fee_b_amount,delivery_fee_c_name,delivery_fee_c_amount,estimated_delivery_minutes,currency_code").eq("ref_code", data.cafeteria_ref_code).maybeSingle()
              .then(({ data: c }) => { if (c) { setBannerUrl(c.banner_url ?? null); setCafeModes(c as CafeModes); } });
          }
        });
    } else {
      supabase.from("cafeterias").select("ref_code,banner_url,mode_dine_in,mode_takeaway,mode_delivery,delivery_fee_a_name,delivery_fee_a_amount,delivery_fee_b_name,delivery_fee_b_amount,delivery_fee_c_name,delivery_fee_c_amount,estimated_delivery_minutes,currency_code").eq("user_id", user.id).maybeSingle().then(({ data }) => {
        if (data) {
          setRefCode(data.ref_code);
          setBannerUrl(data.banner_url ?? null);
          setCafeModes(data as CafeModes);
          load(data.ref_code);
        }
      });
    }
  }, [ready, user, mode]);

  useEffect(() => {
    if (!refCode) return;
    const ch = supabase
      .channel(`menu-${refCode}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_categories", filter: `cafeteria_ref_code=eq.${refCode}` }, () => load(refCode))
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items", filter: `cafeteria_ref_code=eq.${refCode}` }, () => load(refCode))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refCode]);

  // ===== mode helpers =====
  const getOverride = (itemId: string): ModeOverride | undefined =>
    overrides.find((o) => o.item_id === itemId && o.mode === modeTab);
  const effective = (it: Item) => {
    if (isDineIn) return { name: it.name, description: it.description, image_url: it.image_url, price: it.price, is_visible: it.is_available };
    const o = getOverride(it.id);
    return {
      name: o?.name ?? it.name,
      description: o?.description ?? it.description,
      image_url: o?.image_url ?? it.image_url,
      price: o?.price ?? it.price,
      is_visible: o ? o.is_visible : true,
    };
  };
  const isCategoryVisible = (catId: string) => {
    if (isDineIn) return true;
    const v = catVis.find((x) => x.category_id === catId && x.mode === modeTab);
    return v ? v.is_visible : true;
  };
  const toggleCategoryVisibility = async (catId: string) => {
    const current = isCategoryVisible(catId);
    const next = !current;
    const { error } = await supabase.from("category_mode_visibility")
      .upsert({ category_id: catId, mode: modeTab, is_visible: next }, { onConflict: "category_id,mode" });
    if (error) { toast.error(error.message); return; }
    setCatVis((prev) => {
      const idx = prev.findIndex((x) => x.category_id === catId && x.mode === modeTab);
      if (idx >= 0) { const next2 = [...prev]; next2[idx] = { ...next2[idx], is_visible: next }; return next2; }
      return [...prev, { category_id: catId, mode: modeTab, is_visible: next }];
    });
  };

  const copyFromDineIn = async () => {
    if (!refCode || isDineIn) return;
    if (!confirm(t("menu.mode.copy_confirm"))) return;
    setCopying(true);
    const { error } = await supabase.rpc("copy_menu_to_mode", { _mode: modeTab });
    setCopying(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
    load(refCode);
  };

  // === Banner image (cover) management ===
  const onBannerSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !refCode) return;
    if (file.size > 4 * 1024 * 1024) { toast.error("Max 4MB"); return; }
    setBannerBusy(true);
    try {
      const processed = await processMenuImage(file, 1600, 0.85);
      const path = `${refCode}/banner-${Date.now()}.${processed.ext}`;
      const { error: upErr } = await supabase.storage.from("cafeteria-logos").upload(path, processed.blob, { upsert: true, contentType: processed.blob.type, cacheControl: "31536000" });
      if (upErr) { toast.error(upErr.message); return; }
      const { data: pub } = supabase.storage.from("cafeteria-logos").getPublicUrl(path);
      const { error: updErr } = await supabase.from("cafeterias").update({ banner_url: pub.publicUrl }).eq("ref_code", refCode);
      if (updErr) { toast.error(updErr.message); return; }
      setBannerUrl(pub.publicUrl);
      toast.success(t("common.success"));
    } catch (err) {
      console.error(err);
      toast.error(t("menu.image_failed"));
    } finally {
      setBannerBusy(false);
    }
  };
  const removeBanner = async () => {
    if (!refCode) return;
    const { error } = await supabase.from("cafeterias").update({ banner_url: null }).eq("ref_code", refCode);
    if (error) { toast.error(error.message); return; }
    setBannerUrl(null);
  };

  // === Categories ===
  const addCategory = async () => {
    if (!catName.trim() || !refCode) return;
    const { data, error } = await supabase
      .from("menu_categories")
      .insert({ cafeteria_ref_code: refCode, name: catName.trim(), sort_order: cats.length })
      .select().single();
    if (error) { toast.error(error.message); return; }
    if (data) setCats((prev) => [...prev, data as Cat]);
    setCatName("");
    toast.success(t("common.success"));
  };
  const deleteCategory = async (id: string) => {
    if (!refCode) return;
    if (!confirm(t("common.confirm"))) return;
    const { error } = await supabase.from("menu_categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setCats((prev) => prev.filter((c) => c.id !== id));
  };
  const moveCategory = async (id: string, dir: -1 | 1) => {
    const idx = cats.findIndex((c) => c.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= cats.length) return;
    const a = cats[idx], b = cats[swap];
    const next = [...cats];
    next[idx] = { ...a, sort_order: b.sort_order };
    next[swap] = { ...b, sort_order: a.sort_order };
    next.sort((x, y) => x.sort_order - y.sort_order);
    setCats(next);
    await Promise.all([
      supabase.from("menu_categories").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("menu_categories").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
  };

  // === Item dialog & image ===
  const resetImageState = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setPendingBlob(null);
    setImgState("idle");
    setUploadProgress(0);
  };

  const openNewItem = (categoryId?: string) => {
    // adding new items is only allowed in dine_in (base menu)
    if (!isDineIn) return;
    setForm({ name: "", description: "", price: "0", category_id: categoryId ?? "", is_available: true, is_most_popular: false, image_url: "" });
    setTierOverrides({});
    resetImageState();
    setItemDialog({ open: true, categoryId });
  };
  const openEditItem = (it: Item) => {
    if (isDineIn) {
      setForm({ name: it.name, description: it.description ?? "", price: String(it.price), category_id: it.category_id ?? "", is_available: it.is_available, is_most_popular: !!it.is_most_popular, image_url: it.image_url ?? "" });
      const ov: Record<string, string> = {};
      itemPrices.filter((p) => p.item_id === it.id).forEach((p) => { ov[p.tier_id] = String(p.price); });
      setTierOverrides(ov);
    } else {
      const o = getOverride(it.id);
      setForm({
        name: o?.name ?? it.name,
        description: o?.description ?? it.description ?? "",
        price: String(o?.price ?? it.price),
        category_id: it.category_id ?? "",
        is_available: o ? o.is_visible : true,
        is_most_popular: !!it.is_most_popular,
        image_url: o?.image_url ?? it.image_url ?? "",
      });
      setTierOverrides({});
    }
    resetImageState();
    setItemDialog({ open: true, editing: it });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const validation = validateImageFile(f);
    if (validation === "unsupported_type") { toast.error(t("menu.image_unsupported")); return; }
    if (validation === "file_too_large") { toast.error(t("menu.image_too_large")); return; }
    setImgState("processing");
    try {
      const processed = await processMenuImage(f, 1200, 0.82);
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(processed.blob);
      setPreviewUrl(url);
      setPendingBlob({ blob: processed.blob, ext: processed.ext });
      setImgState("ready");
    } catch (err) {
      console.error("Image processing failed", err);
      toast.error(t("menu.image_failed"));
      setImgState("idle");
    }
  };

  const removeImage = () => {
    resetImageState();
    setForm((f) => ({ ...f, image_url: "" }));
  };

  const saveItem = async () => {
    if (!refCode || !user) return;
    if (!form.name.trim()) { toast.error(t("error.required_field")); return; }
    setBusy(true);
    let image_url: string | null = form.image_url || null;
    if (pendingBlob) {
      try {
        setUploadProgress(20);
        const safeName = `${crypto.randomUUID()}.${pendingBlob.ext}`;
        const path = `${user.id}/${safeName}`;
        setUploadProgress(50);
        const { error: upErr } = await supabase.storage
          .from("menu-images")
          .upload(path, pendingBlob.blob, { upsert: true, contentType: pendingBlob.blob.type || "image/webp", cacheControl: "31536000" });
        if (upErr) { setBusy(false); setUploadProgress(0); toast.error(t("menu.image_failed")); return; }
        setUploadProgress(85);
        const { data: pub } = supabase.storage.from("menu-images").getPublicUrl(path);
        image_url = pub.publicUrl;
        setUploadProgress(100);
      } catch (err) {
        console.error("Upload failed", err);
        setBusy(false); setUploadProgress(0);
        toast.error(t("menu.image_failed"));
        return;
      }
    }

    if (isDineIn) {
      // Base menu edit
      const payload = {
        cafeteria_ref_code: refCode,
        category_id: form.category_id || null,
        name: form.name.trim(),
        description: form.description || null,
        price: Number(form.price) || 0,
        image_url,
        is_available: form.is_available,
        is_most_popular: form.is_most_popular,
      };
      let error;
      let savedId: string | null = itemDialog.editing?.id ?? null;
      if (itemDialog.editing) {
        ({ error } = await supabase.from("menu_items").update(payload).eq("id", itemDialog.editing.id));
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("menu_items").insert({ ...payload, sort_order: items.length }).select("id").single();
        error = insErr;
        savedId = inserted?.id ?? null;
      }
      if (error) { setBusy(false); toast.error(error.message); return; }

      if (savedId) {
        const ops: Promise<unknown>[] = [];
        const toDelete: string[] = [];
        for (const tt of tiers) {
          const raw = (tierOverrides[tt.id] ?? "").trim();
          if (raw === "") toDelete.push(tt.id);
          else {
            const p = Number(raw);
            if (!isNaN(p) && p >= 0) {
              ops.push(Promise.resolve(supabase.from("menu_item_prices")
                .upsert({ item_id: savedId, tier_id: tt.id, price: p }, { onConflict: "item_id,tier_id" })));
            }
          }
        }
        if (toDelete.length > 0) {
          ops.push(Promise.resolve(supabase.from("menu_item_prices").delete()
            .eq("item_id", savedId).in("tier_id", toDelete)));
        }
        await Promise.all(ops);
      }
    } else {
      // Per-mode override edit. Only existing items can be overridden.
      if (!itemDialog.editing) { setBusy(false); return; }
      const base = itemDialog.editing;
      const ovrPayload = {
        item_id: base.id,
        mode: modeTab,
        // Only persist override when value diverges from base; otherwise NULL to inherit.
        name: form.name.trim() === base.name ? null : form.name.trim(),
        description: (form.description || null) === (base.description || null) ? null : (form.description || null),
        image_url: image_url === (base.image_url || null) ? null : image_url,
        price: Number(form.price) === Number(base.price) ? null : (Number(form.price) || 0),
        is_visible: form.is_available, // re-used switch as visibility for non-dine_in
      };
      const { error } = await supabase.from("menu_mode_overrides")
        .upsert(ovrPayload, { onConflict: "item_id,mode" });
      if (error) { setBusy(false); toast.error(error.message); return; }
    }

    setBusy(false);
    resetImageState();
    setItemDialog({ open: false });
    load(refCode);
  };

  const togglePopular = async (it: Item) => {
    if (!isDineIn) return;
    const next = !it.is_most_popular;
    setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, is_most_popular: next } : x));
    const { error } = await supabase.from("menu_items").update({ is_most_popular: next }).eq("id", it.id);
    if (error) {
      setItems((prev) => prev.map((x) => x.id === it.id ? { ...x, is_most_popular: !next } : x));
      toast.error(error.message);
    }
  };

  const deleteItem = async (id: string) => {
    if (!refCode || !isDineIn) return;
    if (!confirm(t("common.confirm"))) return;
    const { error } = await supabase.from("menu_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    load(refCode);
  };

  const toggleItemVisibility = async (it: Item) => {
    if (isDineIn) return;
    const o = getOverride(it.id);
    const next = !(o ? o.is_visible : true);
    const { error } = await supabase.from("menu_mode_overrides")
      .upsert({ item_id: it.id, mode: modeTab, is_visible: next }, { onConflict: "item_id,mode" });
    if (error) { toast.error(error.message); return; }
    load(refCode!);
  };

  if (!ready) return null;
  const navItems = mode === "manager" ? [
    { to: "/manager", label: t("orders.title"), icon: ClipboardList },
    { to: "/manager/menu", label: t("cafeteria.nav.menu"), icon: BookOpen },
    { to: "/manager/tables", label: t("cafeteria.nav.tables"), icon: QrCode },
    { to: "/manager/staff", label: t("cafeteria.nav.staff"), icon: Users },
  ] : [
    { to: "/cafeteria", label: t("common.dashboard"), icon: LayoutDashboard },
    { to: "/cafeteria/menu", label: t("cafeteria.nav.menu"), icon: BookOpen },
    { to: "/cafeteria/pricing", label: t("pricing.nav"), icon: Tags },
    { to: "/cafeteria/tables", label: t("cafeteria.nav.tables"), icon: QrCode },
    { to: "/cafeteria/staff", label: t("cafeteria.nav.staff"), icon: Users },
    { to: "/cafeteria/orders", label: t("cafeteria.nav.orders"), icon: ClipboardList },
    { to: "/cafeteria/reports", label: t("cafeteria.nav.reports"), icon: BarChart3 },
    { to: "/cafeteria/recharge", label: t("cafeteria.nav.recharge"), icon: Wallet },
    { to: "/cafeteria/history", label: t("cafeteria.nav.history"), icon: History },
  ];

  const popularCount = items.filter((i) => i.is_most_popular).length;

  // Tabs visible based on enabled modes (dine_in always shown as base)
  const enabledModes: { key: ModeKey; label: string; icon: typeof Utensils }[] = [
    { key: "dine_in", label: t("mode.dine_in"), icon: Utensils },
    ...(cafeModes?.mode_takeaway ? [{ key: "take_away" as const, label: t("mode.take_away"), icon: ShoppingBag }] : []),
    ...(cafeModes?.mode_delivery ? [{ key: "delivery" as const, label: t("mode.delivery"), icon: Bike }] : []),
  ];

  const overridesForMode = overrides.filter((o) => o.mode === modeTab);
  const modeHasNoCustomization = !isDineIn && overridesForMode.length === 0;

  return (
    <DashboardShell title={t("cafeteria.dashboard.title")} navItems={navItems.filter((n) => n.to !== "/cafeteria")} showTrialCard>
      <h1 className="text-2xl font-bold mb-4">{t("menu.title")}</h1>

      {/* Mode tabs */}
      {enabledModes.length > 1 && (
        <Tabs value={modeTab} onValueChange={(v) => setModeTab(v as ModeKey)} className="mb-4">
          <TabsList>
            {enabledModes.map((m) => (
              <TabsTrigger key={m.key} value={m.key}>
                <m.icon className="h-4 w-4 me-1" /> {m.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Per-mode hint + copy button + delivery fee summary */}
      {!isDineIn && (
        <Card className="p-4 mb-6 border-accent/40">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className="font-semibold mb-1">{t("menu.mode.editing_title")}</h3>
              <p className="text-xs text-muted-foreground">{t("menu.mode.editing_hint")}</p>
            </div>
            <Button size="sm" variant="outline" onClick={copyFromDineIn} disabled={copying}>
              {copying ? <Loader2 className="h-3 w-3 animate-spin me-1" /> : <Copy className="h-3 w-3 me-1" />}
              {t("menu.mode.copy_from_dine_in")}
            </Button>
          </div>
          {modeHasNoCustomization && (
            <p className="mt-3 text-xs text-muted-foreground rounded-md border border-dashed border-border p-2">
              {t("menu.mode.empty_hint")}
            </p>
          )}
          {modeTab === "delivery" && cafeModes && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              {[
                { name: cafeModes.delivery_fee_a_name, amount: cafeModes.delivery_fee_a_amount, key: "A" },
                { name: cafeModes.delivery_fee_b_name, amount: cafeModes.delivery_fee_b_amount, key: "B" },
                { name: cafeModes.delivery_fee_c_name, amount: cafeModes.delivery_fee_c_amount, key: "C" },
              ].map((f) => (
                <div key={f.key} className="rounded-md border border-border p-2">
                  <div className="text-muted-foreground">{t("settings.fee_level")} {f.key}</div>
                  <div className="font-semibold truncate">{f.name || "—"}</div>
                  <div className="text-accent">{Number(f.amount).toFixed(2)} {cafeModes.currency_code ?? ""}</div>
                </div>
              ))}
              <div className="sm:col-span-3 text-muted-foreground">
                {t("settings.estimated_delivery_minutes")}: <span className="font-semibold text-foreground">{cafeModes.estimated_delivery_minutes}</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* === Cafeteria cover banner (only on dine-in tab) === */}
      {isDineIn && (
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold">{t("menu.cover_banner.title")}</h2>
              <p className="text-xs text-muted-foreground">{t("menu.cover_banner.hint")}</p>
            </div>
            {bannerUrl && (
              <Button size="sm" variant="ghost" onClick={removeBanner}>
                <X className="h-3 w-3" /> {t("menu.image_remove")}
              </Button>
            )}
          </div>
          <div className="relative rounded-xl overflow-hidden border border-border bg-muted aspect-[3/1] max-h-48">
            {bannerUrl ? (
              <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
                <ImageIcon className="h-8 w-8 me-2" /> {t("menu.cover_banner.empty")}
              </div>
            )}
          </div>
          <div className="mt-3">
            <input id="banner-input" type="file" accept="image/*" className="hidden" onChange={onBannerSelected} disabled={bannerBusy} />
            <Button type="button" variant="outline" disabled={bannerBusy} onClick={() => document.getElementById("banner-input")?.click()}>
              {bannerBusy ? <Loader2 className="h-4 w-4 animate-spin me-1" /> : <Upload className="h-4 w-4 me-1" />}
              {bannerBusy ? t("common.loading") : (bannerUrl ? t("menu.cover_banner.replace") : t("menu.cover_banner.upload"))}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">PNG/JPG · Max 4MB · 3:1</p>
          </div>
        </Card>
      )}

      {/* Add category (dine-in only — base menu structure) */}
      {isDineIn && (
        <Card className="p-4 mb-6">
          <div className="flex gap-2">
            <Input placeholder={t("menu.category_name")} value={catName} onChange={(e) => setCatName(e.target.value)} />
            <Button onClick={addCategory} className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="h-4 w-4" /> {t("menu.add_category")}</Button>
          </div>
        </Card>
      )}

      {popularCount > 0 && isDineIn && (
        <div className="mb-4 text-sm text-muted-foreground flex items-center gap-1">
          <Star className="h-4 w-4 text-accent fill-accent" />
          {t("menu.popular_count")}: <span className="font-semibold text-foreground">{popularCount}</span>
        </div>
      )}

      {cats.length === 0 && <p className="text-muted-foreground">{t("menu.no_categories")}</p>}

      <div className="space-y-6">
        {cats.map((c, idx) => {
          const catItems = items.filter((i) => i.category_id === c.id);
          const catVisible = isCategoryVisible(c.id);
          return (
            <Card key={c.id} className={`p-4 ${!catVisible ? "opacity-60" : ""}`}>
              <div className="flex items-center justify-between mb-4 gap-2">
                <h2 className="text-lg font-bold flex items-center gap-2 min-w-0">
                  <span className="truncate">{c.name}</span>
                  <Badge variant="secondary">{catItems.length}</Badge>
                  {!isDineIn && !catVisible && <Badge variant="outline" className="text-[10px]">{t("menu.hidden")}</Badge>}
                </h2>
                <div className="flex gap-1 shrink-0">
                  {isDineIn ? (
                    <>
                      <Button size="sm" variant="ghost" disabled={idx === 0} onClick={() => moveCategory(c.id, -1)} title={t("menu.move_up")}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" disabled={idx === cats.length - 1} onClick={() => moveCategory(c.id, 1)} title={t("menu.move_down")}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openNewItem(c.id)}><Plus className="h-3 w-3" /> {t("menu.add_item")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteCategory(c.id)}><Trash2 className="h-3 w-3" /></Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => toggleCategoryVisibility(c.id)} title={catVisible ? t("menu.hide") : t("menu.show")}>
                      {catVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
              </div>
              {catItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("menu.no_items")}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {catItems.map((it) => {
                    const eff = effective(it);
                    return (
                      <div key={it.id} className={`flex gap-3 rounded-lg border border-border p-3 relative ${!eff.is_visible ? "opacity-50" : ""}`}>
                        {eff.image_url && <img src={eff.image_url} alt={eff.name} className="h-16 w-16 rounded object-cover" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium truncate flex items-center gap-1">
                              {it.is_most_popular && <Star className="h-3 w-3 text-accent fill-accent shrink-0" />}
                              <span className="truncate">{eff.name}</span>
                            </div>
                            <div className="font-bold text-accent whitespace-nowrap">{Number(eff.price).toFixed(2)}</div>
                          </div>
                          {eff.description && <p className="text-xs text-muted-foreground line-clamp-2">{eff.description}</p>}
                          <div className="mt-2 flex flex-wrap gap-1 items-center">
                            <Badge variant={eff.is_visible ? "default" : "secondary"} className="text-[10px]">
                              {eff.is_visible ? t("menu.available") : t("menu.unavailable")}
                            </Badge>
                            {isDineIn && (
                              <Button size="sm" variant="ghost" className={`h-6 px-2 ${it.is_most_popular ? "text-accent" : ""}`} onClick={() => togglePopular(it)} title={t("menu.most_popular")}>
                                <Star className={`h-3 w-3 ${it.is_most_popular ? "fill-accent" : ""}`} />
                              </Button>
                            )}
                            {!isDineIn && (
                              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => toggleItemVisibility(it)} title={eff.is_visible ? t("menu.hide") : t("menu.show")}>
                                {eff.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => openEditItem(it)}><Pencil className="h-3 w-3" /></Button>
                            {isDineIn && <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => deleteItem(it.id)}><Trash2 className="h-3 w-3" /></Button>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={itemDialog.open} onOpenChange={(o) => { if (!o && !busy) { resetImageState(); setItemDialog({ open: false }); } else if (o) setItemDialog({ ...itemDialog, open: true }); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {itemDialog.editing ? t("common.edit") : t("menu.add_item")}
              {!isDineIn && <span className="ms-2 text-xs text-muted-foreground">· {enabledModes.find((m) => m.key === modeTab)?.label}</span>}
            </DialogTitle>
            <DialogDescription>{isDineIn ? t("menu.image_hint") : t("menu.mode.dialog_hint")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("menu.item_name")} *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>{t("menu.item_desc")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("menu.item_price")} *{isDineIn && <span className="text-xs text-muted-foreground"> ({t("pricing.base_price")})</span>}</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              {isDineIn && (
                <div>
                  <Label>{t("menu.item_category")}</Label>
                  <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("menu.item_image")}</Label>
              {(previewUrl || form.image_url) ? (
                <div className="relative inline-block">
                  <img src={previewUrl || form.image_url} alt="" className="h-28 w-28 rounded-lg object-cover border border-border" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  <button type="button" onClick={removeImage} aria-label={t("menu.image_remove")} className="absolute -top-2 -end-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-28 w-28 rounded-lg border-2 border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors">
                  {imgState === "processing" ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <ImageIcon className="h-6 w-6 text-muted-foreground" />}
                  <span className="text-[10px] text-muted-foreground mt-1">{imgState === "processing" ? t("menu.image_processing") : "JPG/PNG/WEBP"}</span>
                  <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleFileChange} disabled={imgState === "processing" || busy} />
                </label>
              )}
              {imgState === "processing" && (
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {t("menu.image_processing")}</p>
              )}
              {busy && uploadProgress > 0 && (
                <div className="space-y-1">
                  <Progress value={uploadProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">{t("menu.image_uploading")}</p>
                </div>
              )}
            </div>
            {isDineIn && (
              <div className="flex items-center justify-between rounded-md border border-border p-2">
                <Label className="flex items-center gap-2 m-0">
                  <Star className={`h-4 w-4 ${form.is_most_popular ? "text-accent fill-accent" : "text-muted-foreground"}`} />
                  {t("menu.most_popular")}
                </Label>
                <Switch checked={form.is_most_popular} onCheckedChange={(v) => setForm({ ...form, is_most_popular: v })} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={form.is_available} onCheckedChange={(v) => setForm({ ...form, is_available: v })} />
              <Label>{isDineIn ? t("menu.available") : t("menu.visible_in_mode")}</Label>
            </div>

            {isDineIn && tiers.length > 0 && (
              <div className="rounded-md border border-border p-3 space-y-2">
                <Label className="flex items-center gap-2 m-0"><Tags className="h-4 w-4" /> {t("pricing.alt_prices")}</Label>
                <p className="text-xs text-muted-foreground">{t("pricing.alt_prices.hint")}</p>
                {tiers.map((tt) => (
                  <div key={tt.id} className="flex items-center gap-2">
                    <span className="text-sm flex-1 truncate flex items-center gap-1">
                      {tt.is_default && <Star className="h-3 w-3 text-accent fill-accent" />}
                      {tt.name}
                    </span>
                    <Input type="number" step="0.01" inputMode="decimal" placeholder={t("pricing.use_base")}
                      value={tierOverrides[tt.id] ?? ""}
                      onChange={(e) => setTierOverrides({ ...tierOverrides, [tt.id]: e.target.value })}
                      className="w-28" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { if (!busy) { resetImageState(); setItemDialog({ open: false }); } }} disabled={busy}>{t("common.cancel")}</Button>
            <Button onClick={saveItem} disabled={busy || imgState === "processing"} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {busy ? <><Loader2 className="h-3 w-3 animate-spin me-1" /> {t("common.loading")}</> : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}
