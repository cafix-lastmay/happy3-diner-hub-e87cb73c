// Route guard: redirects home_seller business_type users away from full_cafe-only pages.
// Defense-in-depth on the client; server-side data access is still protected by RLS.
import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";

export function useRequireFullCafe() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const checked = useRef(false);

  useEffect(() => {
    if (loading || !user || checked.current) return;
    checked.current = true;
    supabase
      .from("cafeterias")
      .select("business_type")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if ((data as { business_type?: string } | null)?.business_type === "home_seller") {
          navigate({ to: "/seller", replace: true });
        }
      });
  }, [loading, user, navigate]);
}
