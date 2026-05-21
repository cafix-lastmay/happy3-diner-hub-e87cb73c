// Self-signup for an Independent Driver. Creates auth user + drivers row + user_roles row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  vehicle_type?: string;
  photo_url?: string;
  service_radius_km?: number;
  home_lat?: number;
  home_lng?: number;
  language?: "ar" | "en";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body: Body = await req.json();
    if (!body.email || !body.password || !body.full_name || !body.phone) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Rate limit
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { error: rlErr } = await admin.rpc("check_and_record_signup_attempt", { _ip: ip, _kind: "driver" });
    if (rlErr) {
      const tooMany = rlErr.message?.includes("SIGNUP_RATE_LIMITED");
      return new Response(JSON.stringify({ error: tooMany ? "Too many signup attempts. Please try again later." : "Internal error" }), { status: tooMany ? 429 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    });
    if (cErr) throw cErr;
    const userId = created.user!.id;

    const { data: driver, error: dErr } = await admin.from("drivers").insert({
      user_id: userId,
      kind: "independent",
      full_name: body.full_name,
      phone: body.phone,
      vehicle_type: body.vehicle_type ?? null,
      photo_url: body.photo_url ?? null,
      service_radius_km: body.service_radius_km ?? 5,
      home_lat: body.home_lat ?? null,
      home_lng: body.home_lng ?? null,
      status: "unavailable",
    }).select("id").single();
    if (dErr) throw dErr;

    await admin.from("user_roles").upsert(
      { user_id: userId, role: "driver", entity_ref_code: null },
      { onConflict: "user_id,role" }
    );

    return new Response(JSON.stringify({ ok: true, driver_id: driver.id, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[signup-driver]", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
