// Reusable signup form for Marketer or Cafeteria self-signup.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { extractEdgeError } from "@/lib/edge-error";



interface Country { code: string; name_en: string; name_ar: string; default_currency: string | null; default_language: string }
interface Currency { code: string; name_en: string; name_ar: string; symbol: string }

interface Props {
  kind: "marketer" | "cafeteria";
}

export function SignupForm({ kind }: Props) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [countries, setCountries] = useState<Country[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    country_code: "EG",
    currency_code: "EGP",
    language: "ar" as "ar" | "en",
    address: "",
    phone: "",
    whatsapp: "",
    referral_code: "",
    business_type: "full_cafe" as "full_cafe" | "home_seller",
  });


  useEffect(() => {
    supabase.from("countries").select("*").order("name_en").then(({ data }) => setCountries((data ?? []) as Country[]));
    supabase.from("currencies").select("*").order("code").then(({ data }) => setCurrencies((data ?? []) as Currency[]));
    if (typeof window !== "undefined") {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) setForm((f) => ({ ...f, referral_code: ref.trim().toUpperCase() }));
    }
  }, []);

  const onCountryChange = (code: string) => {
    const c = countries.find((x) => x.code === code);
    setForm((f) => ({
      ...f,
      country_code: code,
      currency_code: c?.default_currency ?? f.currency_code,
      language: (c?.default_language as "ar" | "en") ?? f.language,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.country_code || !form.currency_code) {
      toast.error(t("error.required_field"));
      return;
    }
    setLoading(true);

    const fnName = kind === "marketer" ? "signup-marketer" : "signup-cafeteria";
    const referral_code = form.referral_code.trim().toUpperCase() || undefined;
    const payload = kind === "marketer"
      ? { full_name: form.name, ...form, name: undefined, referral_code }
      : { ...form, referral_code };

    const { data, error } = await supabase.functions.invoke(fnName, { body: payload });
    if (error || (data as { error?: string })?.error) {
      const msg = await extractEdgeError(error, data, t("common.error"));
      setLoading(false);
      toast.error(msg);
      return;
    }

    // Sign in immediately
    const { error: signinErr } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
    setLoading(false);
    if (signinErr) {
      toast.error(signinErr.message);
      navigate({ to: "/login" });
      return;
    }
    toast.success(`${t("common.success")} — ${t("common.ref_code")}: ${(data as { ref_code: string }).ref_code}`);
    navigate({ to: kind === "marketer" ? "/marketer" : "/cafeteria" });
  };

  const nameLabel = kind === "marketer" ? t("common.name") : t("common.cafeteria_name");

  return (
    <Card className="w-full max-w-2xl p-8">
      <h1 className="text-2xl font-bold">
        {kind === "marketer" ? t("auth.signup.marketer.title") : t("auth.signup.cafeteria.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {kind === "marketer" ? t("auth.signup.marketer.subtitle") : t("auth.signup.cafeteria.subtitle")}
      </p>
      <p className="mt-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        🔒 {t("signup.data_security_note")}
      </p>

      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>{nameLabel} *</Label>
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("common.email")} *</Label>
          <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("common.password")} *</Label>
          <Input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("common.country")} *</Label>
          <Select value={form.country_code} onValueChange={onCountryChange}>
            <SelectTrigger><SelectValue placeholder={t("form.choose_country")} /></SelectTrigger>
            <SelectContent>
              {countries.map((c) => (
                <SelectItem key={c.code} value={c.code}>{lang === "ar" ? c.name_ar : c.name_en}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("common.currency")} *</Label>
          {(() => {
            const cur = currencies.find((c) => c.code === form.currency_code);
            const label = cur
              ? `${cur.code} — ${lang === "ar" ? cur.name_ar : cur.name_en}`
              : t("form.currency_auto_hint");
            return (
              <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-foreground">
                {label}
              </div>
            );
          })()}
          <p className="text-xs text-muted-foreground">{t("form.currency_auto_hint")}</p>
        </div>

        <div className="space-y-2">
          <Label>{t("common.phone")}</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label>{t("common.whatsapp")}</Label>
          <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>{t("common.address")}</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>
            {t("signup.referral_code")} <span className="text-muted-foreground">({t("common.optional")})</span>
          </Label>
          <Input
            value={form.referral_code}
            onChange={(e) => setForm({ ...form, referral_code: e.target.value.toUpperCase() })}
            placeholder={t("signup.referral_code.placeholder")}
            maxLength={32}
            autoCapitalize="characters"
          />
          <p className="text-xs text-muted-foreground">{t("signup.referral_code.hint")}</p>
        </div>

        <Button type="submit" disabled={loading} className="sm:col-span-2 bg-accent text-accent-foreground hover:bg-accent/90">
          {loading ? t("common.loading") : t("common.signup")}
        </Button>
      </form>
    </Card>
  );
}
