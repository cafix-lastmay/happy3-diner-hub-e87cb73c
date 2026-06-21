// Seller / cafe-admin tab to manage local payment methods (cash on delivery, Vodafone Cash, Instapay).
// Public reads only the enabled rows for the customer checkout screen.
import { useEffect, useState } from "react";
import { Wallet, Save, Loader2, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export type PaymentMethod = "cash_on_delivery" | "vodafone_cash" | "instapay";

const METHODS: { key: PaymentMethod; label: string; needsWallet: boolean; hint?: string }[] = [
  { key: "cash_on_delivery", label: "الدفع عند الاستلام", needsWallet: false, hint: "الدفع نقداً عند تسليم الطلب" },
  { key: "vodafone_cash", label: "فودافون كاش", needsWallet: true, hint: "رقم محفظة فودافون كاش الخاص بك" },
  { key: "instapay", label: "إنستاباي", needsWallet: true, hint: "اسم/رابط إنستاباي الخاص بك" },
];

interface Row { id?: string; method: PaymentMethod; is_enabled: boolean; wallet_number: string }

export function PaymentMethodsPanel({ cafeteriaId }: { cafeteriaId: string }) {
  const [rows, setRows] = useState<Record<PaymentMethod, Row>>(() => ({
    cash_on_delivery: { method: "cash_on_delivery", is_enabled: false, wallet_number: "" },
    vodafone_cash: { method: "vodafone_cash", is_enabled: false, wallet_number: "" },
    instapay: { method: "instapay", is_enabled: false, wallet_number: "" },
  }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("cafeteria_payment_methods")
        .select("id, method, is_enabled, wallet_number")
        .eq("cafeteria_id", cafeteriaId);
      const next = { ...rows };
      (data ?? []).forEach((d: any) => {
        next[d.method as PaymentMethod] = {
          id: d.id,
          method: d.method,
          is_enabled: !!d.is_enabled,
          wallet_number: d.wallet_number ?? "",
        };
      });
      setRows(next);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeteriaId]);

  const persist = async (m: PaymentMethod) => {
    setSaving(m);
    const row = rows[m];
    const payload: any = {
      cafeteria_id: cafeteriaId,
      method: m,
      is_enabled: row.is_enabled,
      wallet_number: row.wallet_number.trim() || null,
    };
    if (row.id) payload.id = row.id;
    const { data, error } = await (supabase as any)
      .from("cafeteria_payment_methods")
      .upsert(payload, { onConflict: "cafeteria_id,method" })
      .select("id")
      .maybeSingle();
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    if (data?.id && !row.id) setRows((p) => ({ ...p, [m]: { ...p[m], id: data.id } }));
    toast.success("تم الحفظ");
  };

  if (loading) return <p>جارٍ التحميل…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Wallet className="h-5 w-5" /> طرق الدفع المتاحة للعميل</h2>
        <p className="text-sm text-muted-foreground">فعّل الطرق التي تقبلها وأدخل رقم محفظتك للتحويلات.</p>
      </div>
      {METHODS.map((m) => {
        const r = rows[m.key];
        return (
          <Card key={m.key} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{m.label}</div>
                {m.hint && <div className="text-xs text-muted-foreground">{m.hint}</div>}
              </div>
              <Switch
                checked={r.is_enabled}
                onCheckedChange={(v) => setRows((p) => ({ ...p, [m.key]: { ...p[m.key], is_enabled: v } }))}
              />
            </div>
            {m.needsWallet && r.is_enabled && (
              <div className="space-y-1.5">
                <Label className="text-xs">{m.key === "instapay" ? "اسم/رابط إنستاباي" : "رقم المحفظة"}</Label>
                <Input
                  value={r.wallet_number}
                  onChange={(e) => setRows((p) => ({ ...p, [m.key]: { ...p[m.key], wallet_number: e.target.value } }))}
                  placeholder={m.key === "instapay" ? "example@instapay" : "01XXXXXXXXX"}
                  dir="ltr"
                />
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" disabled={saving === m.key} onClick={() => persist(m.key)}>
                {saving === m.key ? <Loader2 className="h-3 w-3 animate-spin me-2" /> : <Save className="h-3 w-3 me-2" />}
                حفظ
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// Small display component used in the customer checkout to show a wallet number with copy.
export function WalletDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3 space-y-1">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-sm font-bold" dir="ltr">{value}</div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(value).then(
              () => toast.success("تم النسخ"),
              () => toast.error("تعذّر النسخ"),
            );
          }}
        >
          <Copy className="h-3 w-3 me-1" /> نسخ
        </Button>
      </div>
    </div>
  );
}
