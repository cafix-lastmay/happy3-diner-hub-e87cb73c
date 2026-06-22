import { supabase } from "@/integrations/supabase/client";

export type CafeteriaHome = "/seller" | "/cafeteria/orders";

export async function getCafeteriaHomeForUser(userId: string): Promise<CafeteriaHome> {
  const { data, error } = await supabase
    .from("cafeterias")
    .select("business_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) console.warn("[cafeteria-routing] failed to read business_type", error.message);

  const businessType = (data as { business_type?: string } | null)?.business_type;
  return businessType === "home_seller" ? "/seller" : "/cafeteria/orders";
}