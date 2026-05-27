// Permanently deletes the calling user's auth account and removes their push tokens
// + notification rows. Required for App Store compliance (5.1.1(v)).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "غير مصرح، يرجى تسجيل الدخول" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return new Response(JSON.stringify({ error: "غير مصرح، يرجى تسجيل الدخول" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    await admin.from("push_tokens").delete().eq("user_id", user.id);
    await admin.from("notifications").delete().eq("user_id", user.id);
    await admin.from("notification_preferences").delete().eq("user_id", user.id);

    const { error: dErr } = await admin.auth.admin.deleteUser(user.id);
    if (dErr) throw dErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[delete-account]", e);
    return new Response(JSON.stringify({ error: "تعذّر حذف الحساب، حاول مرة أخرى" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
