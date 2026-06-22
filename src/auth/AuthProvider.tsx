// Auth context: tracks Supabase session + user role + entity ref_code.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "owner" | "marketer" | "cafeteria_admin" | "manager" | "waiter" | "chef" | "driver";

interface AuthState {
  session: Session | null;
  user: User | null;
  roles: Role[];
  refCode: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [refCode, setRefCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const loadRoleData = async (uid: string) => {
    const { data: rolesData } = await supabase.from("user_roles").select("role,entity_ref_code").eq("user_id", uid);
    const userRoles = (rolesData ?? []).map((r) => r.role as Role);
    setRoles(userRoles);
    const code = rolesData?.[0]?.entity_ref_code ?? null;
    setRefCode(code);
  };

  useEffect(() => {
    const applySession = (sess: Session | null, verifiedUser?: User | null) => {
      const seq = ++loadSeq.current;
      const nextUser = sess?.user ?? verifiedUser ?? null;
      setSession(sess);
      setUser(nextUser);
      setRoles([]);
      setRefCode(null);

      if (!nextUser) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setTimeout(() => {
        loadRoleData(nextUser.id).finally(() => {
          if (loadSeq.current === seq) setLoading(false);
        });
      }, 0);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "INITIAL_SESSION" && sess === null) return;
      applySession(sess);
    });

    Promise.all([supabase.auth.getSession(), supabase.auth.getUser()]).then(([sessionRes, userRes]) => {
      applySession(sessionRes.data.session, userRes.data.user);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refresh = async () => {
    if (user) await loadRoleData(user.id);
  };

  return (
    <AuthContext.Provider value={{ session, user, roles, refCode, loading, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
