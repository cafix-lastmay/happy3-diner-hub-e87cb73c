import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/i18n/I18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { getCafeteriaHomeForUser } from "@/auth/cafeteriaRouting";
import { toast } from "sonner";
import { Coffee, ArrowLeft, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { t, dir } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setErrorMsg(null);
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      const msg = t("error.invalid_credentials");
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    if (data.user) {
      // Fetch role and redirect
      const { data: rolesData } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      const allRoles = (rolesData ?? []).map((r) => r.role as string);
      toast.success(t("common.success"));
      if (allRoles.includes("owner")) navigate({ to: "/owner" });
      else if (allRoles.includes("marketer")) navigate({ to: "/marketer" });
      else if (allRoles.includes("cafeteria_admin")) {
        const dashboard = await getCafeteriaHomeForUser(data.user.id);
        navigate({ to: dashboard });
      }
      else if (allRoles.includes("manager")) navigate({ to: "/manager" });
      else if (allRoles.includes("waiter") || allRoles.includes("chef")) navigate({ to: "/staff/orders" });
      else if (allRoles.includes("driver")) navigate({ to: "/driver" });
      else navigate({ to: "/" });
    }
  };

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
        <Card className="w-full max-w-md p-8">
          <h1 className="text-2xl font-bold">{t("auth.login.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("auth.login.subtitle")}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            {errorMsg && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errorMsg}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t("common.email")}</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("common.password")}</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full gap-2 bg-accent text-accent-foreground hover:bg-accent/90" disabled={loading}>
              {loading ? t("common.loading") : t("common.login")} <Arrow className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 space-y-2 text-center text-sm">
            <p className="text-muted-foreground">{t("auth.no_account")}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/signup/cafeteria" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
                {t("auth.signup_as_cafeteria")}
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link to="/signup/marketer" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
                {t("auth.signup_as_marketer")}
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link to="/signup/driver" className="font-medium text-accent-foreground underline-offset-4 hover:underline">
                {t("auth.signup_as_driver")}
              </Link>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
}
