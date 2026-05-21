import { useI18n } from "@/i18n/I18nProvider";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      className="gap-2"
    >
      <Languages className="h-4 w-4" />
      {lang === "ar" ? "English" : "العربية"}
    </Button>
  );
}
