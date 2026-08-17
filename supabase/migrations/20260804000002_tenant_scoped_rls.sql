/*
  # Every policy rewritten around the tenant and the module

  This migration replaces the row-level security on every table that belongs to
  a company. It has to be a replacement rather than an addition, for a reason
  worth writing down:

  POSTGRES POLICIES ARE OR-ED TOGETHER. Any one permissive policy that says
  `USING (true)` grants the row to everybody, no matter what the others say.
  The database as it stands has several of them —

      customers    "Anyone authenticated can read customers"   USING (true)
      appointments "Anyone authenticated can read appointments" USING (true)
      invoices     "Anyone authenticated can read invoices"     USING (true)
      invoices     "Admins can update invoices"                 USING (true)
      job_tasks    "Anyone authenticated can read job tasks"    USING (true)
      notifications "Users can view their own notifications"    USING (true)

  — which means that today any signed-in account, including a customer's portal
  login, can read every customer, visit and invoice in the system, and update
  any invoice. Left in place, those six lines would also defeat tenant isolation
  completely: a second company's staff would read the first company's book.

  So: all policies on these tables are dropped and rebuilt to one shape.

    read    same tenant AND the module's view right
    create  same tenant AND the module's create right
    edit    same tenant AND the module's edit right
    delete  same tenant AND the module's delete right

  plus, kept deliberately:

    · a customer's portal login still reaches exactly their own rows;
    · a permission set marked `own_records_only` — the technician default —
      can only write rows that are its own work, as before.

  A platform admin passes everything; they are the only account not scoped.
*/

/* A technician writes their own jobs, not the whole tenant's. */
ALTER TABLE permission_sets
  ADD COLUMN IF NOT EXISTS own_records_only boolean NOT NULL DEFAULT false;

UPDATE permission_sets SET own_records_only = true
 WHERE base_role = 'technician' AND is_system;

CREATE OR REPLACE FUNCTION public.writes_own_only()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT ps.own_records_only
      FROM profiles p JOIN permission_sets ps ON ps.id = p.permission_set_id
     WHERE p.id = auth.uid()
  ), false)
$$;

GRANT EXECUTE ON FUNCTION public.writes_own_only() TO authenticated;

/* A tenant seeded after this migration copies the flag along with the rights. */
CREATE OR REPLACE FUNCTION public.seed_tenant_defaults(target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only a platform admin may seed a tenant';
  END IF;

  INSERT INTO permission_sets (tenant_id, name, name_ar, description, is_system, base_role, own_records_only)
  SELECT target, s.name, s.name_ar, s.description, true, s.base_role, s.own_records_only
    FROM permission_sets s
   WHERE s.is_system
     AND s.tenant_id = (SELECT id FROM tenants ORDER BY created_at LIMIT 1)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  INSERT INTO permission_set_modules (set_id, module_key, can_view, can_create, can_edit, can_delete)
  SELECT new_set.id, psm.module_key, psm.can_view, psm.can_create, psm.can_edit, psm.can_delete
    FROM permission_sets new_set
    JOIN permission_sets template
      ON template.base_role = new_set.base_role
     AND template.is_system
     AND template.tenant_id = (SELECT id FROM tenants ORDER BY created_at LIMIT 1)
    JOIN permission_set_modules psm ON psm.set_id = template.id
   WHERE new_set.tenant_id = target
  ON CONFLICT DO NOTHING;
END $$;

/** The customer record behind the signed-in portal user, if there is one. */
CREATE OR REPLACE FUNCTION public.my_customer_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM customers WHERE user_id = auth.uid() $$;

GRANT EXECUTE ON FUNCTION public.my_customer_ids() TO authenticated;

/* ── 1. clear the ground ─────────────────────────────────────────────────── */

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'customers', 'appointments', 'contracts', 'contract_devices', 'customer_devices',
         'filter_status', 'invoices', 'quotations', 'service_requests', 'inventory',
         'inventory_transactions', 'branches', 'job_tasks', 'job_parts', 'job_photos',
         'job_readings', 'notifications', 'activity_log')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

/* ── 2. the standard four, per table, against its module ─────────────────── */

DO $$
DECLARE
  spec  record;
  specs constant text[][] := ARRAY[
    ['customers',              'customers'],
    ['appointments',           'visits'],
    ['job_tasks',              'visits'],
    ['job_parts',              'visits'],
    ['job_photos',             'visits'],
    ['job_readings',           'visits'],
    ['service_requests',       'requests'],
    ['contracts',              'contracts'],
    ['contract_devices',       'contracts'],
    ['customer_devices',       'devices'],
    ['filter_status',          'devices'],
    ['inventory',              'inventory'],
    ['inventory_transactions', 'inventory'],
    ['branches',               'inventory'],
    ['invoices',               'invoices'],
    ['quotations',             'quotations'],
    ['activity_log',           'settings']
  ];
  tbl text;
  mod text;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    tbl := specs[i][1];
    mod := specs[i][2];

    /* A policy on a table without RLS enabled is decoration. */
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR SELECT TO authenticated
        USING (
          public.is_platform_admin()
          OR (tenant_id = public.current_tenant_id() AND public.can_module(%L, 'view'))
        )$f$, tbl || '_read', tbl, mod);

    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR INSERT TO authenticated
        WITH CHECK (
          public.is_platform_admin()
          OR (tenant_id = public.current_tenant_id() AND public.can_module(%L, 'create'))
        )$f$, tbl || '_insert', tbl, mod);

    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR UPDATE TO authenticated
        USING (
          public.is_platform_admin()
          OR (tenant_id = public.current_tenant_id() AND public.can_module(%L, 'edit'))
        )
        WITH CHECK (
          public.is_platform_admin()
          OR (tenant_id = public.current_tenant_id() AND public.can_module(%L, 'edit'))
        )$f$, tbl || '_update', tbl, mod, mod);

    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR DELETE TO authenticated
        USING (
          public.is_platform_admin()
          OR (tenant_id = public.current_tenant_id() AND public.can_module(%L, 'delete'))
        )$f$, tbl || '_delete', tbl, mod);
  END LOOP;
END $$;

/*
  A set marked `own_records_only` may only write its own work. Restrictive
  policies are AND-ed with the permissive ones above, which is exactly what is
  wanted here: it narrows, it never grants.
*/
CREATE POLICY appointments_own_write ON appointments
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.writes_own_only() OR technician_id = auth.uid());

CREATE POLICY invoices_own_write ON invoices
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.writes_own_only() OR technician_id = auth.uid());

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['job_tasks', 'job_parts', 'job_photos', 'job_readings'] LOOP
    EXECUTE format($f$
      CREATE POLICY %I ON %I AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (
          NOT public.writes_own_only()
          OR EXISTS (SELECT 1 FROM appointments a
                      WHERE a.id = %I.appointment_id AND a.technician_id = auth.uid())
        )$f$, tbl || '_own_write', tbl, tbl);
  END LOOP;
END $$;

/* ── 3. the customer portal reaches its own rows, and nothing else ───────── */

CREATE POLICY customers_portal_read ON customers
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY appointments_portal_read ON appointments
  FOR SELECT TO authenticated USING (customer_id IN (SELECT public.my_customer_ids()));

/* Confirming a visit, or answering an approval request, is the customer's own. */
CREATE POLICY appointments_portal_update ON appointments
  FOR UPDATE TO authenticated
  USING (customer_id IN (SELECT public.my_customer_ids()))
  WITH CHECK (customer_id IN (SELECT public.my_customer_ids()));

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'invoices', 'contracts', 'customer_devices', 'filter_status', 'quotations', 'service_requests'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR SELECT TO authenticated
        USING (customer_id IN (SELECT public.my_customer_ids()))$f$, tbl || '_portal_read', tbl);
  END LOOP;

  /* What happened on their own visits. */
  FOREACH tbl IN ARRAY ARRAY['job_tasks', 'job_parts', 'job_photos', 'job_readings'] LOOP
    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR SELECT TO authenticated
        USING (EXISTS (SELECT 1 FROM appointments a
                        WHERE a.id = %I.appointment_id
                          AND a.customer_id IN (SELECT public.my_customer_ids())))$f$,
      tbl || '_portal_read', tbl, tbl);
  END LOOP;
END $$;

/* A customer raises their own request — a complaint, or an emergency. */
CREATE POLICY service_requests_portal_insert ON service_requests
  FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (SELECT public.my_customer_ids()));

/* ── 4. notifications belong to one person, not to a module ─────────────── */

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_own_read ON notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

CREATE POLICY notifications_own_update ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

/* Staff raise notifications for people inside their own tenant. */
CREATE POLICY notifications_staff_insert ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p
                WHERE p.id = notifications.user_id
                  AND p.tenant_id = public.current_tenant_id())
  );

/* ── 5. the tenancy tables themselves ───────────────────────────────────── */

ALTER TABLE tenants                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_modules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_sets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_set_modules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_module_overrides ENABLE ROW LEVEL SECURITY;

/* Everyone may read the module catalogue; it is a list of names. */
DROP POLICY IF EXISTS modules_read ON modules;
CREATE POLICY modules_read ON modules FOR SELECT TO authenticated USING (true);

/* A tenant sees itself. Only the platform admin creates or suspends one. */
DROP POLICY IF EXISTS tenants_read ON tenants;
CREATE POLICY tenants_read ON tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS tenants_admin_all ON tenants;
CREATE POLICY tenants_admin_all ON tenants FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

/* Which modules a company has is ours to sell, theirs to read. */
DROP POLICY IF EXISTS tenant_modules_read ON tenant_modules;
CREATE POLICY tenant_modules_read ON tenant_modules FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS tenant_modules_admin_all ON tenant_modules;
CREATE POLICY tenant_modules_admin_all ON tenant_modules FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

/*
  Permission sets are the tenant's own business, managed by whoever has the
  'team' module — which is the owner by default.
*/
DROP POLICY IF EXISTS permission_sets_read ON permission_sets;
CREATE POLICY permission_sets_read ON permission_sets FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_platform_admin());

DROP POLICY IF EXISTS permission_sets_manage ON permission_sets;
CREATE POLICY permission_sets_manage ON permission_sets FOR ALL TO authenticated
  USING (public.is_platform_admin()
         OR (tenant_id = public.current_tenant_id() AND public.can_module('team', 'edit')))
  WITH CHECK (public.is_platform_admin()
         OR (tenant_id = public.current_tenant_id() AND public.can_module('team', 'edit')));

DROP POLICY IF EXISTS permission_set_modules_read ON permission_set_modules;
CREATE POLICY permission_set_modules_read ON permission_set_modules FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM permission_sets s
                  WHERE s.id = permission_set_modules.set_id
                    AND (s.tenant_id = public.current_tenant_id() OR public.is_platform_admin())));

DROP POLICY IF EXISTS permission_set_modules_manage ON permission_set_modules;
CREATE POLICY permission_set_modules_manage ON permission_set_modules FOR ALL TO authenticated
  USING (public.is_platform_admin()
         OR EXISTS (SELECT 1 FROM permission_sets s
                     WHERE s.id = permission_set_modules.set_id
                       AND s.tenant_id = public.current_tenant_id()
                       AND public.can_module('team', 'edit')))
  WITH CHECK (public.is_platform_admin()
         OR EXISTS (SELECT 1 FROM permission_sets s
                     WHERE s.id = permission_set_modules.set_id
                       AND s.tenant_id = public.current_tenant_id()
                       AND public.can_module('team', 'edit')));

/* One person's exceptions: they may read their own, the office may set them. */
DROP POLICY IF EXISTS profile_overrides_read ON profile_module_overrides;
CREATE POLICY profile_overrides_read ON profile_module_overrides FOR SELECT TO authenticated
  USING (profile_id = auth.uid()
         OR public.is_platform_admin()
         OR EXISTS (SELECT 1 FROM profiles p
                     WHERE p.id = profile_module_overrides.profile_id
                       AND p.tenant_id = public.current_tenant_id()
                       AND public.can_module('team', 'view')));

DROP POLICY IF EXISTS profile_overrides_manage ON profile_module_overrides;
CREATE POLICY profile_overrides_manage ON profile_module_overrides FOR ALL TO authenticated
  USING (public.is_platform_admin()
         OR EXISTS (SELECT 1 FROM profiles p
                     WHERE p.id = profile_module_overrides.profile_id
                       AND p.tenant_id = public.current_tenant_id()
                       AND public.can_module('team', 'edit')))
  WITH CHECK (public.is_platform_admin()
         OR EXISTS (SELECT 1 FROM profiles p
                     WHERE p.id = profile_module_overrides.profile_id
                       AND p.tenant_id = public.current_tenant_id()
                       AND public.can_module('team', 'edit')));

/* ── 6. profiles: your own row, your colleagues, nobody else's company ──── */

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_read ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid()
         OR public.is_platform_admin()
         OR tenant_id = public.current_tenant_id());

CREATE POLICY profiles_self_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY profiles_team_manage ON profiles FOR ALL TO authenticated
  USING (public.is_platform_admin()
         OR (tenant_id = public.current_tenant_id() AND public.can_module('team', 'edit')))
  WITH CHECK (public.is_platform_admin()
         OR (tenant_id = public.current_tenant_id() AND public.can_module('team', 'edit')));

/* Signup still has to be able to write the row the trigger creates. */
CREATE POLICY profiles_insert_self ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_platform_admin()
              OR (tenant_id = public.current_tenant_id() AND public.can_module('team', 'create')));
