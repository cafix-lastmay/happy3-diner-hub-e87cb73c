// Self-signup for a Cafeteria. Default parent is Owner (10) → ref_code 10B0001..10B9999.
// If a valid referral_code (active marketer) is provided, that marketer becomes the parent
// and a child cafeteria ref_code is generated under them (parent_code + B + 2 digits).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  email: string; password: string; name: string;
  country_code: string; currency_code: string; language: "ar" | "en";
  address?: string; phone?: string; whatsapp?: string;
  referral_code?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body: Body = await req.json();
    if (!body.email || !body.password || !body.name || !body.country_code || !body.currency_code) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });

    // Rate limit by client IP (5/hour, 20/day)
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { error: rlErr } = await admin.rpc("check_and_record_signup_attempt", { _ip: ip, _kind: "cafeteria" });
    if (rlErr) {
      const tooMany = rlErr.message?.includes("SIGNUP_RATE_LIMITED");
      return new Response(JSON.stringify({ error: tooMany ? "Too many signup attempts. Please try again later." : "Internal error" }), { status: tooMany ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let parentRef = "10";
    let entityType = "cafeteria_self";
    const refRaw = (body.referral_code ?? "").trim().toUpperCase();
    if (refRaw) {
      const { data: parent } = await admin.from("marketers").select("ref_code, is_active").eq("ref_code", refRaw).maybeSingle();
      if (!parent || !parent.is_active) {
        return new Response(JSON.stringify({ error: "Invalid referral code" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      parentRef = parent.ref_code;
      entityType = "cafeteria"; // child cafeteria under that marketer (parent + B + 2 digits)
    }

    const { data: refCodeRes, error: refErr } = await admin.rpc("generate_ref_code", { _parent_ref_code: parentRef, _entity_type: entityType });
    if (refErr) throw refErr;
    const ref_code = refCodeRes as string;

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: body.email, password: body.password, email_confirm: true,
      user_metadata: { full_name: body.name },
    });
    if (cErr) throw cErr;
    const userId = created.user!.id;

    const { error: caErr } = await admin.from("cafeterias").insert({
      user_id: userId, ref_code, parent_ref_code: parentRef, signup_type: "self_signup",
      name: body.name, country_code: body.country_code, currency_code: body.currency_code,
      language: body.language ?? "ar", address: body.address, phone: body.phone, whatsapp: body.whatsapp, email: body.email,
    });
    if (caErr) throw caErr;

    await admin.from("user_roles").upsert({ user_id: userId, role: "cafeteria_admin", entity_ref_code: ref_code }, { onConflict: "user_id,role" });

    return new Response(JSON.stringify({ ok: true, ref_code, user_id: userId, parent_ref_code: parentRef }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[signup-cafeteria]", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
