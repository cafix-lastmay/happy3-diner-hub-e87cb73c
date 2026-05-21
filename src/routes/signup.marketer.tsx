import { createFileRoute, Link } from "@tanstack/react-router";
import { Coffee } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { SignupForm } from "@/components/SignupForm";
import { Footer } from "@/components/Footer";
import { useI18n } from "@/i18n/I18nProvider";

export const Route = createFileRoute("/signup/marketer")({
  component: SignupMarketerPage,
});

function SignupMarketerPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/30 to-background flex flex-col">
      <header className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Coffee className="h-4 w-4" />
          </div>
          <span className="font-bold">{t("app.name")}</span>
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <SignupForm kind="marketer" />
      </main>
      <Footer />
    </div>
  );
}
