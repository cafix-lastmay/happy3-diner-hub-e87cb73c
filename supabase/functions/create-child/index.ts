// Owner or Marketer creates a child Marketer or Cafeteria. Inherits country/currency/language from parent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  entity_type: "marketer" | "cafeteria";
  email: string; password: string; name: string;
  // For Owner only: required when creating a level-2 marketer (Owner's first generation):
  override_country_code?: string;
  override_currency_code?: string;
  override_language?: "ar" | "en";
  // Owner-only: optionally assign a new cafeteria under a specific marketer ref code.
  parent_ref_code?: string;
  address?: string; phone?: string; whatsapp?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes, error: uErr } = await userClient.auth.getUser();
    if (uErr || !userRes.user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const callerId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    // Determine caller's marketer record (Owner is also a marketer with ref_code "10")
    const { data: caller } = await admin.from("marketers").select("*").eq("user_id", callerId).maybeSingle();
    if (!caller) return new Response(JSON.stringify({ error: "Caller is not a marketer/owner" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body: Body = await req.json();
    if (!body.email || !body.password || !body.name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const isOwner = caller.ref_code === "10";

    if (body.entity_type === "marketer") {
      // Marketers can only be created up to level 4
      if (caller.level >= 4) return new Response(JSON.stringify({ error: "Cannot create marketer below level 4" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: refCode, error: rErr } = await admin.rpc("generate_ref_code", { _parent_ref_code: caller.ref_code, _entity_type: "marketer" });
      if (rErr) throw rErr;

      // Inherit unless Owner provides overrides for first generation
      const country = isOwner && body.override_country_code ? body.override_country_code : caller.country_code;
      const currency = isOwner && body.override_currency_code ? body.override_currency_code : caller.currency_code;
      const language = isOwner && body.override_language ? body.override_language : caller.language;

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email: body.email, password: body.password, email_confirm: true, user_metadata: { full_name: body.name },
      });
      if (cErr) throw cErr;
      const newUserId = created.user!.id;

      const { error: mErr } = await admin.from("marketers").insert({
        user_id: newUserId, ref_code: refCode, parent_ref_code: caller.ref_code,
        level: caller.level + 1, signup_type: "created_by_parent", name: body.name,
        country_code: country, currency_code: currency, language,
        address: body.address, phone: body.phone, whatsapp: body.whatsapp, email: body.email,
      });
      if (mErr) throw mErr;
      await admin.from("user_roles").upsert({ user_id: newUserId, role: "marketer", entity_ref_code: refCode as string }, { onConflict: "user_id,role" });
      return new Response(JSON.stringify({ ok: true, ref_code: refCode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // CAFETERIA
    // Owner may assign the cafeteria under a specific marketer via parent_ref_code.
    let parentForCafe = caller;
    if (isOwner && body.parent_ref_code && body.parent_ref_code.trim() !== "" && body.parent_ref_code.trim() !== caller.ref_code) {
      const { data: m, error: mLookupErr } = await admin.from("marketers").select("*").eq("ref_code", body.parent_ref_code.trim()).maybeSingle();
      if (mLookupErr) throw mLookupErr;
      if (!m) return new Response(JSON.stringify({ error: "Marketer ref code not found" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      parentForCafe = m;
    }
    const { data: refCode, error: rErr } = await admin.rpc("generate_ref_code", { _parent_ref_code: parentForCafe.ref_code, _entity_type: "cafeteria" });
    if (rErr) throw rErr;
    const country = isOwner && body.override_country_code ? body.override_country_code : parentForCafe.country_code;
    const currency = isOwner && body.override_currency_code ? body.override_currency_code : parentForCafe.currency_code;
    const language = isOwner && body.override_language ? body.override_language : parentForCafe.language;

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: body.email, password: body.password, email_confirm: true, user_metadata: { full_name: body.name },
    });
    if (cErr) throw cErr;
    const newUserId = created.user!.id;

    const { error: caErr } = await admin.from("cafeterias").insert({
      user_id: newUserId, ref_code: refCode, parent_ref_code: caller.ref_code, signup_type: "created_by_parent",
      name: body.name, country_code: country, currency_code: currency, language,
      address: body.address, phone: body.phone, whatsapp: body.whatsapp, email: body.email,
    });
    if (caErr) throw caErr;
    await admin.from("user_roles").upsert({ user_id: newUserId, role: "cafeteria_admin", entity_ref_code: refCode as string }, { onConflict: "user_id,role" });
    return new Response(JSON.stringify({ ok: true, ref_code: refCode }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[create-child]", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
