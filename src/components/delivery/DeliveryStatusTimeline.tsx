// Vertical status timeline for a delivery order.
import { Check, Circle, X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";

export type DeliveryStatus =
  | "pending_assignment"
  | "requested"
  | "accepted"
  | "rejected"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled";

const FLOW: DeliveryStatus[] = ["pending_assignment", "requested", "accepted", "picked_up", "on_the_way", "delivered"];

export function DeliveryStatusTimeline({ status }: { status: DeliveryStatus }) {
  const { t } = useI18n();
  if (status === "cancelled" || status === "rejected") {
    return (
      <div className="flex items-center gap-2 text-destructive text-sm">
        <X className="h-4 w-4" /> {t(`delivery.status.${status}`)}
      </div>
    );
  }
  const idx = FLOW.indexOf(status);
  return (
    <ol className="space-y-1.5 text-sm">
      {FLOW.map((s, i) => {
        const done = i <= idx && idx >= 0;
        const current = i === idx;
        return (
          <li key={s} className={`flex items-center gap-2 ${done ? "text-foreground" : "text-muted-foreground"}`}>
            <span className={`h-5 w-5 rounded-full flex items-center justify-center ${done ? "bg-accent text-accent-foreground" : "bg-muted"}`}>
              {done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
            </span>
            <span className={current ? "font-semibold" : ""}>{t(`delivery.status.${s}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}
