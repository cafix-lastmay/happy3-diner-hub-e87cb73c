// Shared live orders board used by cafeteria admin, manager, waiter, and chef.
// Status workflow: new -> preparing -> ready -> served -> paid (or cancelled)
// Role rules (enforced server-side via set_order_status RPC):
//  - waiter: new->preparing always; preparing->ready ONLY if order has no chef items;
//            ready->served; served->paid
//  - chef:   preparing->ready ONLY (and only for orders containing items from their categories)
//  - admin/manager: any transition (ops correction)
// Visibility:
//  - waiter sees: new, preparing, ready, served (paid -> /staff/history); scoped by section
//  - chef sees:   preparing only, AND only orders containing items from their categories;
//                 also filters items list to only their categories
//  - admin/manager: all (filter toggles active vs all-non-paid)
// Layout:
//  - Orders are grouped by table (multiple concurrent orders on same table appear together)
//  - Each card shows an ascending timer (minutes since created_at), stops at "served"/"paid"
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ClipboardList, Timer, BellRing } from "lucide-react";
import { sendServiceCall } from "@/components/ServiceCallsListener";
import { DeliveryPanel } from "@/components/delivery/DeliveryPanel";

export type OrderStatus = "new" | "preparing" | "ready" | "served" | "paid" | "cancelled" | "awaiting_payment" | "paid_at_counter" | "delivered";
export type OrderMode = "dine_in" | "take_away" | "delivery";
interface Order {
  id: string; cafeteria_ref_code: string; table_label: string; customer_name: string | null;
  notes: string | null; total: number; status: OrderStatus; created_at: string; tip_amount: number;
  table_id: string | null; mode: OrderMode;
}
interface OrderItem { id: string; order_id: string; item_id: string | null; name_snapshot: string; price_snapshot: number; qty: number; notes: string | null }

// Compute "minutes elapsed" between created_at and now (or served/paid time = updated_at).
function minutesElapsed(createdAt: string, frozenAt?: string | null): number {
  const start = new Date(createdAt).getTime();
  const end = frozenAt ? new Date(frozenAt).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 60000));
}

export function OrdersBoard({ cafeteriaRefCode, allowedStatuses, scopeRole, requireActiveShift = false }: { cafeteriaRefCode: string; allowedStatuses?: OrderStatus[]; scopeRole?: "chef" | "waiter"; requireActiveShift?: boolean }) {
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [filterActive, setFilterActive] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hasActiveShift, setHasActiveShift] = useState<boolean | null>(requireActiveShift ? null : true);
  const [scopeIds, setScopeIds] = useState<Set<string> | null>(null);
  const [itemCategoryMap, setItemCategoryMap] = useState<Map<string, string>>(new Map());
  const [tableSectionMap, setTableSectionMap] = useState<Map<string, string>>(new Map());
  // Categories assigned to ANY active chef in this cafeteria (used by waiter UI to know
  // which orders require a chef before preparing->ready). Server enforces this regardless.
  const [chefCategoryIds, setChefCategoryIds] = useState<Set<string>>(new Set());
  // Tick every 30s to refresh visible timers without thrashing the DB.
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((n) => n + 1), 30000); return () => clearInterval(id); }, []);

  // Poll active shift status when gating is required
  useEffect(() => {
    if (!requireActiveShift) return;
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.rpc("get_my_active_shift");
      if (cancelled) return;
      const row = (data ?? [])[0];
      setHasActiveShift(!!(row && row.status === "active"));
    };
    check();
    const id = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [requireActiveShift]);

  // Load own staff scopes when scopeRole is set
  useEffect(() => {
    if (!scopeRole) { setScopeIds(null); return; }
    (async () => {
      const { data } = await supabase.rpc("get_my_staff_scopes");
      const kind = scopeRole === "chef" ? "category" : "section";
      const ids = (data ?? []).filter((s: { kind: string }) => s.kind === kind).map((s: { ref_id: string }) => s.ref_id);
      setScopeIds(ids.length === 0 ? null : new Set<string>(ids));
    })();
  }, [scopeRole]);

  // Lookup maps for category/section filtering + which categories belong to active chefs
  useEffect(() => {
    (async () => {
      const { data: mi } = await supabase.from("menu_items").select("id,category_id").eq("cafeteria_ref_code", cafeteriaRefCode);
      const catMap = new Map<string, string>();
      (mi ?? []).forEach((r: { id: string; category_id: string | null }) => { if (r.category_id) catMap.set(r.id, r.category_id); });
      setItemCategoryMap(catMap);

      const { data: rt } = await supabase.from("restaurant_tables").select("id,section_id").eq("cafeteria_ref_code", cafeteriaRefCode);
      const secMap = new Map<string, string>();
      (rt ?? []).forEach((r: { id: string; section_id: string | null }) => { if (r.section_id) secMap.set(r.id, r.section_id); });
      setTableSectionMap(secMap);

      // Find active chefs in this cafeteria + their assigned categories
      const { data: chefs } = await supabase
        .from("staff")
        .select("id")
        .eq("cafeteria_ref_code", cafeteriaRefCode)
        .eq("role", "chef")
        .eq("is_active", true);
      const chefIds = (chefs ?? []).map((c: { id: string }) => c.id);
      if (chefIds.length) {
        const { data: scopes } = await supabase
          .from("staff_scopes")
          .select("ref_id,kind,staff_id")
          .eq("kind", "category")
          .in("staff_id", chefIds);
        setChefCategoryIds(new Set<string>((scopes ?? []).map((s: { ref_id: string }) => s.ref_id)));
      } else {
        setChefCategoryIds(new Set<string>());
      }
    })();
  }, [cafeteriaRefCode]);

  const load = async () => {
    const { data: o } = await supabase.from("orders").select("*").eq("cafeteria_ref_code", cafeteriaRefCode).order("created_at", { ascending: false }).limit(100);
    const orderList = (o ?? []) as Order[];
    setOrders(orderList);
    if (orderList.length) {
      const { data: it } = await supabase.from("order_items").select("*").in("order_id", orderList.map((x) => x.id));
      setItems((it ?? []) as OrderItem[]);
    } else setItems([]);
  };

  useEffect(() => {
    load();
    const channel = supabase.channel(`orders-${cafeteriaRefCode}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `cafeteria_ref_code=eq.${cafeteriaRefCode}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeteriaRefCode]);

  const setStatus = async (id: string, status: Exclude<OrderStatus, "delivered">) => {
    if (requireActiveShift && !hasActiveShift) { toast.error(t("shift.required_to_act")); return; }
    if (busyId) return;
    setBusyId(id);
    try {
      const { error } = await supabase.rpc("set_order_status", { _order_id: id, _new_status: status });
      if (error) {
        // Friendly message when waiter is blocked by chef-required rule
        if (error.message?.includes("CHEF_REQUIRED")) {
          toast.error(t("orders.chef_required"));
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success(t(`status.${status}`));
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    } finally {
      setBusyId(null);
    }
  };

  const saveTip = async (id: string, tip: string) => {
    if (requireActiveShift && !hasActiveShift) { toast.error(t("shift.required_to_act")); return; }
    const v = Number(tip);
    if (!Number.isFinite(v) || v < 0) { toast.error(t("orders.invalid_tip")); return; }
    const { error } = await supabase.from("orders").update({ tip_amount: v }).eq("id", id);
    if (error) toast.error(error.message); else toast.success(t("common.success"));
  };

  // Does this specific order require a chef? (any item belongs to a chef-assigned category)
  const orderRequiresChef = (orderId: string): boolean => {
    if (chefCategoryIds.size === 0) return false;
    return items.some((i) => i.order_id === orderId && i.item_id && chefCategoryIds.has(itemCategoryMap.get(i.item_id) ?? ""));
  };

  const visible = useMemo(() => orders.filter((o) => {
    if (allowedStatuses && !allowedStatuses.includes(o.status)) return false;
    if (o.status === "paid" || o.status === "cancelled") return false;
    if (filterActive && o.status === "served" && !scopeRole) return false;

    if (scopeRole === "chef") {
      if (o.status !== "preparing" && o.status !== "paid_at_counter") return false;
      if (scopeIds) {
        const its = items.filter((i) => i.order_id === o.id);
        const match = its.some((i) => {
          const cat = i.item_id ? itemCategoryMap.get(i.item_id) : undefined;
          return cat ? scopeIds.has(cat) : false;
        });
        if (!match) return false;
      } else {
        return false;
      }
    } else if (scopeRole === "waiter") {
      // Takeaway/delivery orders have no table → not bound to any section; show to all waiters
      if (scopeIds && o.mode === "dine_in") {
        const sec = o.table_id ? tableSectionMap.get(o.table_id) : undefined;
        if (!sec || !scopeIds.has(sec)) return false;
      }
    }
    return true;
  }), [orders, items, allowedStatuses, filterActive, scopeRole, scopeIds, itemCategoryMap, tableSectionMap]);

  // Group visible orders by table_label, preserving creation order (newest first within group)
  const grouped = useMemo(() => {
    const map = new Map<string, Order[]>();
    visible.forEach((o) => {
      const key = o.table_label || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    return Array.from(map.entries());
  }, [visible]);

  const statusVariant: Record<OrderStatus, "default" | "secondary" | "destructive" | "outline"> = {
    new: "default", preparing: "secondary", ready: "outline", served: "secondary", paid: "outline", cancelled: "destructive",
    awaiting_payment: "destructive", paid_at_counter: "default",
  };

  const blocked = requireActiveShift && hasActiveShift === false;

  // Service calls banner is now mounted globally in DashboardShell.

  return (
    <div>
      {/* Waiter can ping the manager from the orders board */}
      {scopeRole === "waiter" && (
        <div className="mb-4">
          <Button size="sm" variant="outline" onClick={async () => {
            await sendServiceCall(cafeteriaRefCode, { kind: "manager", table_label: null, from: t("staff.role.waiter") });
            toast.success(t("customer.call_sent"));
          }}>
            <BellRing className="h-3 w-3 me-1" /> {t("calls.call_manager")}
          </Button>
        </div>
      )}
      {/* Chef can ping a waiter (e.g. order ready for pickup) */}
      {scopeRole === "chef" && (
        <div className="mb-4">
          <Button size="sm" variant="outline" onClick={async () => {
            await sendServiceCall(cafeteriaRefCode, { kind: "waiter", table_label: null, from: t("staff.role.chef") });
            toast.success(t("customer.call_sent"));
          }}>
            <BellRing className="h-3 w-3 me-1" /> {t("calls.call_waiter")}
          </Button>
        </div>
      )}
      {blocked && (
        <Card className="p-3 mb-4 border-destructive/40 bg-destructive/5 text-sm text-destructive">
          {t("shift.required_to_act")}
        </Card>
      )}
      {!scopeRole && (
        <div className="mb-4 flex gap-2">
          <Button size="sm" variant={filterActive ? "default" : "outline"} onClick={() => setFilterActive(true)}>{t("orders.filter.active")}</Button>
          <Button size="sm" variant={!filterActive ? "default" : "outline"} onClick={() => setFilterActive(false)}>{t("orders.filter.all")}</Button>
        </div>
      )}
      {visible.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={t("orders.no_orders")} description={t("orders.no_orders.hint")} />
      ) : (
        <div className="space-y-6">
          {grouped.map(([tableLabel, tableOrders]) => (
            <div key={tableLabel} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  {t("orders.table")}: <span className="text-foreground">{tableLabel}</span>
                </h3>
                {tableOrders.length > 1 && (
                  <Badge variant="secondary" className="text-[10px]">{tableOrders.length} {t("orders.count_label")}</Badge>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {tableOrders.map((o) => {
                  let its = items.filter((i) => i.order_id === o.id);
                  if (scopeRole === "chef" && scopeIds) {
                    its = its.filter((i) => {
                      const cat = i.item_id ? itemCategoryMap.get(i.item_id) : undefined;
                      return cat ? scopeIds.has(cat) : false;
                    });
                  }
                  const isBusy = busyId === o.id;
                  const disable = blocked || isBusy;
                  const isChef = scopeRole === "chef";
                  const isWaiter = scopeRole === "waiter";
                  const isAdminOrMgr = !scopeRole;
                  // Timer: stops when order is served or paid
                  const timerFrozen = o.status === "served" || o.status === "paid";
                  const mins = minutesElapsed(o.created_at, timerFrozen ? null : null);
                  const timerColor = mins >= 20 ? "text-destructive" : mins >= 10 ? "text-amber-500" : "text-muted-foreground";
                  const requiresChef = orderRequiresChef(o.id);
                  return (
                    <Card key={o.id} className="p-4">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="min-w-0">
                          {o.customer_name && <div className="text-xs text-muted-foreground truncate">{o.customer_name}</div>}
                          <div className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleTimeString()}</div>
                          {!timerFrozen && (
                            <div className={`mt-1 inline-flex items-center gap-1 text-xs font-mono ${timerColor}`}>
                              <Timer className="h-3 w-3" /> {mins} {t("orders.minutes_short")}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={statusVariant[o.status]}>{t(`status.${o.status}`)}</Badge>
                          {o.mode && o.mode !== "dine_in" && (
                            <Badge variant="outline" className="text-[10px]">
                              {o.mode === "take_away" ? `🥡 ${t("mode.take_away")}` : `🛵 ${t("mode.delivery")}`}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <ul className="space-y-1 text-sm border-t border-border pt-2">
                        {its.map((it) => (
                          <li key={it.id} className="flex justify-between"><span>{it.qty}× {it.name_snapshot}</span><span className="text-muted-foreground">{(it.price_snapshot * it.qty).toFixed(2)}</span></li>
                        ))}
                      </ul>
                      {o.notes && !isChef && <p className="mt-2 text-xs italic text-muted-foreground">📝 {o.notes}</p>}
                      {!isChef && (
                        <div className="mt-3 flex justify-between items-center">
                          <div className="font-bold text-accent">{Number(o.total).toFixed(2)}</div>
                        </div>
                      )}
                      {!isChef && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{t("orders.tip")}:</span>
                          <Input type="number" step="0.01" min="0" defaultValue={Number(o.tip_amount ?? 0)} className="h-7 w-20 text-xs" disabled={blocked}
                            onBlur={(e) => { if (Number(e.target.value) !== Number(o.tip_amount ?? 0)) saveTip(o.id, e.target.value); }} />
                        </div>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(isWaiter || isAdminOrMgr) && o.status === "awaiting_payment" && (
                          <Button size="sm" disabled={disable} onClick={() => setStatus(o.id, "paid_at_counter")} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("orders.mark_paid_at_counter")}</Button>
                        )}
                        {(isChef || isAdminOrMgr) && o.status === "paid_at_counter" && (
                          <Button size="sm" disabled={disable} onClick={() => setStatus(o.id, "preparing")} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("orders.mark_preparing")}</Button>
                        )}
                        {(isWaiter || isAdminOrMgr) && o.status === "new" && (
                          <Button size="sm" disabled={disable} onClick={() => setStatus(o.id, "preparing")} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("orders.mark_preparing")}</Button>
                        )}
                        {/* Chef: preparing -> ready */}
                        {(isChef || isAdminOrMgr) && o.status === "preparing" && (
                          <Button size="sm" disabled={disable} onClick={() => setStatus(o.id, "ready")} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("orders.mark_ready")}</Button>
                        )}
                        {/* Waiter: preparing -> ready. Chef-required rule only blocks dine_in. */}
                        {isWaiter && o.status === "preparing" && (!requiresChef || o.mode !== "dine_in") && (
                          <Button size="sm" disabled={disable} onClick={() => setStatus(o.id, "ready")} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("orders.mark_ready")}</Button>
                        )}
                        {isWaiter && o.status === "preparing" && requiresChef && o.mode === "dine_in" && (
                          <Badge variant="outline" className="text-[10px]">{t("orders.waiting_chef")}</Badge>
                        )}
                        {(isWaiter || isAdminOrMgr) && o.status === "ready" && (
                          <Button size="sm" disabled={disable} onClick={() => setStatus(o.id, "served")} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("orders.mark_served")}</Button>
                        )}
                        {(isWaiter || isAdminOrMgr) && o.status === "served" && (
                          <Button size="sm" disabled={disable} onClick={() => setStatus(o.id, "paid")} className="bg-accent text-accent-foreground hover:bg-accent/90">{t("orders.mark_paid")}</Button>
                        )}
                        {(isWaiter || isAdminOrMgr) && (o.status === "new" || o.status === "preparing") && (
                          <Button size="sm" variant="ghost" disabled={disable} onClick={() => setStatus(o.id, "cancelled")}>{t("orders.cancel")}</Button>
                        )}
                      </div>
                      {o.mode === "delivery" && (isWaiter || isAdminOrMgr) && (
                        <DeliveryPanel orderId={o.id} cafeteriaRefCode={o.cafeteria_ref_code} />
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
