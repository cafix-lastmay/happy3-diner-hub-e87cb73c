// Owner feedback inbox: review all complaints & suggestions from users.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/i18n/I18nProvider";
import { useRequireRole } from "@/auth/useRequireRole";
import { Redirecting } from "@/auth/Redirecting";
import { supabase } from "@/integrations/supabase/client";
import { ownerNavItems } from "@/components/owner/ownerNav";
import { toast } from "sonner";

export const Route = createFileRoute("/owner/feedback")({ component: OwnerFeedback });

type Category = "complaint" | "suggestion" | "operational_issue" | "operational_error";
type Status = "new" | "in_review" | "resolved" | "closed";

interface Row {
  id: string;
  user_id: string | null;
  submitter_role: string | null;
  submitter_name: string | null;
  submitter_contact: string | null;
  cafeteria_id: string | null;
  category: Category;
  subject: string;
  message: string;
  status: Status;
  owner_notes: string | null;
  created_at: string;
}

function OwnerFeedback() {
  const { t, lang } = useI18n();
  const { ready } = useRequireRole("owner");
  const isAr = lang === "ar";
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<Category | "all">("all");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const catLabels: Record<Category, string> = isAr
    ? { complaint: "شكوى", suggestion: "اقتراح", operational_issue: "مشكلة تشغيل", operational_error: "خطأ تشغيلي" }
    : { complaint: "Complaint", suggestion: "Suggestion", operational_issue: "Operational issue", operational_error: "Operational error" };
  const statusLabels: Record<Status, string> = isAr
    ? { new: "جديد", in_review: "قيد المراجعة", resolved: "تم الحل", closed: "مغلق" }
    : { new: "New", in_review: "In review", resolved: "Resolved", closed: "Closed" };
  const catColor: Record<Category, string> = {
    complaint: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    suggestion: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    operational_issue: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    operational_error: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  };
  const statusColor: Record<Status, string> = {
    new: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    in_review: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/30",
    resolved: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
    closed: "bg-neutral-500/15 text-neutral-700 dark:text-neutral-300 border-neutral-500/30",
  };

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("app_feedback").select("*").order("created_at", { ascending: false }).limit(500);
    if (filterCat !== "all") q = q.eq("category", filterCat);
    if (filterStatus !== "all") q = q.eq("status", filterStatus);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    else setRows((data as Row[]) ?? []);
    setLoading(false);
  }, [filterCat, filterStatus]);

  useEffect(() => { if (ready) void load(); }, [ready, load]);

  async function updateStatus(id: string, status: Status) {
    const { error } = await supabase.from("app_feedback").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(isAr ? "تم التحديث" : "Updated");
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  async function saveNotes(id: string) {
    const owner_notes = notesDraft[id] ?? "";
    const { error } = await supabase.from("app_feedback").update({ owner_notes }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(isAr ? "تم حفظ الملاحظة" : "Notes saved");
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, owner_notes } : r)));
  }

  if (!ready) return <Redirecting />;

  return (
    <DashboardShell title={isAr ? "الشكاوى والاقتراحات" : "Feedback"} navItems={ownerNavItems(t)}>
      <div className="space-y-4" dir={isAr ? "rtl" : "ltr"}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageCircle className="h-6 w-6" />
            {isAr ? "الشكاوى والاقتراحات" : "Feedback Inbox"}
          </h1>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterCat} onValueChange={(v) => setFilterCat(v as Category | "all")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "كل الأنواع" : "All categories"}</SelectItem>
                <SelectItem value="complaint">{catLabels.complaint}</SelectItem>
                <SelectItem value="suggestion">{catLabels.suggestion}</SelectItem>
                <SelectItem value="operational_issue">{catLabels.operational_issue}</SelectItem>
                <SelectItem value="operational_error">{catLabels.operational_error}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as Status | "all")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? "كل الحالات" : "All statuses"}</SelectItem>
                <SelectItem value="new">{statusLabels.new}</SelectItem>
                <SelectItem value="in_review">{statusLabels.in_review}</SelectItem>
                <SelectItem value="resolved">{statusLabels.resolved}</SelectItem>
                <SelectItem value="closed">{statusLabels.closed}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {isAr ? "تحديث" : "Refresh"}
            </Button>
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground">{isAr ? "جارٍ التحميل..." : "Loading..."}</p>}
        {!loading && rows.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            {isAr ? "لا توجد رسائل بعد." : "No feedback yet."}
          </Card>
        )}

        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={catColor[r.category]}>{catLabels[r.category]}</Badge>
                    <Badge variant="outline" className={statusColor[r.status]}>{statusLabels[r.status]}</Badge>
                    {r.submitter_role && <Badge variant="secondary">{r.submitter_role}</Badge>}
                  </div>
                  <h3 className="font-semibold">{r.subject}</h3>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString(isAr ? "ar" : "en")}
                    {r.submitter_name && ` • ${r.submitter_name}`}
                    {r.submitter_contact && ` • ${r.submitter_contact}`}
                  </p>
                </div>
                <Select value={r.status} onValueChange={(v) => updateStatus(r.id, v as Status)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">{statusLabels.new}</SelectItem>
                    <SelectItem value="in_review">{statusLabels.in_review}</SelectItem>
                    <SelectItem value="resolved">{statusLabels.resolved}</SelectItem>
                    <SelectItem value="closed">{statusLabels.closed}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm whitespace-pre-wrap bg-muted/40 p-3 rounded-md">{r.message}</p>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{isAr ? "ملاحظات المالك" : "Owner notes"}</label>
                <Textarea
                  rows={2}
                  defaultValue={r.owner_notes ?? ""}
                  onChange={(e) => setNotesDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                />
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => saveNotes(r.id)}>
                    {isAr ? "حفظ الملاحظة" : "Save notes"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
