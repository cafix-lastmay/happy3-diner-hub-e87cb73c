// /cafeteria → home sellers go to /seller, full cafes go to /cafeteria/orders.
import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/cafeteria/")({
  beforeLoad: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("cafeterias")
          .select("business_type")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.business_type === "home_seller") {
          throw redirect({ to: "/seller" });
        }
      }
    } catch (e) {
      // If it's a redirect, rethrow
      if (e && typeof e === "object" && "to" in e) throw e;
    }
    throw redirect({ to: "/cafeteria/orders" });
  },
});
