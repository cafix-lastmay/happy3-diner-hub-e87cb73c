// /cafeteria → home sellers go to /seller, full cafes go to /cafeteria/orders.
// Runs client-only because the redirect depends on the user's Supabase session
// (stored in localStorage), which is not available during SSR.
import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/cafeteria/")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("cafeterias")
          .select("business_type")
          .eq("user_id", user.id)
          .maybeSingle();
        if ((data as { business_type?: string } | null)?.business_type === "home_seller") {
          throw redirect({ to: "/seller" });
        }
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
    throw redirect({ to: "/cafeteria/orders" });
  },
});
