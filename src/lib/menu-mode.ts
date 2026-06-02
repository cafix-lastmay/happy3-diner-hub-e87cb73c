// Visual style + i18n label key for each menu/order mode.
// Used by customer menu pages (header strip) and OrdersBoard (card coloring)
// so dine-in / takeaway / delivery are visually distinct everywhere.
import { Utensils, Package, Bike, type LucideIcon } from "lucide-react";

export type MenuMode = "dine_in" | "take_away" | "delivery";

export interface MenuModeStyle {
  labelKey: string;
  icon: LucideIcon;
  // Solid banner shown at the top of customer-facing menu pages
  strip: string;
  // Card classes for orders in staff/admin boards (border + tinted bg)
  card: string;
  // Inline mode badge classes
  badge: string;
  // Hex/text color for the side-stripe accent
  stripe: string;
}

export const MENU_MODE_STYLES: Record<MenuMode, MenuModeStyle> = {
  dine_in: {
    labelKey: "mode.dine_in",
    icon: Utensils,
    strip: "bg-sky-600 text-white",
    card: "border-2 border-sky-500/70 bg-sky-500/5",
    badge: "bg-sky-600 text-white border-sky-600",
    stripe: "bg-sky-500",
  },
  take_away: {
    labelKey: "mode.take_away",
    icon: Package,
    strip: "bg-amber-600 text-white",
    card: "border-2 border-amber-500/70 bg-amber-500/5",
    badge: "bg-amber-600 text-white border-amber-600",
    stripe: "bg-amber-500",
  },
  delivery: {
    labelKey: "mode.delivery",
    icon: Bike,
    strip: "bg-emerald-600 text-white",
    card: "border-2 border-emerald-500/70 bg-emerald-500/5",
    badge: "bg-emerald-600 text-white border-emerald-600",
    stripe: "bg-emerald-500",
  },
};
