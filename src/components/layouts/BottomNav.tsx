// Mobile-only fixed bottom navigation bar, items vary by user role.
// Renders nothing on tablet/desktop; the existing sidebar handles those.
import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ClipboardList,
  Bell,
  User,
  ChefHat,
  CheckCircle2,
  Users,
  BarChart3,
  Store,
  UtensilsCrossed,
  Armchair,
  Wallet,
  Settings,
  History,
  MoreHorizontal,
  Sparkles,
  Network,
  BellRing,
  Calculator,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Role } from "@/auth/AuthProvider";

type Item = {
  to: string;
  label: string;
  icon: LucideIcon;
};

export type RoleKey = Extract<Role, "waiter" | "chef" | "manager" | "cafeteria_admin" | "owner" | "marketer" | "driver">;

export const BOTTOM_NAV_ROLES: ReadonlySet<string> = new Set([
  "waiter",
  "chef",
  "manager",
  "cafeteria_admin",
  "owner",
  "marketer",
]);

const PRIMARY: Record<RoleKey, Item[]> = {
  waiter: [
    { to: "/staff/tables", label: "الطاولات", icon: Armchair },
    { to: "/staff/orders", label: "الطلبات", icon: ClipboardList },
    { to: "/notifications", label: "الإشعارات", icon: Bell },
    { to: "/settings/account", label: "حسابي", icon: User },
  ],
  chef: [
    { to: "/staff/orders", label: "طلباتي", icon: ChefHat },
    { to: "/staff/history", label: "الجاهزة", icon: CheckCircle2 },
    { to: "/notifications", label: "الإشعارات", icon: Bell },
    { to: "/settings/account", label: "حسابي", icon: User },
  ],
  manager: [
    { to: "/manager", label: "الرئيسية", icon: LayoutDashboard },
    { to: "/manager/tables", label: "الطاولات", icon: Armchair },
    { to: "/manager/staff", label: "الطاقم", icon: Users },
    { to: "/manager/reports", label: "التقارير", icon: BarChart3 },
  ],
  cafeteria_admin: [
    { to: "/cafeteria/orders", label: "الرئيسية", icon: LayoutDashboard },
    { to: "/cafeteria/menu", label: "المنيو", icon: UtensilsCrossed },
    { to: "/cafeteria/tables", label: "الطاولات", icon: Armchair },
    { to: "/cafeteria/staff", label: "الطاقم", icon: Users },
  ],
  owner: [
    { to: "/owner", label: "الرئيسية", icon: LayoutDashboard },
    { to: "/owner/cafeterias", label: "الكافيتريات", icon: Store },
    { to: "/owner/marketers", label: "المسوقون", icon: Users },
    { to: "/owner/recharges", label: "الشحن", icon: Wallet },
  ],
  marketer: [
    { to: "/marketer", label: "الرئيسية", icon: LayoutDashboard },
    { to: "/marketer/calculator", label: "الحاسبة", icon: Calculator },
    { to: "/marketer/commissions", label: "عمولاتي", icon: Wallet },
    { to: "/marketer/withdrawals", label: "السحب", icon: BarChart3 },
  ],
  driver: [
    { to: "/driver", label: "الرئيسية", icon: LayoutDashboard },
    { to: "/notifications", label: "الإشعارات", icon: Bell },
    { to: "/settings/account", label: "حسابي", icon: User },
  ],
};

const OVERFLOW: Partial<Record<RoleKey, Item[]>> = {
  cafeteria_admin: [
    { to: "/cafeteria/reports", label: "التقارير", icon: BarChart3 },
    { to: "/cafeteria/recharge", label: "شحن النقاط", icon: Wallet },
    { to: "/cafeteria/history", label: "سجل الشحن", icon: History },
    { to: "/cafeteria/shifts", label: "الورديات", icon: Sparkles },
    { to: "/cafeteria/pricing", label: "التسعير", icon: ClipboardList },
    { to: "/cafeteria/settings", label: "الإعدادات", icon: Settings },
    { to: "/settings/notifications", label: "تفضيلات الإشعارات", icon: BellRing },
  ],
  marketer: [
    { to: "/marketer", label: "شبكتي", icon: Network },
    { to: "/marketer/reports", label: "التقارير", icon: BarChart3 },
    { to: "/settings/notifications", label: "تفضيلات الإشعارات", icon: BellRing },
    { to: "/settings/account", label: "حسابي", icon: User },
  ],
  owner: [
    { to: "/owner/calculator", label: "الحاسبة", icon: Calculator },
    { to: "/owner/reports", label: "التقارير", icon: BarChart3 },
    { to: "/owner/commissions", label: "العمولات", icon: Wallet },
    { to: "/owner/withdrawals", label: "السحب", icon: BarChart3 },
    { to: "/owner/recharge_instructions", label: "تعليمات الشحن", icon: ClipboardList },
    { to: "/settings/notifications", label: "تفضيلات الإشعارات", icon: BellRing },
    { to: "/settings/account", label: "الإعدادات", icon: Settings },
  ],
};

interface Props {
  role: RoleKey | null | undefined;
}

export function BottomNav({ role }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!role || !PRIMARY[role]) return null;
  const items = PRIMARY[role];
  const overflow = OVERFLOW[role];

  const isActive = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  const renderItem = (item: Item) => {
    const active = isActive(item.to);
    const Icon = item.icon;
    return (
      <Link
        key={`${item.to}-${item.label}`}
        to={item.to}
        className={`flex min-w-[44px] min-h-[44px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1 transition-colors ${
          active ? "text-primary" : "text-muted-foreground"
        }`}
      >
        <Icon
          className={`h-5 w-5 ${active ? "fill-primary/15" : ""}`}
          strokeWidth={active ? 2.4 : 1.8}
        />
        <span className="text-[10px] leading-none font-medium">
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border min-h-14 flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      dir="rtl"
      aria-label="التنقل السفلي"
    >
      {items.map(renderItem)}

      {overflow && overflow.length > 0 && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className={`flex min-w-[44px] min-h-[44px] flex-1 flex-col items-center justify-center gap-1 px-1 py-1 transition-colors ${
                moreOpen ? "text-primary" : "text-muted-foreground"
              }`}
              aria-label="المزيد"
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px] leading-none font-medium">المزيد</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle className="text-right">المزيد</SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-1 gap-1 pb-[env(safe-area-inset-bottom)]">
              {overflow.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.to);
                return (
                  <Link
                    key={`more-${item.to}-${item.label}`}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60"
                    }`}
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </nav>
  );
}
