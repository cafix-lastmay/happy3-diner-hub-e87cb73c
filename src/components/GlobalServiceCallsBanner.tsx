// Global service calls banner — mounted in the cafeteria DashboardShell so that
// waiter/manager/cafeteria_admin see incoming calls from any internal page.
// Compact, non-blocking, mobile-friendly. No-op for chef/owner/marketer or when
// the user has no cafeteria scope.
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { ServiceCallsBanner, type ServiceCallKind } from "@/components/ServiceCallsListener";

export function GlobalServiceCallsBanner() {
  const { roles, refCode } = useAuth();
  const [resolvedRef, setResolvedRef] = useState<string | null>(null);

  // Determine which kinds this user should receive.
  // - waiter:        customer waiter/cleaner + chef→waiter
  // - manager/admin: customer waiter/cleaner + waiter→manager
  // - chef/others:   none (chef triggers calls but doesn't receive operational ones)
  let acceptKinds: ServiceCallKind[] = [];
  if (roles.includes("waiter")) acceptKinds = ["waiter", "cleaner"];
  else if (roles.includes("manager") || roles.includes("cafeteria_admin"))
    acceptKinds = ["waiter", "cleaner", "manager"];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (acceptKinds.length === 0) { setResolvedRef(null); return; }
      // cafeteria_admin already has refCode in auth context
      if (roles.includes("cafeteria_admin") && refCode) { setResolvedRef(refCode); return; }
      // staff/manager: resolve via RPC
      const rpc = roles.includes("manager") ? "get_my_manager_cafeteria_ref" : "get_my_staff_cafeteria_ref";
      const { data } = await supabase.rpc(rpc);
      if (!cancelled) setResolvedRef((data as string | null) ?? null);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles.join(","), refCode]);

  if (!resolvedRef || acceptKinds.length === 0) return null;
  return (
    <div className="sticky top-0 lg:top-16 z-20 px-4 md:px-6 lg:px-8 pt-2">
      <ServiceCallsBanner cafeteriaRefCode={resolvedRef} acceptKinds={acceptKinds} />
    </div>
  );
}
