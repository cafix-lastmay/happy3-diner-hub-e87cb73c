import { supabase } from "@/integrations/supabase/client";

export type CafeteriaHome = "/seller" | "/cafeteria/orders";

export async function getCafeteriaHomeForUser(userId: string): Promise<CafeteriaHome> {
  const { data, error } = await supabase
    .from("cafeterias")
    .select("business_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[cafeteria-routing] failed to read business_type", { userId, error: error.message });
  }

  const businessType = (data as { business_type?: string } | null)?.business_type;
  console.info("[cafeteria-routing] resolved dashboard", {
    userId,
    sessionPresent: true,
    business_type: businessType ?? null,
  });

  return businessType === "home_seller" ? "/seller" : "/cafeteria/orders";
}