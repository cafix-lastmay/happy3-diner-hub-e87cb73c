// Feedback dialog — any user (auth or guest) can send complaint/suggestion/issue to app owner.
import { useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/I18nProvider";
import { toast } from "sonner";

type Category = "complaint" | "suggestion" | "operational_issue" | "operational_error";

interface Props {
  /** Trigger variant: 'button' (default), 'icon' (compact), or a custom trigger */
  trigger?: React.ReactNode;
  /** Optional prefilled submitter context (used on public customer pages) */
  defaultRole?: string;
  defaultName?: string;
}

export function FeedbackDialog({ trigger, defaultRole, defaultName }: Props) {
  const { user, roles, refCode } = useAuth();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("suggestion");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [name, setName] = useState(defaultName ?? "");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  const isAr = lang === "ar";
  const submitterRole = defaultRole ?? roles[0] ?? (user ? "user" : "customer");

  const catLabels: Record<Category, string> = isAr
    ? { complaint: "شكوى", suggestion: "اقتراح", operational_issue: "مشكلة تشغيل", operational_error: "خطأ تشغيلي" }
    : { complaint: "Complaint", suggestion: "Suggestion", operational_issue: "Operational issue", operational_error: "Operational error" };

  async function submit() {
    if (!subject.trim() || !message.trim()) {
      toast.error(isAr ? "يرجى ملء الموضوع والرسالة" : "Please fill subject and message");
      return;
    }
    setBusy(true);
    try {
      // Resolve cafeteria_id if user is a cafeteria admin
      let cafeteria_id: string | null = null;
      if (refCode) {
        const { data } = await supabase.from("cafeterias").select("id").eq("ref_code", refCode).maybeSingle();
        cafeteria_id = data?.id ?? null;
      }
      const { error } = await supabase.from("app_feedback").insert({
        user_id: user?.id ?? null,
        submitter_role: submitterRole,
        submitter_name: name.trim() || null,
        submitter_contact: contact.trim() || null,
        cafeteria_id,
        category,
        subject: subject.trim().slice(0, 200),
        message: message.trim().slice(0, 4000),
      });
      if (error) throw error;
      toast.success(isAr ? "تم إرسال ملاحظاتك، شكراً لك!" : "Your feedback has been sent. Thank you!");
      setOpen(false);
      setSubject(""); setMessage(""); setContact("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            {isAr ? "تواصل مع الإدارة" : "Contact admin"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{isAr ? "شكاوى واقتراحات" : "Feedback"}</DialogTitle>
          <DialogDescription>
            {isAr
              ? "أرسل شكوى أو اقتراحاً أو بلّغ عن مشكلة تشغيلية لإدارة التطبيق."
              : "Send a complaint, suggestion, or operational issue to app management."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{isAr ? "الموضوع/النوع" : "Category"}</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="complaint">{catLabels.complaint}</SelectItem>
                <SelectItem value="suggestion">{catLabels.suggestion}</SelectItem>
                <SelectItem value="operational_issue">{catLabels.operational_issue}</SelectItem>
                <SelectItem value="operational_error">{catLabels.operational_error}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{isAr ? "عنوان مختصر" : "Subject"}</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder={isAr ? "مثال: خطأ عند تأكيد الطلب" : "e.g. Error while confirming order"} />
          </div>

          <div className="space-y-1.5">
            <Label>{isAr ? "التفاصيل" : "Details"}</Label>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} placeholder={isAr ? "اكتب رسالتك بالتفصيل..." : "Describe in detail..."} />
          </div>

          {!user && (
            <>
              <div className="space-y-1.5">
                <Label>{isAr ? "اسمك (اختياري)" : "Your name (optional)"}</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? "بريد أو هاتف للتواصل (اختياري)" : "Email or phone (optional)"}</Label>
                <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={100} />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            {isAr ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={submit} disabled={busy} className="gap-2">
            <Send className="h-4 w-4" />
            {busy ? (isAr ? "جارٍ الإرسال..." : "Sending...") : (isAr ? "إرسال" : "Send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
