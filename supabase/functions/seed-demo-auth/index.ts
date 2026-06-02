import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEMO_USERS = [
  { email: "owner@demo.com",    password: "demo1234", full_name: "Ahmad Al-Sharif",  role: "owner" },
  { email: "tech@demo.com",     password: "demo1234", full_name: "Sami Al-Atabi",    role: "technician" },
  { email: "admin@demo.com",    password: "demo1234", full_name: "Noura Al-Qahtani", role: "admin" },
  { email: "customer@demo.com", password: "demo1234", full_name: "Fahad Al-Malki",   role: "customer" },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results: Record<string, string> = {};

    for (const u of DEMO_USERS) {
      // 1. Look up existing auth user by email
      const { data: listData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = listData?.users?.find(x => x.email === u.email);

      // 2. Delete if exists (removes identity + session rows too)
      if (existing) {
        await admin.auth.admin.deleteUser(existing.id);
      }

      // 3. Re-create via admin API — this produces a properly-formatted auth row
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.full_name, role: u.role },
      });

      if (createErr || !created.user) {
        results[u.email] = `ERROR: ${createErr?.message ?? "unknown"}`;
        continue;
      }

      const newId = created.user.id;

      // 4. Upsert profile with new UUID (trigger may have already created it)
      await admin.from("profiles").upsert({
        id: newId,
        full_name: u.full_name,
        role: u.role,
      }, { onConflict: "id" });

      results[u.email] = `OK — new id: ${newId}`;
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
