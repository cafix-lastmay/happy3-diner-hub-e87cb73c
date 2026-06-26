// Temporary debug-only helper to reset a known test user's password.
// DELETE after debugging.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);
  const allow = new Set([
    "homeseller003@cafix.test",
    "testhome002@cafix.test",
    "testhome001@cafix.test",
  ]);
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "");
  const password = String(body.password || "");
  if (!allow.has(email) || password.length < 8) {
    return new Response(JSON.stringify({ error: "not allowed" }), { status: 400 });
  }
  const { data: list, error: e1 } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (e1) return new Response(JSON.stringify({ error: e1.message }), { status: 500 });
  const u = list.users.find((x) => x.email === email);
  if (!u) return new Response(JSON.stringify({ error: "user not found" }), { status: 404 });
  const { error: e2 } = await admin.auth.admin.updateUserById(u.id, { password });
  if (e2) return new Response(JSON.stringify({ error: e2.message }), { status: 500 });
  return new Response(JSON.stringify({ ok: true, id: u.id }), { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
});
