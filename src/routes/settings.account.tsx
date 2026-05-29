import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ShieldAlert, Trash2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { toast } from "sonner";
import { extractEdgeError } from "@/lib/edge-error";
import { BottomNav } from "@/components/layouts/BottomNav";
import { MobileHeader } from "@/components/layouts/MobileHeader";

export const Route = createFileRoute("/settings/account")({
  component: AccountSettingsPage,
});

function AccountSettingsPage() {
  const { user, loading, roles } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && !user) {
    router.navigate({ to: "/login" });
    return null;
  }

  const handleDelete = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error || (data as { error?: string })?.error) {
        const msg = await extractEdgeError(error, data, t("common.error"));
        throw new Error(msg);
      }
      await supabase.auth.signOut();
      toast.success(t("account.deleted"));
      router.navigate({ to: "/" });
    } catch (e) {
      toast.error((e as Error).message ?? t("common.error"));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader title={t("account.title")} />
      <header className="hidden md:block sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex items-center gap-2 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => router.history.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">{t("account.title")}</h1>
        </div>
      </header>
      <main className="container mx-auto max-w-xl px-4 py-6 space-y-4 pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-6">
        <Card className="p-4">
          <div className="text-sm">
            <p className="text-muted-foreground">{t("common.email")}</p>
            <p className="font-medium">{user?.email}</p>
          </div>
        </Card>

        <ChangePasswordCard email={user?.email ?? ""} />


        <Card className="border-destructive/40 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="font-semibold text-destructive">{t("account.delete.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("account.delete.desc")}
              </p>
              <Button
                variant="destructive"
                className="mt-4 gap-2"
                onClick={() => setConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                {t("account.delete.cta")}
              </Button>
            </div>
          </div>
        </Card>

        <p className="text-xs text-muted-foreground">
          <Link to="/privacy" className="underline">{t("footer.privacy")}</Link>
          {" · "}
          <Link to="/terms" className="underline">{t("footer.terms")}</Link>
        </p>
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("account.delete.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("account.delete.confirm.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>{t("account.delete.confirm.type")}</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || confirmText.trim().toUpperCase() !== "DELETE"}
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? t("common.loading") : t("account.delete.cta")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <BottomNav role={(roles[0] as any) ?? null} />
    </div>
  );
}

function ChangePasswordCard({ email }: { email: string }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email) return;
    if (next.length < 6) { toast.error(t("password.too_short")); return; }
    if (next !== confirm) { toast.error(t("password.mismatch")); return; }
    setBusy(true);
    try {
      const { error: verifyErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (verifyErr) { toast.error(t("password.current_wrong")); return; }
      const { error: updErr } = await supabase.auth.updateUser({ password: next });
      if (updErr) { toast.error(updErr.message); return; }
      toast.success(t("password.changed"));
      setCurrent(""); setNext(""); setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="h-5 w-5 text-accent shrink-0 mt-0.5" />
        <div className="flex-1 space-y-3">
          <div>
            <h2 className="font-semibold">{t("password.title")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("password.desc")}</p>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs">{t("password.current")}</Label>
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </div>
            <div>
              <Label className="text-xs">{t("password.new")}</Label>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </div>
            <div>
              <Label className="text-xs">{t("password.confirm")}</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <Button onClick={submit} disabled={busy || !current || !next || !confirm} className="w-full sm:w-auto">
            {busy ? t("common.loading") : t("password.save")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
