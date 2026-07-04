// Header button that lets staff/manager/owner switch dashboard view mode.
import { Smartphone, Tablet, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useViewMode, type ViewMode } from "@/components/ViewModeContext";
import { useI18n } from "@/i18n/I18nProvider";

export function ViewModeSwitcher() {
  const { mode, setMode } = useViewMode();
  const { t } = useI18n();
  const Icon = mode === "mobile" ? Smartphone : mode === "tablet" ? Tablet : Monitor;

  const item = (val: ViewMode, IconC: typeof Smartphone, label: string) => (
    <DropdownMenuItem onClick={() => setMode(val)} className={mode === val ? "bg-accent/40" : ""}>
      <IconC className="h-4 w-4 me-2" /> {label}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("view_mode.title")}>
          <Icon className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("view_mode.title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {item("mobile", Smartphone, t("view_mode.mobile"))}
        {item("tablet", Tablet, t("view_mode.tablet"))}
        {item("laptop", Monitor, t("view_mode.laptop"))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
