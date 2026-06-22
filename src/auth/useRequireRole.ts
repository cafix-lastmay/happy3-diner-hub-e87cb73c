// Frontend route guard.
//
// SECURITY NOTE: this hook is defense-in-depth ONLY. The authoritative access
// control lives in the database (RLS policies + SECURITY DEFINER RPCs that
// check `has_role(auth.uid(), 'owner')`, etc.). Even if this hook is bypassed
// (e.g. a hand-crafted client), the backend will refuse to return privileged
// data or run privileged actions.
//
// What this hook guarantees on the client:
//   • returns `ready=false` until both the session AND the user's roles have
//     finished loading (no flash of protected UI),
//   • redirects unauthorized users to a safe page for their role (or `/login`
//     if not signed in, or `/` if they have no roles at all),
//   • fires a best-effort audit log entry on the server when an authenticated
//     user tries to open a route they are not allowed to see.
//
// Routes consume this with the standard pattern:
//   const { ready } = useRequireRole("owner");
//   if (!ready) return null;
import { useEffect, useRef } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth, type Role } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { getCafeteriaHomeForUser } from "@/auth/cafeteriaRouting";

async function safeHomeForRoles(roles: Role[], userId: string | null): Promise<string> {
  if (roles.includes("owner")) return "/owner";
  if (roles.includes("marketer")) return "/marketer";
  if (roles.includes("cafeteria_admin") && userId) return getCafeteriaHomeForUser(userId);
  if (roles.includes("manager")) return "/manager";
  if (roles.includes("waiter") || roles.includes("chef")) return "/staff/orders";
  if (roles.includes("driver")) return "/driver";
  return "/";
}

export function useRequireRole(required: Role | Role[]) {
  const { session, user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const requiredArr = Array.isArray(required) ? required : [required];
  const ok = requiredArr.some((r) => roles.includes(r));
  const loggedRef = useRef(false);

  useEffect(() => {
    if (loading) return;

    // Not authenticated → login.
    if (!session) {
      navigate({ to: "/login" });
      return;
    }

    // Authenticated and authorized → nothing to do.
    if (ok) return;

    // Authenticated but roles haven't finished loading yet.
    // AuthProvider sets roles asynchronously after onAuthStateChange; give it
    // one render to settle. If after that the user still has no roles, we
    // still redirect (no role = no app access beyond `/`).
    // We track this with a ref so the redirect only fires once per mount.
    if (loggedRef.current) return;
    loggedRef.current = true;

    // Best-effort server-side audit. Ignore errors — the redirect is what
    // actually protects the user; the log is observability.
    void supabase
      .rpc("log_unauthorized_access", {
        _path: pathname,
        _attempted_roles: requiredArr as unknown as string[],
      })
      .then(() => undefined, () => undefined);

    void safeHomeForRoles(roles, user?.id ?? null).then((to) => navigate({ to, replace: true }));
  }, [loading, session, user, roles, ok, navigate, pathname]);

  return { ready: !loading && !!session && ok };
}
