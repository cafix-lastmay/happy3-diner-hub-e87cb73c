import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, Coffee, Wallet, Percent, Banknote, Check, X, ArrowRight, ArrowLeft, FileText, ImageOff } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/recharges/$id")({
  component: RechargeDetail,
});

interface Detail {
  id: string;
  cafeteria_ref_code: string;
  amount_usd: number;
  points_to_credit: number;
  local_currency: string;
  exchange_rate_to_usd: number;
  receipt_url: string;
  status: string;
  created_at: string;
  notes: string | null;
  cafe_name?: string;
  cafe_country?: string;
  cafe_currency?: string;
  cafe_language?: string;
  cafe_phone?: string;
  cafe_email?: string;
}

function RechargeDetail() {
  const { t, lang } = useI18n();
  const { ready } = useRequireRole("owner");
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [r, setR] = useState<Detail | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [pointsInput, setPointsInput] = useState("");

  const load = async () => {
    const { data, error } = await supabase
      .from("recharge_requests")
      .select("*, cafeterias!inner(name, country_code, currency_code, language, phone, email)")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) { toast.error(error?.message ?? "Not found"); return; }
    const cafe = (data as any).cafeterias;
    const detail: Detail = {
      ...(data as any),
      cafe_name: cafe?.name,
      cafe_country: cafe?.country_code,
      cafe_currency: cafe?.currency_code,
      cafe_language: cafe?.language,
      cafe_phone: cafe?.phone,
      cafe_email: cafe?.email,
    };
    setR(detail);
    setPointsInput(String(Math.round(Number(detail.points_to_credit) || 0)));
    setImgError(false);
    const { data: signed } = await supabase.storage.from("recharge-receipts").createSignedUrl((data as any).receipt_url, 600);
    setSignedUrl(signed?.signedUrl ?? null);
  };
  useEffect(() => { if (ready) load(); }, [ready, id]);

  const openApprove = () => {
    if (!r) return;
    if (!pointsInput) setPointsInput(String(Math.round(Number(r.points_to_credit) || 0)));
    setApproveOpen(true);
  };

  const confirmApprove = async () => {
    const points = parseInt(pointsInput, 10);
    if (!points || points <= 0 || isNaN(points)) {
      toast.error(t("error.required_field") || "Enter a valid number of points");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("approve_recharge_with_points", { _recharge_id: id, _points: points });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t("common.success"));
    setApproveOpen(false);
    navigate({ to: "/owner/recharges" });
  };

  const reject = async () => {
    if (!confirm(t("common.confirm"))) return;
    setBusy(true);
    const { error } = await supabase.rpc("reject_recharge", { _recharge_id: id, _notes: "Rejected by owner" });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success(t("common.success")); navigate({ to: "/owner/recharges" }); }
  };

  if (!ready) return <Redirecting />;
  const navItems = [
    { to: "/owner", label: t("owner.nav.overview"), icon: LayoutDashboard },
    { to: "/owner/marketers", label: t("owner.nav.marketers"), icon: Users },
    { to: "/owner/cafeterias", label: t("owner.nav.cafeterias"), icon: Coffee },
    { to: "/owner/recharges", label: t("owner.nav.recharges"), icon: Wallet },
    { to: "/owner/commissions", label: t("owner.nav.commissions"), icon: Percent },
    { to: "/owner/withdrawals", label: t("owner.nav.withdrawals"), icon: Banknote },
  ];
  const BackIcon = lang === "ar" ? ArrowLeft : ArrowRight;
  const isPdf = (r?.receipt_url || "").toLowerCase().endsWith(".pdf");

  return (
    <DashboardShell title={t("owner.dashboard.title")} navItems={navItems}>
      <Button asChild variant="ghost" className="mb-4">
        <Link to="/owner/recharges"><BackIcon className="h-4 w-4 me-1" /> {t("common.back") || "Back"}</Link>
      </Button>

      {!r ? <p className="text-muted-foreground">{t("common.loading")}</p> : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="text-lg font-bold mb-4">{t("recharge.detail.title") || "Recharge Details"}</h2>
            <dl className="space-y-3 text-sm">
              <Row label={t("common.status")}>
                <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>{t(`status.${r.status}`)}</Badge>
              </Row>
              <Row label={t("common.date")}>{new Date(r.created_at).toLocaleString()}</Row>
              <Row label="USD">${Number(r.amount_usd).toFixed(2)}</Row>
              <Row label={t("common.points")}>{Math.round(Number(r.points_to_credit))} {r.local_currency}</Row>
              <Row label={t("recharge.detail.rate") || "Exchange Rate"}>{Number(r.exchange_rate_to_usd).toFixed(4)}</Row>
              {r.notes && <Row label={t("common.notes") || "Notes"}>{r.notes}</Row>}
            </dl>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-bold mb-4">{t("recharge.detail.cafe") || "Cafeteria Info"}</h2>
            <dl className="space-y-3 text-sm">
              <Row label={t("common.name") || "Name"}>{r.cafe_name ?? "—"}</Row>
              <Row label={t("common.ref_code") || "Ref Code"}><span className="font-mono">{r.cafeteria_ref_code}</span></Row>
              <Row label={t("common.country") || "Country"}>{r.cafe_country ?? "—"}</Row>
              <Row label={t("common.currency") || "Currency"}>{r.cafe_currency ?? "—"}</Row>
              <Row label={t("common.language") || "Language"}>{r.cafe_language ?? "—"}</Row>
              <Row label={t("common.phone") || "Phone"}>{r.cafe_phone ?? "—"}</Row>
              <Row label={t("common.email") || "Email"}>{r.cafe_email ?? "—"}</Row>
            </dl>
          </Card>

          <Card className="p-6 lg:col-span-2">
            <h2 className="text-lg font-bold mb-4">{t("recharge.detail.receipt") || "Receipt"}</h2>
            {!signedUrl ? (
              <p className="text-muted-foreground">—</p>
            ) : isPdf ? (
              <div className="flex flex-col items-center gap-3">
                <object data={signedUrl} type="application/pdf" className="w-full h-[600px] rounded border border-border">
                  <a href={signedUrl} target="_blank" rel="noreferrer" className="text-primary underline flex items-center gap-2">
                    <FileText className="h-4 w-4" /> {t("common.open") || "Open file"}
                  </a>
                </object>
                <Button asChild variant="outline" size="sm">
                  <a href={signedUrl} target="_blank" rel="noreferrer"><FileText className="h-4 w-4 me-1" /> {t("common.open") || "Open in new tab"}</a>
                </Button>
              </div>
            ) : imgError ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <ImageOff className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("common.image_failed") || "Could not display preview"}</p>
                <Button asChild variant="outline" size="sm">
                  <a href={signedUrl} target="_blank" rel="noreferrer"><FileText className="h-4 w-4 me-1" /> {t("common.open") || "Open file"}</a>
                </Button>
              </div>
            ) : (
              <a href={signedUrl} target="_blank" rel="noreferrer" className="block">
                <img
                  src={signedUrl}
                  alt="receipt"
                  className="max-h-[600px] w-auto mx-auto rounded border border-border object-contain"
                  onError={() => setImgError(true)}
                />
              </a>
            )}
          </Card>

          {r.status === "pending" && (
            <div className="lg:col-span-2 flex gap-3 justify-end">
              <Button variant="destructive" onClick={reject} disabled={busy}><X className="h-4 w-4 me-1" /> {t("common.reject") || "Reject"}</Button>
              <Button onClick={openApprove} disabled={busy} className="bg-accent text-accent-foreground hover:bg-accent/90"><Check className="h-4 w-4 me-1" /> {t("common.approve") || "Approve"}</Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("recharge.approve.title") || "تأكيد قبول الشحن"}</DialogTitle>
          </DialogHeader>
          {r && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2">
                <SummaryRow label={t("common.name") || "الكافيتريا"} value={r.cafe_name ?? "—"} />
                <SummaryRow label={t("common.country") || "البلد"} value={r.cafe_country ?? "—"} />
                <SummaryRow label={t("common.ref_code") || "الرقم المرجعي"} value={<span className="font-mono">{r.cafeteria_ref_code}</span>} />
                <SummaryRow label={t("recharge.amount_paid") || "المبلغ المدفوع"} value={`$${Number(r.amount_usd).toFixed(2)}`} />
                <SummaryRow label="سعر الصرف" value={`1 USD = ${Number(r.exchange_rate_to_usd).toFixed(4)} ${r.local_currency}`} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="points">النقاط المحسوبة (تلقائي)</Label>
                <Input
                  id="points"
                  type="text"
                  value={`${Number(pointsInput || 0).toLocaleString("en-US")} نقطة`}
                  readOnly
                  disabled
                  className="text-lg font-bold bg-muted text-violet cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">
                  محسوبة تلقائياً: المبلغ × معامل التحويل × سعر الصرف
                </p>
              </div>
              <div className="rounded-md bg-accent/10 border border-accent/30 p-3 text-sm">
                <SummaryRow
                  label="سيُضاف إلى رصيد الكافيتريا"
                  value={<span className="font-bold text-accent text-base">{Number(pointsInput || 0).toLocaleString("en-US")} نقطة</span>}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={busy}>{t("common.cancel") || "إلغاء"}</Button>
            <Button onClick={confirmApprove} disabled={busy || !pointsInput || Number(pointsInput) <= 0} className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Check className="h-4 w-4 me-1" /> {t("common.approve") || "اعتماد الشحن"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-end">{children}</dd>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-end">{value}</span>
    </div>
  );
}
