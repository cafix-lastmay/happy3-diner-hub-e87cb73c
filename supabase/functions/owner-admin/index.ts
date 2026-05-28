// Owner-only admin actions: reset password, update marketer/cafeteria info.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  action: "reset_password" | "update_marketer" | "update_cafeteria";
  user_id?: string;
  new_password?: string;
  ref_code?: string;
  patch?: Record<string, unknown>;
}

const ALLOWED_MARKETER = ["name", "phone", "whatsapp", "address", "country_code", "currency_code", "is_active", "email", "custom_commission_months"];
const ALLOWED_CAFE = ["name", "phone", "whatsapp", "address", "country_code", "currency_code", "is_active", "email", "free_trial_until"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud, error: ue } = await userClient.auth.getUser();
    if (ue || !ud.user) return j({ error: "غير مصرح، يرجى تسجيل الدخول" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", ud.user.id).eq("role", "owner").maybeSingle();
    if (!roleRow) return j({ error: "هذا الإجراء متاح للمالك فقط" }, 403);

    const body: Body = await req.json();

    if (body.action === "reset_password") {
      if (!body.user_id || !body.new_password || body.new_password.length < 8) return j({ error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" }, 400);
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.new_password });
      if (error) return j({ error: "تعذّر تحديث كلمة المرور، حاول مرة أخرى" }, 400);
      return j({ ok: true });
    }

    if (body.action === "update_marketer" || body.action === "update_cafeteria") {
      if (!body.ref_code || !body.patch) return j({ error: "بيانات التعديل ناقصة" }, 400);
      const allowed = body.action === "update_marketer" ? ALLOWED_MARKETER : ALLOWED_CAFE;
      const clean: Record<string, unknown> = {};
      for (const k of allowed) if (k in body.patch) clean[k] = body.patch[k];
      if (Object.keys(clean).length === 0) return j({ error: "لا توجد تعديلات صالحة للحفظ" }, 400);
      const table = body.action === "update_marketer" ? "marketers" : "cafeterias";
      const { error } = await admin.from(table).update(clean).eq("ref_code", body.ref_code);
      if (error) throw error;
      return j({ ok: true });
    }

    return j({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    console.error("[owner-admin]", e);
    return j({ error: "حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى" }, 500);
  }
});

function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
