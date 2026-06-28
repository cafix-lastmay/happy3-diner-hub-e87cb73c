// Small inline placeholder shown while useRequireRole / useRequireFullCafe
// redirects an unauthorized user. Avoids the "white page" gap between the
// access check resolving and the navigation actually flushing.
import { Loader2 } from "lucide-react";

export function Redirecting() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin me-2" />
      <span className="text-sm">جارٍ التحويل…</span>
    </div>
  );
}
