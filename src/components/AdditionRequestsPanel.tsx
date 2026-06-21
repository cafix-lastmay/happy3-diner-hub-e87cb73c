// Inline panel showing pending/recent "add-to-order" requests from customers,
// with approve/reject controls for the cafeteria owner or manager.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, Loader2 } from "lucide-react";

export type AdditionRequest = {
  id: string;
  order_id: string;
  cafeteria_ref_code: string;
  menu_item_id: string;
  size_id: string | null;
  quantity: number;
  addition_status: "pending" | "approved" | "rejected";
  reject_reason: string | null;
  created_at: string;
  // joined name (resolved client-side)
  item_name?: string;
  size_name?: string | null;
};

export function AdditionRequestsPanel({ orderId }: { orderId: string }) {
  const [reqs, setReqs] = useState<AdditionRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("order_addition_requests")
      .select("id, order_id, cafeteria_ref_code, menu_item_id, size_id, quantity, addition_status, reject_reason, created_at, menu_items(name), menu_item_sizes(name)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });
    const list: AdditionRequest[] = (data ?? []).map((r: any) => ({
      id: r.id, order_id: r.order_id, cafeteria_ref_code: r.cafeteria_ref_code,
      menu_item_id: r.menu_item_id, size_id: r.size_id, quantity: r.quantity,
      addition_status: r.addition_status, reject_reason: r.reject_reason,
      created_at: r.created_at,
      item_name: r.menu_items?.name, size_name: r.menu_item_sizes?.name ?? null,
    }));
    setReqs(list);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`addreqs-${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_addition_requests", filter: `order_id=eq.${orderId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const respond = async (id: string, approve: boolean) => {
    if (busy) return;
    setBusy(id);
    const { error } = await (supabase as any).rpc("respond_order_addition", {
      _request_id: id,
      _approve: approve,
      _reason: approve ? null : "رفض من البائع",
    });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? "تمت الموافقة وأُضيف للطلب" : "تم الرفض");
  };

  if (reqs.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/20 p-2 text-xs space-y-1.5">
      <div className="font-bold text-amber-700 dark:text-amber-400">طلبات إضافة من العميل</div>
      {reqs.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 border-t border-amber-200 pt-1.5 first:border-t-0 first:pt-0">
          <div className="flex-1 min-w-0">
            <div className="truncate">
              {r.item_name ?? "صنف"}{r.size_name ? ` — ${r.size_name}` : ""} × {r.quantity}
            </div>
          </div>
          {r.addition_status === "pending" ? (
            <div className="flex gap-1">
              <Button size="sm" className="h-6 px-2 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy === r.id} onClick={() => respond(r.id, true)}>
                {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              </Button>
              <Button size="sm" variant="outline" className="h-6 px-2" disabled={busy === r.id} onClick={() => respond(r.id, false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <span className={r.addition_status === "approved" ? "text-emerald-600 font-semibold" : "text-destructive font-semibold"}>
              {r.addition_status === "approved" ? "✓ مضاف" : "✗ مرفوض"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
