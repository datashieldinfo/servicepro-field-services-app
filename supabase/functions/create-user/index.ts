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
      .select('role')
      .eq('id', callerUser.id)
      .single();

    if (!callerProfile || !['admin', 'owner'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Only admins and owners can create users' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { type, email, password, full_name, phone, address, customer } = await req.json();

    if (!type || !email || !full_name) {
      return new Response(JSON.stringify({ error: 'Missing required fields: type, email, full_name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      user_metadata: { full_name, role },
    });

    if (createError || !newUser.user) {
      return new Response(JSON.stringify({ error: createError?.message ?? 'Failed to create auth user' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = newUser.user.id;

    // Update profile phone if provided (profile row is auto-created by handle_new_user trigger)
    if (phone) {
      await supabaseAdmin.from('profiles').update({ phone }).eq('id', userId);
    }

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
        'source',
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
      JSON.stringify({ user: { id: userId, email: newUser.user.email } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
