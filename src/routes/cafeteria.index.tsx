// /cafeteria → home sellers go to /seller, full cafes go to /cafeteria/orders.
// Runs client-only because the redirect depends on the user's Supabase session
// (stored in localStorage), which is not available during SSR.
import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getCafeteriaHomeForUser } from "@/auth/cafeteriaRouting";

export const Route = createFileRoute("/cafeteria/")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        throw redirect({ to: await getCafeteriaHomeForUser(user.id) });
      }
    } catch (e) {
      if (isRedirect(e)) throw e;
    }
    throw redirect({ to: "/cafeteria/orders" });
  },
});
