// Cafeteria admin resets a staff member's password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  staff_user_id: string;
  new_password: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerId = userData.user.id;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: cafe, error: cErr } = await admin.from("cafeterias").select("ref_code").eq("user_id", callerId).maybeSingle();
    if (cErr) throw cErr;
    if (!cafe) {
      return new Response(JSON.stringify({ error: "Only cafeteria admins can reset staff passwords" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body: Body = await req.json();
    if (!body.staff_user_id || !body.new_password || body.new_password.length < 8) {
      return new Response(JSON.stringify({ error: "Missing fields or password too short (min 8)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify staff belongs to this cafeteria
    const { data: staffRow, error: stErr } = await admin
      .from("staff")
      .select("id")
      .eq("user_id", body.staff_user_id)
      .eq("cafeteria_ref_code", cafe.ref_code)
      .maybeSingle();
    if (stErr) throw stErr;
    if (!staffRow) {
      return new Response(JSON.stringify({ error: "Staff not found in your cafeteria" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(body.staff_user_id, {
      password: body.new_password,
    });
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[reset-staff-password]", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
