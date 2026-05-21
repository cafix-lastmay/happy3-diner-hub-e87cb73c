// Owner-only dialog: create a direct child marketer or cafeteria (Level 2 / direct cafe).
// Uses the create-child edge function. When the caller is the Owner, allows overriding country/currency/language.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  entityType: "marketer" | "cafeteria";
  trigger: React.ReactNode;
  onDone?: (refCode: string) => void;
}

interface Country { code: string; name_ar: string; name_en: string; default_currency: string | null; default_language: string }
interface Currency { code: string; name_ar: string; name_en: string }

export function CreateChildDialog({ entityType, trigger, onDone }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countries, setCountries] = useState<Country[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [form, setForm] = useState({
    name: "", email: "", password: "",
    phone: "", whatsapp: "", address: "",
    override_country_code: "", override_currency_code: "", override_language: "ar" as "ar" | "en",
    parent_ref_code: "",
  });

  useEffect(() => {
    if (!open) return;
    supabase.from("countries").select("*").order("name_en").then(({ data }) => setCountries((data ?? []) as Country[]));
    supabase.from("currencies").select("*").order("code").then(({ data }) => setCurrencies((data ?? []) as Currency[]));
  }, [open]);

  const onCountryChange = (code: string) => {
    const c = countries.find((x) => x.code === code);
    setForm((f) => ({
      ...f,
      override_country_code: code,
      override_currency_code: c?.default_currency ?? f.override_currency_code,
      override_language: (c?.default_language as "ar" | "en") ?? f.override_language,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { toast.error(t("error.required_field")); return; }
    if (form.password.length < 8) { toast.error(t("staff.password_min")); return; }
    if (!form.override_country_code || !form.override_currency_code) { toast.error(t("error.required_field")); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("create-child", {
      body: { entity_type: entityType, ...form },
    });
    setBusy(false);
    const err = (data as { error?: string } | null)?.error ?? error?.message;
    if (err) { toast.error(err); return; }
    const refCode = (data as { ref_code: string }).ref_code;
    toast.success(`${t("common.success")} — ${refCode}`);
    setOpen(false);
    setForm({ name: "", email: "", password: "", phone: "", whatsapp: "", address: "", override_country_code: "", override_currency_code: "", override_language: "ar", parent_ref_code: "" });
    onDone?.(refCode);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{entityType === "marketer" ? t("owner.create.marketer") : t("owner.create.cafeteria")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label>{t("common.name")} *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t("common.email")} *</Label><Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>{t("common.password")} *</Label><Input type="text" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={t("staff.password_min")} /></div>

            <div className="space-y-1">
              <Label>{t("common.country")} *</Label>
              <Select value={form.override_country_code} onValueChange={onCountryChange}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{countries.map((c) => (<SelectItem key={c.code} value={c.code}>{c.name_ar} / {c.name_en}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("common.currency")} *</Label>
              <Select value={form.override_currency_code} onValueChange={(v) => setForm({ ...form, override_currency_code: v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{currencies.map((c) => (<SelectItem key={c.code} value={c.code}>{c.code} — {c.name_en}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("common.language")}</Label>
              <Select value={form.override_language} onValueChange={(v) => setForm({ ...form, override_language: v as "ar" | "en" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ar">العربية</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t("common.phone")}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t("common.whatsapp")}</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
            <div className="space-y-1 sm:col-span-2"><Label>{t("common.address")}</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90">{busy ? t("common.loading") : t("common.create")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
