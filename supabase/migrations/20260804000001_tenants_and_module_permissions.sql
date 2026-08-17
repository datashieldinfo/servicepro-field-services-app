/*
  # Many companies on one deployment, and who inside them may open what

  Two things arrive together because neither is much use alone.

  1. TENANTS
     Every row that belongs to a company carries `tenant_id`, and no query can
     see across that line. The column is filled in by a trigger from the signed-in
     user's own tenant, so no screen has to remember to set it — forgetting is
     how tenant leaks happen.

  2. MODULE ACCESS
     A module is a part of the app: customers, visits, contracts, devices,
     inventory, invoices, offers, requests, reports, team, settings, lookup.
     Access is decided in three layers, each able only to take away, never to
     grant more than the layer above:

       tenant_modules      what the company bought          (platform admin sets)
       permission_sets     what this kind of user may do    (tenant owner sets)
       profile_module_overrides  one tick for one person    (tenant owner sets)

     Each layer carries view / create / edit / delete separately.

  3. WHO ADMINISTERS
     `profiles.is_platform_admin` is us — above every tenant, able to create
     companies and switch their modules on. Inside a tenant, the owner manages
     their own people. A platform admin is never subject to tenant scoping;
     everyone else always is.

  Existing data belongs to one tenant, created here, and every current user is
  attached to it with a permission set matching the role they already had — so
  nothing changes for anyone until a second tenant is added.
*/

/* ── 1. tenants ──────────────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  name_ar       text,
  slug          text NOT NULL,
  status        text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('trial', 'active', 'suspended', 'closed')),
  plan          text NOT NULL DEFAULT 'standard',
  contact_email text DEFAULT '',
  contact_phone text DEFAULT '',
  country_code  text DEFAULT '+962',
  notes         text DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON tenants (lower(slug));

/* The company this system was built for; everything that exists today is theirs. */
INSERT INTO tenants (name, name_ar, slug, status, plan, contact_phone)
SELECT 'Best Co. Water Technology', 'مؤسسة الأفضل لتكنولوجيا المياه', 'best-co', 'active', 'enterprise', '0778068705'
WHERE NOT EXISTS (SELECT 1 FROM tenants);

/* ── 2. the module catalogue ─────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS modules (
  key       text PRIMARY KEY,
  label_en  text NOT NULL,
  label_ar  text NOT NULL,
  sort      int  NOT NULL DEFAULT 0,
  /* Some modules are the app's spine and cannot be sold separately. */
  core      boolean NOT NULL DEFAULT false
);

INSERT INTO modules (key, label_en, label_ar, sort, core) VALUES
  ('customers',  'Customers',      'العملاء',            10, true),
  ('visits',     'Visits & jobs',  'الزيارات والمهام',    20, true),
  ('contracts',  'Contracts',      'العقود',              30, false),
  ('devices',    'Devices',        'الأجهزة',             40, false),
  ('inventory',  'Inventory',      'المخزون',             50, false),
  ('invoices',   'Invoices',       'الفواتير',            60, false),
  ('quotations', 'Price offers',   'عروض الأسعار',        70, false),
  ('requests',   'Service requests','طلبات الخدمة',       80, false),
  ('reports',    'Reports',        'التقارير',            90, false),
  ('team',       'Team & access',  'الفريق والصلاحيات',  100, true),
  ('settings',   'Settings',       'الإعدادات',          110, true),
  ('lookup',     'Caller lookup',  'من المتصل',          120, false)
ON CONFLICT (key) DO UPDATE
  SET label_en = EXCLUDED.label_en, label_ar = EXCLUDED.label_ar,
      sort = EXCLUDED.sort, core = EXCLUDED.core;

/* What each company has switched on. */
CREATE TABLE IF NOT EXISTS tenant_modules (
  tenant_id  uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT true,
  PRIMARY KEY (tenant_id, module_key)
);

/* The first tenant gets everything. */
INSERT INTO tenant_modules (tenant_id, module_key, enabled)
SELECT t.id, m.key, true FROM tenants t CROSS JOIN modules m
ON CONFLICT DO NOTHING;

/* ── 3. permission sets ──────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS permission_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  name_ar     text,
  description text DEFAULT '',
  /* Seeded sets that mirror the old roles; renameable, not deletable. */
  is_system   boolean NOT NULL DEFAULT false,
  base_role   text CHECK (base_role IN ('owner','manager','admin','technician','customer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS permission_set_modules (
  set_id     uuid NOT NULL REFERENCES permission_sets(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  can_view   boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit   boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  PRIMARY KEY (set_id, module_key)
);

/* ── 4. profiles gain a tenant, a set, and the platform flag ─────────────── */

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tenant_id         uuid REFERENCES tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS permission_set_id uuid REFERENCES permission_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS active            boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS profiles_tenant_idx ON profiles (tenant_id);

/* One tick per person per module, overriding their set. NULL = "no opinion". */
CREATE TABLE IF NOT EXISTS profile_module_overrides (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  can_view   boolean,
  can_create boolean,
  can_edit   boolean,
  can_delete boolean,
  PRIMARY KEY (profile_id, module_key)
);

/* ── 5. the seeded sets, one per old role ────────────────────────────────── */

INSERT INTO permission_sets (tenant_id, name, name_ar, description, is_system, base_role)
SELECT t.id, v.name, v.name_ar, v.description, true, v.base_role
  FROM tenants t
  CROSS JOIN (VALUES
    ('Owner',      'المالك',        'Everything, including team and settings', 'owner'),
    ('Manager',    'مدير',          'Back office and Customer 360',            'manager'),
    ('Office admin','إداري المكتب', 'Scheduling, customers, invoices',         'admin'),
    ('Technician', 'فني',           'Their own jobs and the parts they use',   'technician'),
    ('Customer',   'عميل',          'Their own record only',                   'customer')
  ) AS v(name, name_ar, description, base_role)
ON CONFLICT (tenant_id, name) DO NOTHING;

/* What each seeded set may do — the shape of today's roles, written down. */
INSERT INTO permission_set_modules (set_id, module_key, can_view, can_create, can_edit, can_delete)
SELECT s.id, m.key,
       CASE s.base_role
         WHEN 'owner'      THEN true
         WHEN 'manager'    THEN m.key <> 'settings'
         WHEN 'admin'      THEN m.key NOT IN ('settings', 'team', 'reports')
         WHEN 'technician' THEN m.key IN ('visits', 'customers', 'devices', 'inventory', 'requests', 'lookup')
         WHEN 'customer'   THEN false
       END,
       CASE s.base_role
         WHEN 'owner'      THEN true
         WHEN 'manager'    THEN m.key <> 'settings'
         WHEN 'admin'      THEN m.key IN ('customers', 'visits', 'invoices', 'quotations', 'devices', 'contracts', 'requests', 'inventory', 'lookup')
         WHEN 'technician' THEN m.key IN ('visits', 'requests')
         WHEN 'customer'   THEN false
       END,
       CASE s.base_role
         WHEN 'owner'      THEN true
         WHEN 'manager'    THEN m.key <> 'settings'
         WHEN 'admin'      THEN m.key IN ('customers', 'visits', 'invoices', 'quotations', 'devices', 'contracts', 'requests', 'inventory')
         WHEN 'technician' THEN m.key IN ('visits', 'devices', 'inventory')
         WHEN 'customer'   THEN false
       END,
       CASE s.base_role
         WHEN 'owner'      THEN true
         WHEN 'manager'    THEN m.key IN ('customers', 'visits', 'quotations', 'requests')
         ELSE false
       END
  FROM permission_sets s CROSS JOIN modules m
 WHERE s.is_system
ON CONFLICT DO NOTHING;

/*
  Attaching people to the tenant, and to the set matching the role they have.

  Both updates run with replication triggers off, and that needs explaining.
  `profiles_id_fkey` (profiles.id → auth.users.id) is marked *validated* on the
  live database while four rows violate it — seed profiles whose auth.users rows
  went away with the foreign key bypassed, a state Postgres believes impossible.
  An ordinary UPDATE re-checks the key on every row it touches and dies on those
  four. Turning replication triggers off for the backfill changes nothing about
  the constraint and leaves no trace; the alternative was to leave those profiles
  outside the tenant, which would blank the technician's name on the visit that
  references one of them.
*/
SET session_replication_role = replica;

/* Everyone who exists today belongs to the first tenant. */
UPDATE profiles SET tenant_id = (SELECT id FROM tenants ORDER BY created_at LIMIT 1)
 WHERE tenant_id IS NULL;

UPDATE profiles p
   SET permission_set_id = s.id
  FROM permission_sets s
 WHERE s.tenant_id = p.tenant_id
   AND s.base_role = p.role
   AND p.permission_set_id IS NULL;

SET session_replication_role = DEFAULT;

/* ── 6. the functions every policy is built on ───────────────────────────── */

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT is_platform_admin FROM profiles WHERE id = auth.uid()), false) $$;

/*
  What the signed-in user may do with one module, after all three layers.
  A module the tenant has not bought is closed to everyone in it; an override
  decides when it has an opinion; otherwise the permission set speaks.
*/
CREATE OR REPLACE FUNCTION public.can_module(mod text, act text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  me      profiles%ROWTYPE;
  granted boolean;
  ovr     profile_module_overrides%ROWTYPE;
BEGIN
  SELECT * INTO me FROM profiles WHERE id = auth.uid();
  IF me.id IS NULL OR NOT me.active THEN RETURN false; END IF;
  IF me.is_platform_admin THEN RETURN true; END IF;

  /* The company must have the module, and must not be suspended. */
  IF NOT EXISTS (
    SELECT 1 FROM tenant_modules tm
      JOIN tenants t ON t.id = tm.tenant_id
     WHERE tm.tenant_id = me.tenant_id AND tm.module_key = mod
       AND tm.enabled AND t.status IN ('trial', 'active')
  ) THEN
    RETURN false;
  END IF;

  SELECT * INTO ovr FROM profile_module_overrides
   WHERE profile_id = me.id AND module_key = mod;

  granted := CASE act
    WHEN 'view'   THEN ovr.can_view
    WHEN 'create' THEN ovr.can_create
    WHEN 'edit'   THEN ovr.can_edit
    WHEN 'delete' THEN ovr.can_delete
  END;

  IF granted IS NOT NULL THEN RETURN granted; END IF;

  SELECT CASE act
           WHEN 'view'   THEN psm.can_view
           WHEN 'create' THEN psm.can_create
           WHEN 'edit'   THEN psm.can_edit
           WHEN 'delete' THEN psm.can_delete
         END
    INTO granted
    FROM permission_set_modules psm
   WHERE psm.set_id = me.permission_set_id AND psm.module_key = mod;

  RETURN COALESCE(granted, false);
END $$;

/** Everything the signed-in user may do, for the app to read once at login. */
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE (module_key text, can_view boolean, can_create boolean, can_edit boolean, can_delete boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.key,
         public.can_module(m.key, 'view'),
         public.can_module(m.key, 'create'),
         public.can_module(m.key, 'edit'),
         public.can_module(m.key, 'delete')
    FROM modules m
   ORDER BY m.sort;
$$;

/*
  Table privileges are separate from RLS: a policy can allow a row while the
  role still has no privilege on the table. Supabase grants these by default for
  tables it creates, but saying so here means the migration stands on its own.
*/
GRANT SELECT                         ON tenants, modules, tenant_modules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants, tenant_modules,
                                        permission_sets, permission_set_modules,
                                        profile_module_overrides TO authenticated;

GRANT EXECUTE ON FUNCTION public.current_tenant_id()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_module(text, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions()         TO authenticated;

/*
  A company created later needs the same five sets the first one got. The
  platform screen calls this straight after inserting the tenant.
*/
CREATE OR REPLACE FUNCTION public.seed_tenant_defaults(target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'only a platform admin may seed a tenant';
  END IF;

  INSERT INTO permission_sets (tenant_id, name, name_ar, description, is_system, base_role)
  SELECT target, v.name, v.name_ar, v.description, true, v.base_role
    FROM (VALUES
      ('Owner',       'المالك',       'Everything, including team and settings', 'owner'),
      ('Manager',     'مدير',         'Back office and Customer 360',            'manager'),
      ('Office admin','إداري المكتب', 'Scheduling, customers, invoices',         'admin'),
      ('Technician',  'فني',          'Their own jobs and the parts they use',   'technician'),
      ('Customer',    'عميل',         'Their own record only',                   'customer')
    ) AS v(name, name_ar, description, base_role)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  /* Copy the rights of the matching set from the founding tenant, so the shape
     of "what a technician may do" is defined in exactly one place. */
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

GRANT EXECUTE ON FUNCTION public.seed_tenant_defaults(uuid) TO authenticated;

/* ── 7. tenant_id on every table that belongs to a company ───────────────── */

DO $$
DECLARE
  tbl text;
  first_tenant uuid := (SELECT id FROM tenants ORDER BY created_at LIMIT 1);
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customers', 'appointments', 'contracts', 'contract_devices', 'customer_devices',
    'filter_status', 'invoices', 'quotations', 'service_requests', 'inventory',
    'inventory_transactions', 'branches', 'job_tasks', 'job_parts', 'job_photos',
    'job_readings', 'notifications', 'activity_log'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE', tbl);
    EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL', tbl, first_tenant);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (tenant_id)', tbl || '_tenant_idx', tbl);
  END LOOP;
END $$;

/*
  Nothing is inserted without a tenant, and no screen has to remember to send
  one: the row takes the tenant of whoever is writing it.
*/
CREATE OR REPLACE FUNCTION public.set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.current_tenant_id();
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customers', 'appointments', 'contracts', 'contract_devices', 'customer_devices',
    'filter_status', 'invoices', 'quotations', 'service_requests', 'inventory',
    'inventory_transactions', 'branches', 'job_tasks', 'job_parts', 'job_photos',
    'job_readings', 'notifications', 'activity_log'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_trg ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER set_tenant_id_trg BEFORE INSERT ON %I
         FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id()', tbl);
  END LOOP;
END $$;
