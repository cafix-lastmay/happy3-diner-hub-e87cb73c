import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { QrScanner } from "@/components/QrScanner";
import { useI18n } from "@/i18n/I18nProvider";
import { useAuth } from "@/auth/AuthProvider";
import { Coffee, LogIn, UserPlus, Store, Megaphone, ArrowRight, ArrowLeft } from "lucide-react";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { t, dir } = useI18n();
  const { session, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [signupOpen, setSignupOpen] = useState(false);
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  // Redirect already-authenticated users to their dashboards
  useEffect(() => {
    if (loading || !session) return;
    if (roles.includes("owner")) navigate({ to: "/owner" });
    else if (roles.includes("marketer")) navigate({ to: "/marketer" });
    else if (roles.includes("cafeteria_admin")) navigate({ to: "/cafeteria" });
    else if (roles.includes("manager")) navigate({ to: "/manager" });
    else if (roles.includes("waiter") || roles.includes("chef")) navigate({ to: "/staff/orders" });
  }, [loading, session, roles, navigate]);

  const handleDecoded = (token: string) => {
    if (!token) return;
    navigate({ to: "/m/$qrToken", params: { qrToken: token } });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Coffee className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold">{t("app.name")}</span>
          </div>
          <LanguageSwitcher />
        </div>
      </header>

      {/* Customer QR scanner — main hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-secondary/40 via-background to-background" />
        <div className="absolute -top-24 start-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />

        <div className="container mx-auto px-4 py-12 md:py-20">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-5xl">
              {t("scanner.title")}
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
              {t("scanner.subtitle")}
            </p>
            <div className="mt-8 flex w-full justify-center">
              <QrScanner onDecoded={handleDecoded} />
            </div>
          </div>
        </div>
      </section>

      {/* Partner actions: login + signup */}
      <section className="container mx-auto px-4 pb-10">
        <Card className="mx-auto max-w-2xl border-border/60 p-6 md:p-8">
          <div className="mb-5 text-center">
            <h2 className="text-lg font-semibold">{t("landing.partners.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("landing.partners.subtitle")}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                {t("common.login")}
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => setSignupOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
              {t("common.signup")}
            </Button>
          </div>
        </Card>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 pb-24">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { title: t("landing.feature1.title"), desc: t("landing.feature1.desc") },
            { title: t("landing.feature2.title"), desc: t("landing.feature2.desc") },
            { title: t("landing.feature3.title"), desc: t("landing.feature3.desc") },
          ].map((f, i) => (
            <Card
              key={i}
              className="border-border/60 p-6 transition-all hover:border-accent/50 hover:shadow-lg"
            >
              <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      <Footer />

      {/* Signup type chooser */}
      <Dialog open={signupOpen} onOpenChange={setSignupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("landing.signup.choose")}</DialogTitle>
            <DialogDescription>{t("landing.partners.subtitle")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <Link
              to="/signup/cafeteria"
              onClick={() => setSignupOpen(false)}
              className="group flex items-center gap-4 rounded-lg border border-border p-4 transition-all hover:border-accent hover:bg-accent/5"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-foreground">
                <Store className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{t("landing.cta.cafeteria")}</div>
                <div className="text-xs text-muted-foreground">
                  {t("landing.signup.cafeteria.desc")}
                </div>
              </div>
              <Arrow className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
            </Link>
            <Link
              to="/signup/marketer"
              onClick={() => setSignupOpen(false)}
              className="group flex items-center gap-4 rounded-lg border border-border p-4 transition-all hover:border-accent hover:bg-accent/5"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-foreground">
                <Megaphone className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <div className="font-semibold">{t("landing.cta.marketer")}</div>
                <div className="text-xs text-muted-foreground">
                  {t("landing.signup.marketer.desc")}
                </div>
              </div>
              <Arrow className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
