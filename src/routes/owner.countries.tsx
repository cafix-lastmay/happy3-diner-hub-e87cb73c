// Owner-only: manage countries and currencies.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/countries")({ component: OwnerCountriesPage });

interface Country { code: string; name_ar: string; name_en: string; default_currency: string | null; default_language: string }
interface Currency { code: string; name_ar: string; name_en: string; symbol: string }

function OwnerCountriesPage() {
  const { t } = useI18n();
  const { ready } = useRequireRole("owner");
  const [countries, setCountries] = useState<Country[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [newC, setNewC] = useState<Country>({ code: "", name_ar: "", name_en: "", default_currency: null, default_language: "ar" });
  const [newCur, setNewCur] = useState<Currency>({ code: "", name_ar: "", name_en: "", symbol: "" });

  const load = async () => {
    const [{ data: c }, { data: cu }] = await Promise.all([
      supabase.from("countries").select("*").order("code"),
      supabase.from("currencies").select("*").order("code"),
    ]);
    setCountries((c ?? []) as Country[]);
    setCurrencies((cu ?? []) as Currency[]);
  };
  useEffect(() => { if (ready) load(); }, [ready]);

  const addCountry = async () => {
    if (!newC.code || !newC.name_en) { toast.error(t("error.required_field")); return; }
    const { error } = await supabase.from("countries").insert({ ...newC, code: newC.code.toUpperCase() });
    if (error) { toast.error(error.message); return; }
    setNewC({ code: "", name_ar: "", name_en: "", default_currency: null, default_language: "ar" });
    load();
  };
  const saveCountry = async (c: Country) => {
    const { error } = await supabase.from("countries").update({ name_ar: c.name_ar, name_en: c.name_en, default_currency: c.default_currency, default_language: c.default_language }).eq("code", c.code);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
  };
  const delCountry = async (code: string) => { if (!confirm(t("common.confirm_delete"))) return; await supabase.from("countries").delete().eq("code", code); load(); };

  const addCurrency = async () => {
    if (!newCur.code || !newCur.name_en || !newCur.symbol) { toast.error(t("error.required_field")); return; }
    const { error } = await supabase.from("currencies").insert({ ...newCur, code: newCur.code.toUpperCase() });
    if (error) { toast.error(error.message); return; }
    setNewCur({ code: "", name_ar: "", name_en: "", symbol: "" });
    load();
  };
  const saveCurrency = async (c: Currency) => {
    const { error } = await supabase.from("currencies").update({ name_ar: c.name_ar, name_en: c.name_en, symbol: c.symbol }).eq("code", c.code);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
  };
  const delCurrency = async (code: string) => { if (!confirm(t("common.confirm_delete"))) return; await supabase.from("currencies").delete().eq("code", code); load(); };

  if (!ready) return null;
  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={ownerNavItems(t)}>
      <h1 className="text-2xl font-bold mb-6">{t("owner.countries.title")}</h1>
      <Tabs defaultValue="countries">
        <TabsList><TabsTrigger value="countries">{t("owner.countries.tab_countries")}</TabsTrigger><TabsTrigger value="currencies">{t("owner.countries.tab_currencies")}</TabsTrigger></TabsList>

        <TabsContent value="countries">
          <Card className="p-4 mb-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="h-4 w-4" /> {t("owner.countries.add_country")}</h3>
            <div className="grid gap-2 sm:grid-cols-5">
              <Input placeholder="Code (EG)" value={newC.code} onChange={(e) => setNewC({ ...newC, code: e.target.value })} className="font-mono" />
              <Input placeholder="Arabic name" value={newC.name_ar} onChange={(e) => setNewC({ ...newC, name_ar: e.target.value })} />
              <Input placeholder="English name" value={newC.name_en} onChange={(e) => setNewC({ ...newC, name_en: e.target.value })} />
              <Select value={newC.default_currency ?? undefined} onValueChange={(v) => setNewC({ ...newC, default_currency: v })}>
                <SelectTrigger><SelectValue placeholder={t("common.currency")} /></SelectTrigger>
                <SelectContent>{currencies.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={addCountry} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("common.add")}</Button>
            </div>
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="p-3 text-start">Code</th><th className="p-3 text-start">عربي</th><th className="p-3 text-start">English</th><th className="p-3 text-start">{t("common.currency")}</th><th className="p-3 text-start">Lang</th><th className="p-3 text-start">{t("common.actions")}</th>
              </tr></thead>
              <tbody>{countries.map((c, i) => (
                <tr key={c.code} className="border-t border-border">
                  <td className="p-3 font-mono">{c.code}</td>
                  <td className="p-3"><Input value={c.name_ar} onChange={(e) => { const n = [...countries]; n[i] = { ...c, name_ar: e.target.value }; setCountries(n); }} /></td>
                  <td className="p-3"><Input value={c.name_en} onChange={(e) => { const n = [...countries]; n[i] = { ...c, name_en: e.target.value }; setCountries(n); }} /></td>
                  <td className="p-3">
                    <Select value={c.default_currency ?? undefined} onValueChange={(v) => { const n = [...countries]; n[i] = { ...c, default_currency: v }; setCountries(n); }}>
                      <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>{currencies.map((x) => <SelectItem key={x.code} value={x.code}>{x.code}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-3">
                    <Select value={c.default_language} onValueChange={(v) => { const n = [...countries]; n[i] = { ...c, default_language: v }; setCountries(n); }}>
                      <SelectTrigger className="w-[80px]"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="ar">ar</SelectItem><SelectItem value="en">en</SelectItem></SelectContent>
                    </Select>
                  </td>
                  <td className="p-3"><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => saveCountry(c)}><Save className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => delCountry(c.code)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="currencies">
          <Card className="p-4 mb-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="h-4 w-4" /> {t("owner.countries.add_currency")}</h3>
            <div className="grid gap-2 sm:grid-cols-5">
              <Input placeholder="Code (EGP)" value={newCur.code} onChange={(e) => setNewCur({ ...newCur, code: e.target.value })} className="font-mono" />
              <Input placeholder="Symbol (ج.م)" value={newCur.symbol} onChange={(e) => setNewCur({ ...newCur, symbol: e.target.value })} />
              <Input placeholder="Arabic name" value={newCur.name_ar} onChange={(e) => setNewCur({ ...newCur, name_ar: e.target.value })} />
              <Input placeholder="English name" value={newCur.name_en} onChange={(e) => setNewCur({ ...newCur, name_en: e.target.value })} />
              <Button onClick={addCurrency} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("common.add")}</Button>
            </div>
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="p-3 text-start">Code</th><th className="p-3 text-start">Symbol</th><th className="p-3 text-start">عربي</th><th className="p-3 text-start">English</th><th className="p-3 text-start">{t("common.actions")}</th>
              </tr></thead>
              <tbody>{currencies.map((c, i) => (
                <tr key={c.code} className="border-t border-border">
                  <td className="p-3 font-mono">{c.code}</td>
                  <td className="p-3"><Input value={c.symbol} onChange={(e) => { const n = [...currencies]; n[i] = { ...c, symbol: e.target.value }; setCurrencies(n); }} /></td>
                  <td className="p-3"><Input value={c.name_ar} onChange={(e) => { const n = [...currencies]; n[i] = { ...c, name_ar: e.target.value }; setCurrencies(n); }} /></td>
                  <td className="p-3"><Input value={c.name_en} onChange={(e) => { const n = [...currencies]; n[i] = { ...c, name_en: e.target.value }; setCurrencies(n); }} /></td>
                  <td className="p-3"><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => saveCurrency(c)}><Save className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => delCurrency(c.code)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
