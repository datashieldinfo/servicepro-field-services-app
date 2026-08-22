import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller identity via their JWT
    const supabaseCaller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const { data: { user: callerUser } } = await supabaseCaller.auth.getUser();
    if (!callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, is_platform_admin')
      .eq('id', callerUser.id)
      .single();

    if (!callerProfile || !['admin', 'owner', 'manager'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Only admins, owners and managers can create users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      type, email, password, full_name, phone, address, customer,
      redirect_to, must_change_password = true,
      mode = 'create', customer_id, tenant_id,
    } = await req.json();

    /** A one-time magic link, or null when Supabase refused to mint one. */
    const makeLink = async (forEmail: string): Promise<string | null> => {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: forEmail,
        options: redirect_to ? { redirectTo: redirect_to } : undefined,
      });
      if (error) {
        console.error('Failed to generate login link:', error.message);
        return null;
      }
      return data?.properties?.action_link ?? null;
    };

    /*
      Invite mode — the customer record already exists. Either the office is
      granting portal access for the first time, or the one-time link shown at
      registration was lost and a fresh one is needed. Nothing is inserted into
      `customers` here; the existing row is updated.
    */
    if (mode === 'invite') {
      if (!customer_id) {
        return new Response(JSON.stringify({ error: 'customer_id is required for invite mode' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: existingCustomer, error: lookupError } = await supabaseAdmin
        .from('customers')
        .select('id, name, email, phone, user_id')
        .eq('id', customer_id)
        .maybeSingle();

      if (lookupError || !existingCustomer) {
        return new Response(JSON.stringify({ error: lookupError?.message ?? 'Customer not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const targetEmail = (email ?? existingCustomer.email ?? '').trim();
      if (!targetEmail) {
        return new Response(JSON.stringify({ error: 'This customer has no email address' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const invitePassword = password ?? Array.from(
        crypto.getRandomValues(new Uint32Array(14)),
        (n) => 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%'[n % 60],
      ).join('');

      // Already has a login → reset the password and mint a fresh link.
      if (existingCustomer.user_id) {
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          existingCustomer.user_id,
          {
            password: invitePassword,
            user_metadata: { must_change_password },
          },
        );

        if (updateError) {
          return new Response(JSON.stringify({ error: updateError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        await supabaseAdmin.from('profiles')
          .update({ must_change_password })
          .eq('id', existingCustomer.user_id);
        await supabaseAdmin.from('customers')
          .update({ portal_access: true })
          .eq('id', customer_id);

        return new Response(
          JSON.stringify({
            user: { id: existingCustomer.user_id, email: targetEmail },
            login_link: await makeLink(targetEmail),
            created: false,
            email: targetEmail,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // No login yet → create the account and attach it to this record.
      const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.createUser({
        email: targetEmail,
        password: invitePassword,
        email_confirm: true,
        user_metadata: {
          full_name: full_name ?? existingCustomer.name,
          role: 'customer',
          must_change_password,
        },
      });

      if (inviteError || !invited.user) {
        return new Response(JSON.stringify({ error: inviteError?.message ?? 'Failed to create auth user' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const invitedId = invited.user.id;
      const invitedProfile: Record<string, unknown> = { must_change_password };
      if (existingCustomer.phone) invitedProfile.phone = existingCustomer.phone;
      await supabaseAdmin.from('profiles').update(invitedProfile).eq('id', invitedId);

      const { error: linkError } = await supabaseAdmin.from('customers')
        .update({ user_id: invitedId, email: targetEmail, portal_access: true })
        .eq('id', customer_id);

      if (linkError) console.error('Failed to link customer to account:', linkError.message);

      return new Response(
        JSON.stringify({
          user: { id: invitedId, email: targetEmail },
          login_link: await makeLink(targetEmail),
          created: true,
          email: targetEmail,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!type || !email || !full_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields: type, email, full_name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    /*
      A new company's first login.

      Creating a company from the platform screen used to leave nobody able to
      open it: the modules and the permission sets existed, and no account did.
      This is the account — the owner of that company, attached to their tenant
      and to its Owner permission set, with no customers row because they are
      not a customer.

      Only a platform admin may ask for it. The role check above lets in every
      tenant owner, which is right for creating their own staff and wrong for
      creating an owner inside a company that is not theirs.
    */
    if (type === 'tenant_owner') {
      if (!callerProfile.is_platform_admin) {
        return new Response(JSON.stringify({ error: 'Only a platform admin may create a company owner' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!tenant_id) {
        return new Response(JSON.stringify({ error: 'tenant_id is required for a company owner' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const ownerPassword = password ?? Array.from(
        crypto.getRandomValues(new Uint32Array(14)),
        (n) => 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%'[n % 60],
      ).join('');

      const { data: created, error: ownerError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: ownerPassword,
        email_confirm: true,
        user_metadata: { full_name, role: 'owner', must_change_password },
      });

      if (ownerError || !created.user) {
        return new Response(JSON.stringify({ error: ownerError?.message ?? 'Failed to create the owner account' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      /* `handle_new_user` made the profile; it cannot know the tenant, because
         the service role has no tenant of its own for the trigger to copy. */
      const { data: ownerSet } = await supabaseAdmin
        .from('permission_sets')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('base_role', 'owner')
        .eq('is_system', true)
        .maybeSingle();

      const { error: patchError } = await supabaseAdmin
        .from('profiles')
        .update({
          tenant_id,
          permission_set_id: ownerSet?.id ?? null,
          full_name,
          phone: phone ?? '',
          must_change_password,
          active: true,
        })
        .eq('id', created.user.id);

      if (patchError) {
        return new Response(JSON.stringify({
          error: `Account created but not attached to the company: ${patchError.message}`,
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(
        JSON.stringify({
          user: { id: created.user.id, email: created.user.email },
          email,
          password: ownerPassword,
          login_link: await makeLink(email),
          created: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // The UI no longer asks for a password — generate one when it is omitted.
    const generatedPassword = password ?? Array.from(
      crypto.getRandomValues(new Uint32Array(14)),
      (n) => 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%'[n % 60],
    ).join('');

    const role = type === 'technician' ? 'technician' : 'customer';

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: generatedPassword,
      email_confirm: true,
      user_metadata: { full_name, role, must_change_password },
    });

    if (createError || !newUser.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? 'Failed to create auth user' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = newUser.user.id;

    // The profile row is auto-created by the handle_new_user trigger; complete it.
    const profilePatch: Record<string, unknown> = { must_change_password };
    if (phone) profilePatch.phone = phone;
    await supabaseAdmin.from('profiles').update(profilePatch).eq('id', userId);

    /*
      One-time login link. The customer follows it instead of being told a
      password out loud; `must_change_password` then forces them to choose
      their own before they reach the dashboard.
    */
    const actionLink = await makeLink(email);

    // For customer type, also insert the customers table row.
    // `customer` carries the structured record (type, address parts, map pin,
    // corporate fields); the flat fields stay as a fallback for older callers.
    if (role === 'customer') {
      const allowed = [
        'customer_type', 'name', 'email', 'country_code', 'phone', 'address',
        'state', 'city', 'area', 'street', 'building_type',
        'villa_name', 'villa_number', 'building_name', 'building_number', 'flat_number',
        'latitude', 'longitude', 'location_label', 'notes',
        'company_name', 'trade_name', 'industry', 'commercial_reg_no', 'tax_number',
        'branch_count', 'payment_terms', 'billing_email',
        'contact_person_name', 'contact_person_title', 'contact_person_phone', 'contact_person_email',
        'source', 'portal_access',
      ];

      const structured: Record<string, unknown> = {};
      if (customer && typeof customer === 'object') {
        for (const key of allowed) {
          if (customer[key] !== undefined) structured[key] = customer[key];
        }
      }

      const { error: custError } = await supabaseAdmin.from('customers').insert({
        user_id: userId,
        name: full_name,
        email,
        phone: phone ?? '',
        address: address ?? '',
        ...structured,
      });

      if (custError) {
        // Auth user was created — log but don't fail the whole request
        console.error('Failed to insert customers row:', custError.message);
      }
    }

    return new Response(
      JSON.stringify({
        user: { id: userId, email: newUser.user.email },
        login_link: actionLink,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
