// Staff shift history.
//   Waiter -> shows orders they closed (status = paid) during their active shift.
//   Chef   -> shows orders they marked ready (status in ready/served/paid) during
//             their active shift, filtered to items in their assigned categories.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ClipboardList, QrCode, History as HistoryIcon } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/staff/history")({ component: StaffHistory });

interface Order { id: string; table_label: string; status: string; total: number; created_at: string; updated_at: string; shift_id: string | null }
interface OrderItem { id: string; order_id: string; item_id: string | null; name_snapshot: string; price_snapshot: number; qty: number }

function StaffHistory() {
  const { t } = useI18n();
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const isWaiter = roles.includes("waiter");
  const isChef = roles.includes("chef");
  const isStaff = isWaiter || isChef;

  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [chefCats, setChefCats] = useState<Set<string> | null>(null);
  const [itemCatMap, setItemCatMap] = useState<Map<string, string>>(new Map());

  const load = useCallback(async () => {
    if (!user) return;
    // Find current active shift
    const { data: sh } = await supabase.rpc("get_my_active_shift");
    const shift = (sh ?? [])[0];
    if (!shift || shift.status !== "active") { setOrders([]); setItems([]); return; }

    const wantedStatuses: ("paid" | "ready" | "served")[] = isWaiter ? ["paid"] : ["ready", "served", "paid"];
    const { data: o } = await supabase.from("orders").select("*")
      .eq("shift_id", shift.id)
      .in("status", wantedStatuses)
      .order("updated_at", { ascending: false })
      .limit(200);
    let list = (o ?? []) as Order[];

    // Chef: filter to orders that contain items from their categories
    if (isChef && chefCats && list.length) {
      const { data: it } = await supabase.from("order_items").select("*").in("order_id", list.map((x) => x.id));
      const allItems = (it ?? []) as OrderItem[];
      const matchingOrderIds = new Set(allItems.filter((i) => {
        const cat = i.item_id ? itemCatMap.get(i.item_id) : undefined;
        return cat ? chefCats.has(cat) : false;
      }).map((i) => i.order_id));
      list = list.filter((o) => matchingOrderIds.has(o.id));
      setItems(allItems.filter((i) => matchingOrderIds.has(i.order_id) && (i.item_id ? chefCats.has(itemCatMap.get(i.item_id) ?? "") : false)));
    } else if (list.length) {
      const { data: it } = await supabase.from("order_items").select("*").in("order_id", list.map((x) => x.id));
      setItems((it ?? []) as OrderItem[]);
    } else {
      setItems([]);
    }
    setOrders(list);
  }, [user, isWaiter, isChef, chefCats, itemCatMap]);

  // Load chef category scopes + item->category map
  useEffect(() => {
    if (!isChef || !user) return;
    (async () => {
      const { data: scopes } = await supabase.rpc("get_my_staff_scopes");
      const ids = (scopes ?? []).filter((s: { kind: string }) => s.kind === "category").map((s: { ref_id: string }) => s.ref_id);
      setChefCats(new Set<string>(ids));
      const { data: staff } = await supabase.from("staff").select("cafeteria_ref_code").eq("user_id", user.id).eq("is_active", true).maybeSingle();
      if (staff) {
        const { data: mi } = await supabase.from("menu_items").select("id,category_id").eq("cafeteria_ref_code", staff.cafeteria_ref_code);
        const m = new Map<string, string>();
        (mi ?? []).forEach((r: { id: string; category_id: string | null }) => { if (r.category_id) m.set(r.id, r.category_id); });
        setItemCatMap(m);
      }
    })();
  }, [isChef, user]);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/login" }); return; }
    if (!isStaff) { navigate({ to: "/" }); return; }
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [loading, user, isStaff, navigate, load]);

  if (loading || !isStaff) return null;

  const navItems = [
    ...(isWaiter ? [{ to: "/staff/tables", label: t("staff.nav.tables"), icon: QrCode }] : []),
    { to: "/staff/orders", label: t("staff.nav.orders"), icon: ClipboardList },
    { to: "/staff/history", label: t("staff.nav.history"), icon: HistoryIcon },
  ];

  return (
    <DashboardShell title={t("staff.dashboard.title")} navItems={navItems}>
      <h1 className="text-2xl font-bold mb-2">{t("staff.history.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {isWaiter ? t("staff.history.waiter.hint") : t("staff.history.chef.hint")}
      </p>
      {orders.length === 0 ? (
        <EmptyState icon={<HistoryIcon className="h-6 w-6" />} title={t("staff.history.empty")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((o) => {
            const its = items.filter((i) => i.order_id === o.id);
            return (
              <Card key={o.id} className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-bold">{t("orders.table")}: {o.table_label}</div>
                    <div className="text-[10px] text-muted-foreground">{new Date(o.updated_at).toLocaleString()}</div>
                  </div>
                  <Badge variant="outline">{t(`status.${o.status}`)}</Badge>
                </div>
                <ul className="space-y-1 text-sm border-t border-border pt-2">
                  {its.map((it) => (
                    <li key={it.id} className="flex justify-between">
                      <span>{it.qty}× {it.name_snapshot}</span>
                      <span className="text-muted-foreground">{(it.price_snapshot * it.qty).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
                {isWaiter && (
                  <div className="mt-3 font-bold text-accent">{Number(o.total).toFixed(2)}</div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
