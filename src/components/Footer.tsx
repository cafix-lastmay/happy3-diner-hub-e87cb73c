import { Link } from "@tanstack/react-router";
import { useI18n } from "@/i18n/I18nProvider";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto border-t border-border/50 bg-background">
      <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <p>© {new Date().getFullYear()} {t("app.name")}</p>
        <nav className="flex flex-wrap items-center justify-center gap-4">
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            <span>Privacy Policy</span>
            <span className="mx-1">|</span>
            <span dir="rtl">سياسة الخصوصية</span>
          </Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">
            <span>Terms of Service</span>
            <span className="mx-1">|</span>
            <span dir="rtl">شروط الخدمة</span>
          </Link>
        </nav>
      </div>
    </footer>
  );
}
