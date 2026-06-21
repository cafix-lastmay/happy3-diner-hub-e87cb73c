import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Minus, Loader2 } from "lucide-react";

export const Route = createFileRoute("/m/order/$id")({
  component: OrderTrackingPage,
});

type AdditionReq = {
  id: string;
  status: "pending" | "approved" | "rejected";
  qty: number;
  name: string | null;
  size_name: string | null;
  created_at: string;
  reject_reason: string | null;
};

type OrderDetail = {
  id: string;
  created_at: string;
  status: string;
  mode: string;
  total: number;
  customer_name: string | null;
  customer_phone: string | null;
  cafeteria_ref_code: string;
  notes: string | null;
  payment_method: string | null;
  items: { id: string; name: string; qty: number; price: number }[];
  addition_requests: AdditionReq[];
};

type MenuItem = {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  sizes?: { id: string; name: string; price: number; is_default: boolean }[];
};

const STATUS_AR: Record<string, string> = {
  new: "جديد",
  awaiting_payment: "بانتظار الدفع",
  pending: "قيد المراجعة",
  preparing: "قيد التحضير",
  ready: "جاهز",
  on_the_way: "في الطريق",
  delivered: "تم التسليم",
  completed: "مكتمل",
  paid: "مدفوع",
  cancelled: "ملغي",
  rejected: "مرفوض",
};

const EDITABLE = new Set(["new", "awaiting_payment", "pending", "preparing"]);

function OrderTrackingPage() {
  const { id } = Route.useParams();
  const initialPhone =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("phone") ||
        localStorage.getItem("cx:last_phone") ||
        ""
      : "";
  const [phone, setPhone] = useState(initialPhone);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [picks, setPicks] = useState<Record<string, { qty: number; size_id: string | null }>>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (p: string) => {
    const clean = p.replace(/[^\d+]/g, "");
    if (clean.length < 6) return;
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("get_customer_order", {
      _order_id: id,
      _phone: clean,
    });
    setLoading(false);
    if (error) {
      if (error.message?.includes("NOT_FOUND")) toast.error("الطلب غير موجود أو رقم الهاتف لا يطابق");
      else toast.error(error.message);
      return;
    }
    setOrder(data as OrderDetail);
  }, [id]);

  useEffect(() => {
    if (initialPhone) load(initialPhone);
  }, [initialPhone, load]);

  // Poll lightly every 10s while open
  useEffect(() => {
    if (!order) return;
    const t = setInterval(() => load(phone), 10000);
    return () => clearInterval(t);
  }, [order?.id, phone, load, order]);

  const loadMenu = async () => {
    if (!order) return;
    const { data, error } = await supabase
      .from("menu_items")
      .select("id, name, price, category_id, menu_item_sizes(id, name, price, is_default, is_available)")
      .eq("cafeteria_ref_code", order.cafeteria_ref_code)
      .eq("is_available", true);
    if (error) { toast.error(error.message); return; }
    const list: MenuItem[] = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      price: Number(r.price),
      category_id: r.category_id,
      sizes: (r.menu_item_sizes ?? []).filter((s: any) => s.is_available).map((s: any) => ({
        id: s.id, name: s.name, price: Number(s.price), is_default: s.is_default,
      })),
    }));
    setMenu(list);
    setShowAdd(true);
  };

  const setQty = (itemId: string, qty: number, sizeId: string | null) => {
    setPicks((p) => {
      const r = { ...p };
      if (qty <= 0) delete r[itemId];
      else r[itemId] = { qty, size_id: sizeId };
      return r;
    });
  };

  const submitAddition = async () => {
    if (Object.keys(picks).length === 0) { toast.error("اختر صنفًا واحدًا على الأقل"); return; }
    setSubmitting(true);
    const items = Object.entries(picks).map(([item_id, v]) => ({
      item_id, qty: v.qty, size_id: v.size_id,
    }));
    const { error } = await (supabase as any).rpc("request_order_addition", {
      _order_id: id,
      _phone: phone.replace(/[^\d+]/g, ""),
      _items: items,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم إرسال طلب الإضافة — بانتظار موافقة البائع");
    setPicks({});
    setShowAdd(false);
    load(phone);
  };

  if (!initialPhone || !order) {
    return (
      <div className="min-h-screen p-4 flex items-center justify-center bg-gradient-to-b from-secondary/20 to-background">
        <Card className="p-4 w-full max-w-sm space-y-3">
          <h1 className="text-base font-bold">تتبّع الطلب</h1>
          <p className="text-xs text-muted-foreground">أدخل رقم هاتفك المرتبط بهذا الطلب.</p>
          <Input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
          <Button onClick={() => load(phone)} disabled={loading} className="w-full">
            {loading ? "..." : "عرض الطلب"}
          </Button>
        </Card>
      </div>
    );
  }

  const canAdd = EDITABLE.has(order.status);

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/20 to-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        <Card className="p-4 space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-mono text-xs text-muted-foreground" dir="ltr">
                #{order.id.slice(-6).toUpperCase()}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleString("ar-EG")}
              </div>
            </div>
            <div className="text-end">
              <div className="text-base font-bold text-accent">{Number(order.total).toFixed(2)}</div>
              <div className="text-[10px] px-2 py-0.5 rounded-full bg-accent/15 text-accent inline-block font-semibold">
                {STATUS_AR[order.status] ?? order.status}
              </div>
            </div>
          </div>
          <ul className="text-sm border-t pt-2 space-y-0.5">
            {order.items.map((it) => (
              <li key={it.id} className="flex justify-between">
                <span>{it.name} × {it.qty}</span>
                <span className="text-muted-foreground">{(Number(it.price) * it.qty).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </Card>

        {order.addition_requests.length > 0 && (
          <Card className="p-3 space-y-1">
            <h2 className="text-sm font-bold">طلبات الإضافة</h2>
            {order.addition_requests.map((r) => (
              <div key={r.id} className="text-xs flex justify-between items-center border-t pt-1.5 first:border-t-0 first:pt-0">
                <span>{r.name}{r.size_name ? ` — ${r.size_name}` : ""} × {r.qty}</span>
                <span className={
                  r.status === "approved" ? "text-emerald-600 font-semibold"
                  : r.status === "rejected" ? "text-destructive font-semibold"
                  : "text-amber-600 font-semibold"
                }>
                  {r.status === "approved" ? "✓ تمت الموافقة" : r.status === "rejected" ? "✗ مرفوض" : "⏳ بانتظار البائع"}
                </span>
              </div>
            ))}
          </Card>
        )}

        {canAdd && !showAdd && (
          <Button onClick={loadMenu} variant="outline" className="w-full">
            <Plus className="h-4 w-4 me-1" />
            طلب إضافة صنف للطلب
          </Button>
        )}

        {showAdd && (
          <Card className="p-3 space-y-2">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold">اختر الأصناف الإضافية</h2>
              <button onClick={() => setShowAdd(false)} className="text-xs text-muted-foreground">إلغاء</button>
            </div>
            <div className="max-h-[40vh] overflow-y-auto space-y-1.5">
              {menu.map((it) => {
                const pick = picks[it.id];
                const qty = pick?.qty ?? 0;
                const sizeId = pick?.size_id ?? (it.sizes?.find((s) => s.is_default)?.id ?? it.sizes?.[0]?.id ?? null);
                const size = it.sizes?.find((s) => s.id === sizeId);
                const price = size ? size.price : it.price;
                return (
                  <div key={it.id} className="border rounded-lg p-2">
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{it.name}</div>
                        <div className="text-xs text-accent">{price.toFixed(2)}</div>
                      </div>
                      {qty === 0 ? (
                        <Button size="sm" onClick={() => setQty(it.id, 1, sizeId)} className="h-7">
                          <Plus className="h-3 w-3" />
                        </Button>
                      ) : (
                        <div className="inline-flex items-center gap-1 rounded-full bg-muted">
                          <button onClick={() => setQty(it.id, qty - 1, sizeId)} className="h-7 w-7 inline-flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                          <span className="text-xs font-bold w-6 text-center">{qty}</span>
                          <button onClick={() => setQty(it.id, qty + 1, sizeId)} className="h-7 w-7 inline-flex items-center justify-center bg-accent text-accent-foreground rounded-full"><Plus className="h-3 w-3" /></button>
                        </div>
                      )}
                    </div>
                    {it.sizes && it.sizes.length > 0 && qty > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {it.sizes.map((s) => (
                          <button key={s.id} type="button" onClick={() => setQty(it.id, qty, s.id)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${sizeId === s.id ? "bg-accent text-accent-foreground border-accent" : "border-border bg-muted text-foreground"}`}>
                            {s.name} · {s.price.toFixed(2)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Button onClick={submitAddition} disabled={submitting} className="w-full">
              {submitting ? <><Loader2 className="h-4 w-4 me-1 animate-spin" />جاري الإرسال…</> : "إرسال طلب الإضافة للموافقة"}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}
