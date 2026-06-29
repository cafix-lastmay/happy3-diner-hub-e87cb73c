// Temp admin function: create/reset test accounts and ensure links.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PASSWORD = "Cafix@Test2026!Qx9";

const DRIVERS: { email: string; full_name: string; cafe: string }[] = [
  { email: "driver.ziad@cafix.test", full_name: "Driver Ziad", cafe: "10B01" },
  { email: "driver.rami@cafix.test", full_name: "Driver Rami", cafe: "10B01" },
  { email: "driver.hani@cafix.test", full_name: "Driver Hani", cafe: "10B01" },
  { email: "driver.kareem@cafix.test", full_name: "Driver Kareem", cafe: "10B02" },
  { email: "driver.faris@cafix.test", full_name: "Driver Faris", cafe: "10B02" },
  { email: "driver.tarek@cafix.test", full_name: "Driver Tarek", cafe: "10B03" },
  { email: "driver.nabil@cafix.test", full_name: "Driver Nabil", cafe: "10B03" },
];

const CAFES: { email: string; ref: string }[] = [
  { email: "cafe.nakhba@cafix.test", ref: "10B01" },
  { email: "cafe.asdiqa@cafix.test", ref: "10B02" },
  { email: "cafe.thawqa@cafix.test", ref: "10B03" },
  { email: "cafe.dubai@cafix.test", ref: "1001B01" },
  { email: "cafe.cairo@cafix.test", ref: "1001B02" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const report: Record<string, unknown>[] = [];

  async function findUserByEmail(email: string): Promise<string | null> {
    let page = 1;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      const u = data.users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
      if (u) return u.id;
      if (data.users.length < 200) return null;
      page++;
      if (page > 20) return null;
    }
  }

  // 1. Cafe admins: update existing cafeteria.user_id email + password
  for (const c of CAFES) {
    try {
      const { data: cafe } = await admin.from("cafeterias").select("user_id, name").eq("ref_code", c.ref).maybeSingle();
      if (!cafe?.user_id) { report.push({ kind: "cafe", email: c.email, ref: c.ref, status: "no_cafeteria" }); continue; }
      const existingId = await findUserByEmail(c.email);
      let userId = cafe.user_id;
      if (existingId && existingId !== cafe.user_id) {
        // email already taken by another user — just reset that user's password and re-link cafeteria
        await admin.auth.admin.updateUserById(existingId, { password: PASSWORD, email_confirm: true });
        await admin.from("cafeterias").update({ user_id: existingId }).eq("ref_code", c.ref);
        userId = existingId;
      } else {
        const { error: upErr } = await admin.auth.admin.updateUserById(cafe.user_id, {
          email: c.email, password: PASSWORD, email_confirm: true,
        });
        if (upErr) { report.push({ kind: "cafe", email: c.email, ref: c.ref, error: upErr.message }); continue; }
      }
      await admin.from("user_roles").upsert(
        { user_id: userId, role: "cafeteria_admin", entity_ref_code: c.ref },
        { onConflict: "user_id,role" },
      );
      report.push({ kind: "cafe", email: c.email, ref: c.ref, user_id: userId, status: "ok" });
    } catch (e) {
      report.push({ kind: "cafe", email: c.email, error: String(e) });
    }
  }

  // 2. Drivers
  for (const d of DRIVERS) {
    try {
      let userId = await findUserByEmail(d.email);
      if (!userId) {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: d.email, password: PASSWORD, email_confirm: true,
          user_metadata: { full_name: d.full_name },
        });
        if (error) { report.push({ kind: "driver", email: d.email, error: error.message }); continue; }
        userId = created.user!.id;
      } else {
        await admin.auth.admin.updateUserById(userId, { password: PASSWORD, email_confirm: true });
      }

      await admin.from("user_roles").upsert(
        { user_id: userId, role: "driver", entity_ref_code: null },
        { onConflict: "user_id,role" },
      );

      const { data: existingDriver } = await admin.from("drivers").select("id").eq("user_id", userId).maybeSingle();
      let driverId = existingDriver?.id as string | undefined;
      if (!driverId) {
        const { data: ins, error: dErr } = await admin.from("drivers").insert({
          user_id: userId, kind: "independent", full_name: d.full_name,
          phone: `+9665${Math.floor(10000000 + Math.random() * 89999999)}`,
          vehicle_type: "motorcycle", service_radius_km: 10, status: "unavailable",
        }).select("id").single();
        if (dErr) { report.push({ kind: "driver", email: d.email, error: dErr.message }); continue; }
        driverId = ins.id;
      }

      await admin.from("driver_cafeteria_links").upsert(
        { driver_id: driverId, cafeteria_ref_code: d.cafe, status: "approved", decided_at: new Date().toISOString() },
        { onConflict: "driver_id,cafeteria_ref_code" },
      );

      report.push({ kind: "driver", email: d.email, user_id: userId, driver_id: driverId, cafe: d.cafe, status: "ok" });
    } catch (e) {
      report.push({ kind: "driver", email: d.email, error: String(e) });
    }
  }

  return json(200, { ok: true, report });
});
