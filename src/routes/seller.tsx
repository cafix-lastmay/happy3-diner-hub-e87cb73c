// Simplified single-page dashboard for the "home seller" business type.
// Tabs: Orders (live board) / Today availability (quick toggles) / Menu (link) / Settings (link).
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ClipboardList, Settings, BookOpen, ToggleLeft, ExternalLink, Package, Bike, Wallet } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { OrdersBoard } from "@/components/OrdersBoard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/I18nProvider";
import { PaymentMethodsPanel } from "@/components/seller/PaymentMethodsPanel";
import { useRequireRole } from "@/auth/useRequireRole";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/seller")({
  ssr: false,
  component: SellerDashboard,
});

interface Cafe {
  id: string;
  ref_code: string;
  name: string;
  business_type: string;
  takeaway_qr_token: string | null;
  delivery_qr_token: string | null;
  mode_takeaway: boolean;
  mode_delivery: boolean;
}

interface MenuItem {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  available_today: boolean;
  category_id: string | null;
}

function SellerDashboard() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { ready } = useRequireRole("cafeteria_admin");
  const { user } = useAuth();
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    supabase
      .from("cafeterias")
      .select("id, ref_code, name, business_type, takeaway_qr_token, delivery_qr_token, mode_takeaway, mode_delivery")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const resolvedCafe = (data as Cafe) ?? null;
        if (resolvedCafe && resolvedCafe.business_type !== "home_seller") {
          navigate({ to: "/cafeteria/orders", replace: true });
          return;
        }
        setCafe(resolvedCafe);
      });
  }, [ready, user, navigate]);

  const loadItems = async (refCode: string) => {
    setLoadingItems(true);
    const { data } = await supabase
      .from("menu_items")
      .select("id, name, price, is_available, available_today, category_id")
      .eq("cafeteria_ref_code", refCode)
      .order("sort_order")
      .order("name");
    setItems((data as MenuItem[]) ?? []);
    setLoadingItems(false);
  };

  useEffect(() => {
    if (cafe?.ref_code) loadItems(cafe.ref_code);
  }, [cafe?.ref_code]);

  const toggleToday = async (id: string, next: boolean) => {
    // Optimistic
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, available_today: next } : i)));
    const { error } = await supabase.from("menu_items").update({ available_today: next }).eq("id", id);
    if (error) {
      toast.error(error.message);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, available_today: !next } : i)));
    }
  };

  if (!ready) return null;

  const navItems = [
    { to: "/cafeteria/menu", label: t("home_seller.tabs.menu"), icon: BookOpen },
    { to: "/cafeteria/settings", label: t("home_seller.tabs.settings"), icon: Settings },
  ];

  if (!cafe) {
    return (
      <DashboardShell title={t("home_seller.dashboard.title")} navItems={navItems}>
        <p>{t("common.loading")}</p>
      </DashboardShell>
    );
  }

  const takeawayUrl = cafe.takeaway_qr_token ? `${window.location.origin}/m/takeaway/${cafe.takeaway_qr_token}` : null;
  const deliveryUrl = cafe.delivery_qr_token ? `${window.location.origin}/m/delivery/${cafe.delivery_qr_token}` : null;

  return (
    <DashboardShell title={t("home_seller.dashboard.title")} navItems={navItems} showTrialCard>
      <h1 className="mb-4 text-2xl font-bold">{cafe.name}</h1>

      {/* Quick share links */}
      <div className="mb-6 flex flex-wrap gap-2">
        {takeawayUrl && cafe.mode_takeaway && (
          <Button size="sm" variant="outline" asChild>
            <a href={takeawayUrl} target="_blank" rel="noreferrer">
              <Package className="me-2 h-4 w-4" /> {t("mode.take_away")} <ExternalLink className="ms-2 h-3 w-3" />
            </a>
          </Button>
        )}
        {deliveryUrl && cafe.mode_delivery && (
          <Button size="sm" variant="outline" asChild>
            <a href={deliveryUrl} target="_blank" rel="noreferrer">
              <Bike className="me-2 h-4 w-4" /> {t("mode.delivery")} <ExternalLink className="ms-2 h-3 w-3" />
            </a>
          </Button>
        )}
      </div>

      <Tabs defaultValue="orders" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="orders"><ClipboardList className="me-2 h-4 w-4" />{t("home_seller.tabs.orders")}</TabsTrigger>
          <TabsTrigger value="today"><ToggleLeft className="me-2 h-4 w-4" />{t("home_seller.tabs.today")}</TabsTrigger>
          <TabsTrigger value="payment"><Wallet className="me-2 h-4 w-4" />الدفع</TabsTrigger>
          <TabsTrigger value="menu"><BookOpen className="me-2 h-4 w-4" />{t("home_seller.tabs.menu")}</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-6">
          <OrdersBoard cafeteriaRefCode={cafe.ref_code} />
        </TabsContent>

        <TabsContent value="today" className="mt-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{t("home_seller.today.title")}</h2>
            <p className="text-sm text-muted-foreground">{t("home_seller.today.hint")}</p>
          </div>
          {loadingItems ? (
            <p>{t("common.loading")}</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">{t("home_seller.today.empty")}</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.price}
                      {!item.is_available && <span className="ms-2 text-destructive">(معطّل دائم)</span>}
                    </div>
                  </div>
                  <Switch
                    checked={item.available_today}
                    onCheckedChange={(v) => toggleToday(item.id, v)}
                    disabled={!item.is_available}
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payment" className="mt-6">
          <PaymentMethodsPanel cafeteriaId={cafe.id} />
        </TabsContent>

        <TabsContent value="menu" className="mt-6">
          <p className="mb-4 text-sm text-muted-foreground">
            {t("home_seller.tabs.menu")} → {t("cafeteria.nav.menu")}
          </p>
          <Button asChild>
            <Link to="/cafeteria/menu">
              <BookOpen className="me-2 h-4 w-4" /> {t("cafeteria.nav.menu")}
            </Link>
          </Button>
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
