import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/*
  Managing somebody who already exists: edit, disable, re-enable, reset their
  password, delete.

  Creating a login needs the service role, and so does taking one away — the
  browser can change `profiles`, but only this can ban an account or remove it
  from `auth.users`. Everything here is scoped to the caller's own company: a
  company owner manages their own people and cannot reach anyone else's, which
  is checked here and again by row-level security underneath.
*/
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const caller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const { data: { user: callerUser } } = await caller.auth.getUser();
    if (!callerUser) return json({ error: 'Unauthorized' }, 401);

    const { data: me } = await admin
      .from('profiles')
      .select('role, is_platform_admin, tenant_id')
      .eq('id', callerUser.id)
      .single();

    if (!me) return json({ error: 'Unauthorized' }, 401);

    /* The permission system decides, not a hardcoded role list — asked as the
       caller so their set and their personal exceptions both apply. */
    const { data: mayManage } = await caller.rpc('can_module', { mod: 'team', act: 'edit' });
    if (!mayManage && !me.is_platform_admin) {
      return json({ error: 'You do not have permission to manage the team' }, 403);
    }

    const { action, profile_id, full_name, phone, role, permission_set_id, active, password } =
      await req.json();

    if (!profile_id) return json({ error: 'profile_id is required' }, 400);

    const { data: target } = await admin
      .from('profiles')
      .select('id, role, tenant_id, is_platform_admin, full_name')
      .eq('id', profile_id)
      .maybeSingle();

    if (!target) return json({ error: 'No such user' }, 404);

    /* Company boundary. A platform admin is the only account allowed across it. */
    if (!me.is_platform_admin && target.tenant_id !== me.tenant_id) {
      return json({ error: 'That user belongs to a different company' }, 403);
    }

    /* Nobody edits a platform account from a company screen. */
    if (target.is_platform_admin && !me.is_platform_admin) {
      return json({ error: 'That account is managed at platform level' }, 403);
    }

    const isSelf = target.id === callerUser.id;

    /*
      Not every profile has a login behind it. Old seed rows do not, and neither
      does a customer registered without portal access. Without this check the
      auth admin API answers "User not found", which tells the office nothing
      about what went wrong or what to do instead.
    */
    const { data: authUser } = await admin.auth.admin.getUserById(profile_id);
    const hasLogin = Boolean(authUser?.user);

    /* Each role may only act on roles at or below its own, so an office admin
       cannot disable the owner who manages them. */
    const rank: Record<string, number> = { owner: 4, manager: 3, admin: 2, technician: 1, customer: 0 };
    if (!me.is_platform_admin && (rank[target.role] ?? 0) > (rank[me.role] ?? 0)) {
      return json({ error: `A ${me.role} cannot manage a ${target.role} account` }, 403);
    }

    switch (action) {
      /* ── edit ────────────────────────────────────────────────────────── */
      case 'update': {
        const patch: Record<string, unknown> = {};
        if (full_name !== undefined) patch.full_name = full_name;
        if (phone !== undefined) patch.phone = phone;

        if (role !== undefined && role !== target.role) {
          if (!me.is_platform_admin && (rank[role] ?? 0) > (rank[me.role] ?? 0)) {
            return json({ error: `A ${me.role} cannot promote somebody to ${role}` }, 403);
          }
          if (isSelf) return json({ error: 'You cannot change your own role' }, 403);
          patch.role = role;
        }

        if (permission_set_id !== undefined) {
          if (permission_set_id === null) {
            patch.permission_set_id = null;
          } else {
            const { data: set } = await admin
              .from('permission_sets')
              .select('id')
              .eq('id', permission_set_id)
              .eq('tenant_id', target.tenant_id)
              .maybeSingle();
            if (!set) return json({ error: 'That permission set belongs to a different company' }, 400);
            patch.permission_set_id = set.id;
          }
        }

        if (Object.keys(patch).length === 0) return json({ ok: true, unchanged: true });

        const { error } = await admin.from('profiles').update(patch).eq('id', profile_id);
        if (error) return json({ error: error.message }, 400);

        /* Keep the auth copy of the name in step, so it is right on next login. */
        if (hasLogin && (patch.full_name || patch.role)) {
          await admin.auth.admin.updateUserById(profile_id, {
            user_metadata: { full_name: patch.full_name ?? target.full_name, role: patch.role ?? target.role },
          });
        }
        return json({ ok: true });
      }

      /* ── disable / re-enable ─────────────────────────────────────────── */
      case 'set_active': {
        if (isSelf) return json({ error: 'You cannot disable your own account' }, 403);

        const on = Boolean(active);

        /* `active` alone stops them seeing anything, because can_module()
           refuses an inactive profile. Banning as well stops them signing in at
           all, which is what "disabled" is expected to mean. A profile with no
           login has nothing to ban, and the flag alone is the whole job. */
        if (hasLogin) {
          const { error: banError } = await admin.auth.admin.updateUserById(profile_id, {
            ban_duration: on ? 'none' : '876000h',
          });
          if (banError) return json({ error: banError.message }, 400);
        }

        const { error } = await admin.from('profiles').update({ active: on }).eq('id', profile_id);
        if (error) return json({ error: error.message }, 400);

        return json({ ok: true, active: on, hasLogin });
      }

      /* ── new password ────────────────────────────────────────────────── */
      case 'reset_password': {
        if (!hasLogin) {
          return json({ error: 'This person has no login yet, so there is no password to change' }, 400);
        }
        if (!password || String(password).length < 6) {
          return json({ error: 'A password of at least 6 characters is required' }, 400);
        }
        const { error } = await admin.auth.admin.updateUserById(profile_id, {
          password: String(password),
          user_metadata: { must_change_password: true },
        });
        if (error) return json({ error: error.message }, 400);
        await admin.from('profiles').update({ must_change_password: true }).eq('id', profile_id);
        return json({ ok: true });
      }

      /* ── delete ──────────────────────────────────────────────────────── */
      case 'delete': {
        if (isSelf) return json({ error: 'You cannot delete your own account' }, 403);

        /*
          An account with work against its name is not deleted, because the
          history would lose its author — the visit would show no technician and
          the invoice no author. Those accounts are disabled instead, and the
          screen says so rather than failing with a foreign key error.
        */
        const [visits, invoices, customer] = await Promise.all([
          admin.from('appointments').select('id', { count: 'exact', head: true }).eq('technician_id', profile_id),
          admin.from('invoices').select('id', { count: 'exact', head: true }).eq('technician_id', profile_id),
          admin.from('customers').select('id', { count: 'exact', head: true }).eq('user_id', profile_id),
        ]);

        const attached = (visits.count ?? 0) + (invoices.count ?? 0) + (customer.count ?? 0);
        if (attached > 0) {
          return json({
            error: 'has_history',
            visits: visits.count ?? 0,
            invoices: invoices.count ?? 0,
            customer: customer.count ?? 0,
          }, 409);
        }

        /* Removing the auth user cascades to the profile. A profile with no
           login never had one to cascade from, so it goes directly. */
        if (hasLogin) {
          const { error } = await admin.auth.admin.deleteUser(profile_id);
          if (error) return json({ error: error.message }, 400);
        } else {
          const { error } = await admin.from('profiles').delete().eq('id', profile_id);
          if (error) return json({ error: error.message }, 400);
        }
        return json({ ok: true, deleted: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
