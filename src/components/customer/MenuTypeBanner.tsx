// Full-width colored strip placed at the very top of customer-facing menu
// pages so the menu type (dine-in / takeaway / delivery) is unmistakable.
import { MENU_MODE_STYLES, type MenuMode } from "@/lib/menu-mode";
import { useI18n } from "@/i18n/I18nProvider";

export function MenuTypeBanner({ mode }: { mode: MenuMode }) {
  const { t } = useI18n();
  const s = MENU_MODE_STYLES[mode];
  const Icon = s.icon;
  return (
    <div className={`w-full ${s.strip} shadow-sm`}>
      <div className="container mx-auto px-4 py-2.5 flex items-center justify-center gap-2 text-base sm:text-lg font-extrabold tracking-wide">
        <Icon className="h-5 w-5" />
        <span>{t("menu.type.label")}: {t(s.labelKey)}</span>
      </div>
    </div>
  );
}
