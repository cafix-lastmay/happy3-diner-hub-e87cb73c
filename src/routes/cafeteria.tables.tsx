import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  Wallet,
  History,
  BookOpen,
  QrCode,
  Users,
  ClipboardList,
  Plus,
  Trash2,
  Download,
  Copy,
  Pencil,
  Printer,
  RefreshCw,
  FolderPlus, BarChart3, Tags } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { toast } from "sonner";
import { generateQrPdf, type PerPage, type QrPrintItem } from "@/lib/qr-pdf";

export const Route = createFileRoute("/cafeteria/tables")({ component: () => <CafeTables mode="admin" /> });

interface Section {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  price_tier_id: string | null;
}
interface Tier {
  id: string;
  name: string;
  is_default: boolean;
}
interface Tbl {
  id: string;
  label: string;
  qr_token: string;
  is_active: boolean;
  section_id: string | null;
  qr_top_text: string;
  qr_bottom_text: string;
  qr_text_language: string;
  qr_font_size: number;
}

const safeText = (value: unknown, fallback = "") => typeof value === "string" && value.trim() ? value.trim() : fallback;
const safeNumber = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function CafeTables({ mode = "admin" }: { mode?: "admin" | "manager" }) {
  const { t } = useI18n();
  const { ready } = useRequireRole(mode === "manager" ? "manager" : "cafeteria_admin");
  const { user } = useAuth();
  const [refCode, setRefCode] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [rows, setRows] = useState<Tbl[]>([]);
  const [label, setLabel] = useState("");
  const [newSection, setNewSection] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState<string>("");
  const [filterSectionId, setFilterSectionId] = useState<string>("all");
  const [editing, setEditing] = useState<Tbl | null>(null);
  const [printing, setPrinting] = useState<{ scope: "all" | "section" | "one"; tableId?: string } | null>(null);

  const load = async (rc: string) => {
    const [secRes, tblRes, tierRes] = await Promise.all([
      supabase.from("table_sections").select("*").eq("cafeteria_ref_code", rc).order("sort_order"),
      supabase.from("restaurant_tables").select("*").eq("cafeteria_ref_code", rc).order("created_at"),
      supabase.from("price_tiers").select("id,name,is_default").eq("cafeteria_ref_code", rc).eq("is_active", true).order("sort_order"),
    ]);
    setSections((secRes.data ?? []).filter((s: any) => !!s?.id).map((s: any) => ({ ...s, name: safeText(s.name), sort_order: safeNumber(s.sort_order, 0), is_active: s.is_active === true, price_tier_id: safeText(s.price_tier_id) || null })) as Section[]);
    setRows((tblRes.data ?? []).filter((r: any) => !!r?.id).map((r: any) => ({ ...r, label: safeText(r.label, t("tables.label")), qr_token: safeText(r.qr_token), is_active: r.is_active === true, section_id: safeText(r.section_id) || null, qr_top_text: safeText(r.qr_top_text), qr_bottom_text: safeText(r.qr_bottom_text), qr_text_language: r.qr_text_language === "en" ? "en" : "ar", qr_font_size: safeNumber(r.qr_font_size, 14) })) as Tbl[]);
    setTiers((tierRes.data ?? []).filter((tt: any) => !!tt?.id).map((tt: any) => ({ ...tt, name: safeText(tt.name), is_default: !!tt.is_default })) as Tier[]);
  };

  useEffect(() => {
    if (!ready || !user) return;
    if (mode === "manager") {
      supabase.from("staff").select("cafeteria_ref_code").eq("user_id", user.id).eq("role", "manager").eq("is_active", true).maybeSingle()
        .then(({ data }) => { if (data) { setRefCode(data.cafeteria_ref_code); load(data.cafeteria_ref_code); } });
    } else {
      supabase.from("cafeterias").select("ref_code").eq("user_id", user.id).maybeSingle().then(({ data }) => {
        if (data) { setRefCode(data.ref_code); load(data.ref_code); }
      });
    }
  }, [ready, user, mode]);

  // Realtime sync across tabs/devices
  useEffect(() => {
    if (!refCode) return;
    const ch = supabase
      .channel(`tables-${refCode}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "table_sections", filter: `cafeteria_ref_code=eq.${refCode}` }, () => load(refCode))
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables", filter: `cafeteria_ref_code=eq.${refCode}` }, () => load(refCode))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refCode]);

  const addSection = async () => {
    if (!newSection.trim() || !refCode) return;
    const sortOrder = (sections.at(-1)?.sort_order ?? 0) + 1;
    const { data, error } = await supabase
      .from("table_sections")
      .insert({ cafeteria_ref_code: refCode, name: newSection.trim(), sort_order: sortOrder })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data) setSections((prev) => [...prev, data as Section]);
    setNewSection("");
    toast.success(t("common.success"));
  };

  const delSection = async (id: string) => {
    if (!refCode) return;
    if (!confirm(t("common.confirm"))) return;
    const { error } = await supabase.from("table_sections").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const bindSectionTier = async (sectionId: string, tierId: string | null) => {
    const { error } = await supabase.from("table_sections").update({ price_tier_id: tierId }).eq("id", sectionId);
    if (error) { toast.error(error.message); return; }
    setSections((prev) => prev.map((s) => s.id === sectionId ? { ...s, price_tier_id: tierId } : s));
    toast.success(t("common.success"));
  };

  const addTable = async () => {
    if (!label.trim() || !refCode) return;
    if (sections.length === 0) {
      toast.error(t("tables.sections.none"));
      return;
    }
    if (!selectedSectionId) {
      toast.error(t("tables.sections.required"));
      return;
    }
    const { data, error } = await supabase
      .from("restaurant_tables")
      .insert({
        cafeteria_ref_code: refCode,
        label: label.trim(),
        section_id: selectedSectionId,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data) setRows((prev) => [...prev, data as Tbl]);
    setLabel("");
    toast.success(t("common.success"));
  };

  const delTable = async (id: string) => {
    if (!refCode) return;
    if (!confirm(t("common.confirm"))) return;
    const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const regenerateQr = async (id: string) => {
    if (!confirm(t("common.confirm"))) return;
    const newToken = crypto.randomUUID().replace(/-/g, "");
    const { error } = await supabase
      .from("restaurant_tables")
      .update({ qr_token: newToken, is_active: true })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, qr_token: newToken, is_active: true } : r));
    toast.success(t("common.success"));
  };

  const orderUrl = (token: string) => `${window.location.origin}/m/${token}`;

  const visibleRows = useMemo(() => {
    if (filterSectionId === "all") return rows;
    return rows.filter((r) => r.section_id === filterSectionId);
  }, [rows, filterSectionId]);

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

  const defaultTier = tiers.find((tt) => tt.is_default);
  const tierFor = (sec?: Section | null): Tier | undefined => {
    if (!sec) return undefined;
    if (sec.price_tier_id) return tiers.find((tt) => tt.id === sec.price_tier_id);
    return defaultTier;
  };

  return (
    <DashboardShell title={t("cafeteria.dashboard.title")} navItems={navItems.filter((n) => n.to !== "/cafeteria")} showTrialCard>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("tables.title")}</h1>
        <Button
          variant="outline"
          onClick={() => setPrinting({ scope: filterSectionId === "all" ? "all" : "section" })}
          disabled={rows.length === 0}
        >
          <Printer className="me-2 h-4 w-4" />
          {t("tables.print.title")}
        </Button>
      </div>

      {/* Sections management */}
      <Card className="mb-6 p-4">
        <div className="mb-3 flex items-center gap-2">
          <FolderPlus className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">{t("tables.sections")}</h2>
        </div>
        <div className="mb-3 flex gap-2">
          <Input
            placeholder={t("tables.sections.placeholder")}
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
          />
          <Button onClick={addSection} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-4 w-4" /> {t("tables.sections.add")}
          </Button>
        </div>
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("tables.sections.none")}</p>
        ) : (
          <div className="space-y-2">
            {sections.map((s) => {
              const bound = tierFor(s);
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm"
                >
                  <span className="flex-1 font-medium min-w-[6rem]">{s.name}</span>
                  {bound ? (
                    <Badge variant="secondary" className="gap-1">
                      <Tags className="h-3 w-3" />
                      {bound.name}
                      {!s.price_tier_id && defaultTier && <span className="opacity-60">({t("pricing.default")})</span>}
                    </Badge>
                  ) : tiers.length > 0 ? (
                    <Badge variant="outline" className="text-muted-foreground">{t("pricing.no_default_warning")}</Badge>
                  ) : null}
                  <Select
                    value={s.price_tier_id ?? "__default__"}
                    onValueChange={(v) => bindSectionTier(s.id, v === "__default__" ? null : v)}
                  >
                    <SelectTrigger className="h-8 w-44">
                      <SelectValue placeholder={t("pricing.use_default")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default__">
                        {t("pricing.use_default")}{defaultTier ? ` (${defaultTier.name})` : ""}
                      </SelectItem>
                      {tiers.map((tt) => (
                        <SelectItem key={tt.id} value={tt.id}>
                          {tt.name}{tt.is_default ? " ★" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    onClick={() => delSection(s.id)}
                    className="text-muted-foreground hover:text-destructive p-1"
                    aria-label="delete section"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Add table */}
      <Card className="mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder={t("tables.label_placeholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Select value={selectedSectionId} onValueChange={setSelectedSectionId}>
            <SelectTrigger>
              <SelectValue placeholder={t("tables.section.choose")} />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={addTable} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-4 w-4" /> {t("tables.add")}
          </Button>
        </div>
      </Card>

      {/* Filter by section */}
      {sections.length > 0 && (
        <div className="mb-4 flex items-center gap-3">
          <Label className="text-sm">{t("tables.section")}:</Label>
          <Select value={filterSectionId} onValueChange={setFilterSectionId}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tables.section.all")}</SelectItem>
              {sections.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {visibleRows.length === 0 ? (
        <p className="text-muted-foreground">{t("tables.no_tables")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRows.map((tb) => {
            const sec = sections.find((s) => s.id === tb.section_id);
            const tier = tierFor(sec);
            return (
              <TableCard
                key={tb.id}
                tb={tb}
                sectionName={sec?.name}
                tierName={tier?.name}
                tierIsDefault={!sec?.price_tier_id && !!tier}
                url={tb.qr_token ? orderUrl(tb.qr_token) : ""}
                onDelete={() => delTable(tb.id)}
                onEdit={() => setEditing(tb)}
                onPrintOne={() => setPrinting({ scope: "one", tableId: tb.id })}
                onRegenerate={() => regenerateQr(tb.id)}
                t={t}
              />
            );
          })}
        </div>
      )}

      {editing && (
        <EditQrDialog
          table={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            if (refCode) load(refCode);
          }}
        />
      )}

      {printing && (
        <PrintDialog
          tables={rows}
          sections={sections}
          currentSectionId={filterSectionId === "all" ? null : filterSectionId}
          initialScope={printing.scope}
          singleTableId={printing.tableId}
          onClose={() => setPrinting(null)}
          orderUrl={orderUrl}
        />
      )}
    </DashboardShell>
  );
}

function TableCard({
  tb,
  sectionName,
  tierName,
  tierIsDefault,
  url,
  onDelete,
  onEdit,
  onPrintOne,
  onRegenerate,
  t,
}: {
  tb: Tbl;
  sectionName?: string;
  tierName?: string;
  tierIsDefault?: boolean;
  url: string;
  onDelete: () => void;
  onEdit: () => void;
  onPrintOne: () => void;
  onRegenerate: () => void;
  t: (k: string) => string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const download = () => {
    const canvas = ref.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `qr-${tb.label}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success(t("referral.copied"));
  };
  return (
    <Card className="p-4 text-center">
      <div className="mb-1 font-bold">{tb.label}</div>
      {sectionName && (
        <div className="mb-1 text-xs text-muted-foreground">{sectionName}</div>
      )}
      {tierName && (
        <Badge variant="secondary" className="mb-2 gap-1 text-[10px]">
          <Tags className="h-3 w-3" />
          {tierName}{tierIsDefault ? ` (${t("pricing.default")})` : ""}
        </Badge>
      )}
      {tb.qr_top_text && (
        <div className="mb-1 text-xs text-foreground/80" dir="auto">
          {tb.qr_top_text}
        </div>
      )}
      {url ? (
        <div ref={ref} className="mb-2 flex justify-center rounded bg-white p-3">
          <QRCodeCanvas value={url} size={160} />
        </div>
      ) : (
        <div className="mb-2 rounded border border-dashed border-border p-6 text-xs text-muted-foreground">
          {t("tables.qr.missing")}
        </div>
      )}
      {tb.qr_bottom_text && (
        <div className="mb-2 text-xs text-foreground/80" dir="auto">
          {tb.qr_bottom_text}
        </div>
      )}
      <p className="mb-3 break-all text-xs text-muted-foreground">{url || "—"}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="outline" onClick={copy} aria-label="copy" disabled={!url}>
          <Copy className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="outline" onClick={download} aria-label="download" disabled={!url}>
          <Download className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil className="me-1 h-3 w-3" /> {t("tables.qr.edit")}
        </Button>
        <Button size="sm" variant="outline" onClick={onPrintOne}>
          <Printer className="me-1 h-3 w-3" /> {t("common.print")}
        </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} aria-label="regenerate">
          <RefreshCw className="me-1 h-3 w-3" /> {t("tables.qr.regenerate")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label="delete">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
}

function EditQrDialog({
  table,
  onClose,
  onSaved,
}: {
  table: Tbl;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [topText, setTopText] = useState(table.qr_top_text ?? "");
  const [bottomText, setBottomText] = useState(table.qr_bottom_text ?? "");
  const [fontSize, setFontSize] = useState<number>(table.qr_font_size ?? 14);
  const [language, setLanguage] = useState<string>(table.qr_text_language ?? "ar");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("restaurant_tables")
      .update({
        qr_top_text: topText.trim() || null,
        qr_bottom_text: bottomText.trim() || null,
        qr_font_size: fontSize,
        qr_text_language: language,
      })
      .eq("id", table.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common.success"));
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("tables.qr.edit")} — {table.label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("tables.qr.top_text")}</Label>
            <Input value={topText} onChange={(e) => setTopText(e.target.value)} dir="auto" />
          </div>
          <div className="space-y-2">
            <Label>{t("tables.qr.bottom_text")}</Label>
            <Input value={bottomText} onChange={(e) => setBottomText(e.target.value)} dir="auto" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t("tables.qr.font_size")}</Label>
              <Input
                type="number"
                min={8}
                max={32}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value) || 14)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("tables.qr.text_language")}</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? t("common.loading") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrintDialog({
  tables,
  sections,
  currentSectionId,
  initialScope,
  singleTableId,
  onClose,
  orderUrl,
}: {
  tables: Tbl[];
  sections: Section[];
  currentSectionId: string | null;
  initialScope: "all" | "section" | "one";
  singleTableId?: string;
  onClose: () => void;
  orderUrl: (token: string) => string;
}) {
  const { t } = useI18n();
  const [perPage, setPerPage] = useState<PerPage>(2);
  const [scope, setScope] = useState<"all" | "section" | "one">(initialScope);
  const [generating, setGenerating] = useState(false);
  const hiddenRef = useRef<HTMLDivElement>(null);

  const targetTables = useMemo(() => {
    if (scope === "one" && singleTableId) return tables.filter((t) => t.id === singleTableId);
    if (scope === "section" && currentSectionId)
      return tables.filter((t) => t.section_id === currentSectionId);
    return tables;
  }, [scope, tables, currentSectionId, singleTableId]);

  const generate = async () => {
    if (targetTables.length === 0) {
      toast.error(t("tables.no_tables"));
      return;
    }
    setGenerating(true);
    // Render each QR to canvas in hidden DOM, then read data URLs
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const canvases = hiddenRef.current?.querySelectorAll("canvas") ?? [];
    const dataUrls: string[] = [];
    canvases.forEach((c) => dataUrls.push((c as HTMLCanvasElement).toDataURL("image/png")));
    const items: QrPrintItem[] = targetTables.map((tb) => ({
      label: tb.label,
      url: orderUrl(safeQrToken(tb)),
      topText: tb.qr_top_text,
      bottomText: tb.qr_bottom_text,
      fontSize: tb.qr_font_size,
      language: tb.qr_text_language,
    }));
    try {
      const doc = await generateQrPdf(items, perPage, dataUrls);
      doc.save(`qr-codes-${perPage}-per-page.pdf`);
      toast.success(t("common.success"));
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("tables.print.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t("tables.print.scope")}</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "all" | "section" | "one")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("tables.print.scope.all")}</SelectItem>
                {currentSectionId && (
                  <SelectItem value="section">{t("tables.print.scope.section")}</SelectItem>
                )}
                {singleTableId && (
                  <SelectItem value="one">{t("tables.print.scope.one")}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("tables.print.layout")}</Label>
            <Select value={String(perPage)} onValueChange={(v) => setPerPage(Number(v) as PerPage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="2">2</SelectItem>
                <SelectItem value="4">4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {targetTables.length} × QR
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={generate}
            disabled={generating}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {generating ? t("common.loading") : t("tables.print.generate")}
          </Button>
        </DialogFooter>

        {/* Hidden canvases used to capture QR data URLs */}
        <div ref={hiddenRef} className="absolute -left-[9999px] top-0">
          {targetTables.map((tb) => (
            <QRCodeCanvas key={tb.id} value={orderUrl(safeQrToken(tb))} size={512} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
