// One-time owner seed: creates the Owner auth user (ref_code = 10) using OWNER_EMAIL/OWNER_PASSWORD secrets.
// Protected by a pre-shared SEED_SECRET header to prevent unauthenticated probing/triggering.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-seed-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SEED_SECRET = Deno.env.get("SEED_SECRET");
    const provided = req.headers.get("x-seed-secret");
    if (!SEED_SECRET || !provided || provided !== SEED_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL");
    const OWNER_PASSWORD = Deno.env.get("OWNER_PASSWORD");

    if (!OWNER_EMAIL || !OWNER_PASSWORD) {
      return new Response(JSON.stringify({ error: "OWNER_EMAIL/OWNER_PASSWORD not set" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: existing } = await admin.from("marketers").select("id,user_id,ref_code").eq("ref_code", "10").maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, message: "Owner already seeded", ref_code: "10" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userId: string | null = null;
    const { data: list } = await admin.auth.admin.listUsers();
    const found = list?.users?.find((u) => u.email?.toLowerCase() === OWNER_EMAIL.toLowerCase());
    if (found) {
      userId = found.id;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Platform Owner" },
      });
      if (createErr) throw createErr;
      userId = created.user!.id;
    }

    const { error: mErr } = await admin.from("marketers").insert({
      user_id: userId,
      ref_code: "10",
      parent_ref_code: null,
      level: 1,
      signup_type: "created_by_parent",
      name: "Platform Owner",
      language: "ar",
    });
    if (mErr) throw mErr;

    await admin.from("user_roles").upsert({ user_id: userId, role: "owner", entity_ref_code: "10" }, { onConflict: "user_id,role" });

    return new Response(JSON.stringify({ ok: true, message: "Owner seeded", ref_code: "10", user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[seed-owner]", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
