import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/m/my-orders/$ref")({
  component: MyOrdersPage,
});

type CustomerOrder = {
  id: string;
  created_at: string;
  status: string;
  mode: string;
  total: number;
  customer_name: string | null;
  payment_method: string | null;
  notes: string | null;
  items: { name: string; qty: number; price: number }[] | null;
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

const PAY_AR: Record<string, string> = {
  cash_on_delivery: "كاش عند الاستلام",
  vodafone_cash: "فودافون كاش",
  instapay: "إنستاباي",
};

function MyOrdersPage() {
  const { ref } = Route.useParams();
  const initialPhone =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("phone") ||
        localStorage.getItem("cx:last_phone") ||
        ""
      : "";
  const [phone, setPhone] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);

  const load = async (p: string) => {
    const clean = p.replace(/[^\d+]/g, "");
    if (clean.length < 6) {
      toast.error("أدخل رقم هاتف صحيح");
      return;
    }
    setLoading(true);
    const { data, error } = await (supabase as any).rpc("get_customer_orders", {
      _phone: clean,
      _ref_code: ref,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOrders((data as CustomerOrder[]) ?? []);
    try {
      localStorage.setItem("cx:last_phone", clean);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (initialPhone) load(initialPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/20 to-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        <Card className="p-4">
          <h1 className="text-lg font-bold mb-2">📋 طلباتي السابقة</h1>
          <p className="text-xs text-muted-foreground mb-3">
            أدخل رقم هاتفك لعرض طلباتك من هذا الكافيه.
          </p>
          <div className="flex gap-2">
            <Input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="flex-1"
            />
            <Button onClick={() => load(phone)} disabled={loading}>
              {loading ? "..." : "عرض"}
            </Button>
          </div>
        </Card>

        {orders && orders.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            لا توجد طلبات سابقة بهذا الرقم.
          </Card>
        )}

        {orders &&
          orders.map((o) => (
            <Card key={o.id} className="p-3 space-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-mono text-xs text-muted-foreground" dir="ltr">
                    #{o.id.slice(-6).toUpperCase()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("ar-EG")}
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-sm font-bold text-accent">{Number(o.total).toFixed(2)}</div>
                  <div className="text-[10px] px-2 py-0.5 rounded-full bg-muted inline-block">
                    {STATUS_AR[o.status] ?? o.status}
                  </div>
                </div>
              </div>
              {o.items && o.items.length > 0 && (
                <ul className="text-xs text-muted-foreground border-t pt-1.5">
                  {o.items.map((it, i) => (
                    <li key={i}>• {it.name} × {it.qty}</li>
                  ))}
                </ul>
              )}
              {o.payment_method && (
                <div className="text-[11px] text-muted-foreground">
                  💳 {PAY_AR[o.payment_method] ?? o.payment_method}
                </div>
              )}
              <a
                href={`/m/order/${o.id}?phone=${encodeURIComponent(phone.replace(/[^\d+]/g, ""))}`}
                className="text-xs text-accent underline block pt-1"
              >
                تفاصيل وتتبّع ←
              </a>
            </Card>
          ))}
      </div>
    </div>
  );
}
