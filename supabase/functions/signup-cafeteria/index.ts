// Self-signup for a Cafeteria. Default parent is Owner (10) → ref_code 10B0001..10B9999.
// If a valid referral_code (active marketer) is provided, that marketer becomes the parent
// and a child cafeteria ref_code is generated under them (parent_code + B + 2 digits).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Body {
  email: string; password: string; name: string;
  country_code: string; currency_code: string; language: "ar" | "en";
  address?: string; phone?: string; whatsapp?: string;
  referral_code?: string;
  business_type?: "full_cafe" | "home_seller";
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body: Body = await req.json();
    if (!body.email || !body.password || !body.name || !body.country_code || !body.currency_code) {
      return json(400, { error: "يرجى تعبئة جميع الحقول المطلوبة" });
    }
    if (body.password.length < 8) {
      return json(400, { error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });

    // Rate limit by client IP (5/hour, 20/day)
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { error: rlErr } = await admin.rpc("check_and_record_signup_attempt", { _ip: ip, _kind: "cafeteria" });
    if (rlErr) {
      const tooMany = rlErr.message?.includes("SIGNUP_RATE_LIMITED");
      return json(tooMany ? 429 : 500, { error: tooMany ? "عدد محاولات التسجيل تجاوز الحد، حاول لاحقاً" : "حدث خطأ داخلي، حاول مرة أخرى" });
    }

    let parentRef = "10";
    let entityType = "cafeteria_self";
    const refRaw = (body.referral_code ?? "").trim().toUpperCase();
    if (refRaw) {
      const { data: parent } = await admin.from("marketers").select("ref_code, is_active").eq("ref_code", refRaw).maybeSingle();
      if (!parent) return json(400, { error: "الرقم المرجعي غير صحيح" });
      if (!parent.is_active) return json(400, { error: "الرقم المرجعي غير مفعّل" });
      parentRef = parent.ref_code;
      entityType = "cafeteria"; // child cafeteria under that marketer (parent + B + 2 digits)
    }

    const { data: refCodeRes, error: refErr } = await admin.rpc("generate_ref_code", { _parent_ref_code: parentRef, _entity_type: entityType });
    if (refErr) {
      console.error("[signup-cafeteria] ref_code", refErr);
      return json(500, { error: "تعذّر إنشاء الرقم المرجعي، حاول مرة أخرى" });
    }
    const ref_code = refCodeRes as string;

    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: body.email, password: body.password, email_confirm: true,
      user_metadata: { full_name: body.name },
    });
    if (cErr) {
      const msg = cErr.message?.toLowerCase() ?? "";
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return json(400, { error: "هذا البريد الإلكتروني مسجل مسبقاً" });
      }
      console.error("[signup-cafeteria] createUser", cErr);
      return json(500, { error: "تعذّر إنشاء الحساب، حاول مرة أخرى" });
    }
    const userId = created.user!.id;

    const bizType = body.business_type === "home_seller" ? "home_seller" : "full_cafe";
    const { error: caErr } = await admin.from("cafeterias").insert({
      user_id: userId, ref_code, parent_ref_code: parentRef, signup_type: "self_signup",
      name: body.name, country_code: body.country_code, currency_code: body.currency_code,
      language: body.language ?? "ar", address: body.address, phone: body.phone, whatsapp: body.whatsapp, email: body.email,
      business_type: bizType,
      // Home sellers default to takeaway+delivery only (no dine-in)
      ...(bizType === "home_seller" ? { mode_dine_in: false, mode_takeaway: true, mode_delivery: true } : {}),
    });

    if (caErr) {
      console.error("[signup-cafeteria] insert", caErr);
      return json(500, { error: "تعذّر حفظ بيانات الكافيتيريا، حاول مرة أخرى" });
    }

    await admin.from("user_roles").upsert({ user_id: userId, role: "cafeteria_admin", entity_ref_code: ref_code }, { onConflict: "user_id,role" });

    return json(200, { ok: true, ref_code, user_id: userId, parent_ref_code: parentRef });
  } catch (e) {
    console.error("[signup-cafeteria]", e);
    return json(500, { error: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى" });
  }
});
