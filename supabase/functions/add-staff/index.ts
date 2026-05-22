// Cafeteria admin adds a waiter/chef. Creates auth user + staff row + user_roles row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  email: string;
  password: string;
  full_name: string;
  role: "waiter" | "chef" | "manager" | "driver";
  phone?: string;
  vehicle_type?: string;
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
      return new Response(JSON.stringify({ error: "Only cafeteria admins can add staff" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body: Body = await req.json();
    if (!body.email || !body.password || !body.full_name || !["waiter", "chef", "manager", "driver"].includes(body.role)) {
      return new Response(JSON.stringify({ error: "Missing or invalid fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (body.password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name },
    });
    if (createErr) throw createErr;
    const newUserId = created.user!.id;

    // Defensive: ensure profile row exists (in addition to on_auth_user_created trigger)
    await admin.from("profiles").upsert(
      { id: newUserId, full_name: body.full_name, email: body.email },
      { onConflict: "id" }
    );

    if (body.role === "driver") {
      const { error: dErr } = await admin.from("drivers").insert({
        user_id: newUserId,
        kind: "staff",
        cafeteria_ref_code: cafe.ref_code,
        full_name: body.full_name,
        phone: body.phone ?? null,
        vehicle_type: body.vehicle_type ?? null,
        status: "unavailable",
      });
      if (dErr) throw dErr;
    } else {
      const { error: sErr } = await admin.from("staff").insert({
        user_id: newUserId,
        cafeteria_ref_code: cafe.ref_code,
        role: body.role,
      });
      if (sErr) throw sErr;
    }

    await admin.from("user_roles").upsert(
      { user_id: newUserId, role: body.role, entity_ref_code: cafe.ref_code },
      { onConflict: "user_id,role" }
    );

    return new Response(JSON.stringify({ ok: true, user_id: newUserId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[add-staff]", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
