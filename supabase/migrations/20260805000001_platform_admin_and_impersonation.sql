/*
  # The superadmin, and seeing the app as someone else

  Three things, in the order they are needed.

  1. WHO THE SUPERADMIN IS
     `is_platform_admin` existed but nothing ever set it, so the platform screen
     was unreachable. The address below is named here, and a trigger re-applies
     it if that account is ever recreated — so the flag cannot be lost by
     deleting and re-inviting the user.

  2. IMPERSONATION THAT THE DATABASE HONOURS
     "View as this user" is only worth anything if the data obeys it. A screen
     that merely hides buttons would still be reading with the superadmin's own
     unrestricted access, so it would show the wrong rows — every tenant's rows —
     and prove nothing about what the user can actually see.

     So impersonation is done one level down: `acting_uid()` replaces `auth.uid()`
     everywhere access is decided. While a superadmin is impersonating, every
     policy, every permission check and the tenant scope itself resolve as the
     target user. `is_platform_admin()` returns FALSE during it — the superadmin
     genuinely loses their own reach for the duration, which is the point.

  3. GUARD RAILS
     · read-only by default — a restrictive policy blocks every insert, update
       and delete while impersonating unless it was started with changes allowed;
     · it expires by itself after an hour;
     · a platform admin cannot be impersonated (no climbing sideways);
     · every session is written to `impersonation_log` with who, whom, why, when
       it started and when it ended.

     Stopping is a SECURITY DEFINER function keyed on the real `auth.uid()`, so
     the way back is never blocked by the restrictions being imposed.
*/

/* ── 1. the superadmin ───────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS platform_admin_emails (
  email      text PRIMARY KEY,
  note       text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO platform_admin_emails (email, note)
VALUES ('datashield.info@gmail.com', 'System owner')
ON CONFLICT (email) DO NOTHING;

/* Apply it to the account as it stands today. */
UPDATE profiles p
   SET is_platform_admin = true, active = true
  FROM auth.users u
 WHERE u.id = p.id
   AND lower(u.email) IN (SELECT lower(email) FROM platform_admin_emails);

/*
  And to the row `handle_new_user` creates, if the account is ever recreated.
  BEFORE INSERT so it costs nothing and cannot fail the signup.
*/
CREATE OR REPLACE FUNCTION public.apply_platform_admin_flag()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM auth.users u
      JOIN platform_admin_emails e ON lower(e.email) = lower(u.email)
     WHERE u.id = NEW.id
  ) THEN
    NEW.is_platform_admin := true;
    NEW.active := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS apply_platform_admin_flag_trg ON profiles;
CREATE TRIGGER apply_platform_admin_flag_trg
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.apply_platform_admin_flag();

/* Only a platform admin may read or change that list. */
ALTER TABLE platform_admin_emails ENABLE ROW LEVEL SECURITY;

/* ── 2. the impersonation state, carried on the admin's own row ──────────── */

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS impersonating_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS impersonation_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS impersonation_read_only  boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS impersonation_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_tenant uuid REFERENCES tenants(id) ON DELETE SET NULL,
  read_only     boolean NOT NULL DEFAULT true,
  reason        text DEFAULT '',
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  ended_reason  text
);

CREATE INDEX IF NOT EXISTS impersonation_log_actor_idx  ON impersonation_log (actor_id, started_at DESC);
CREATE INDEX IF NOT EXISTS impersonation_log_target_idx ON impersonation_log (target_id, started_at DESC);

ALTER TABLE impersonation_log ENABLE ROW LEVEL SECURITY;

/* ── 3. who the database thinks you are ──────────────────────────────────── */

/*
  The real account, never impersonated. Everything that decides *whether*
  impersonation may happen asks this; everything that decides what may be *seen*
  asks acting_uid() below.
*/
CREATE OR REPLACE FUNCTION public.is_real_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_platform_admin AND active FROM profiles WHERE id = auth.uid()), false)
$$;

/*
  Who this request counts as. The target only stands in while the real account
  is a platform admin and the session has not expired — so revoking the flag, or
  simply waiting an hour, ends it without anyone having to press anything.
*/
CREATE OR REPLACE FUNCTION public.acting_uid()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.impersonating_profile_id
       FROM profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_admin
        AND p.active
        AND p.impersonating_profile_id IS NOT NULL
        AND (p.impersonation_expires_at IS NULL OR p.impersonation_expires_at > now())),
    auth.uid())
$$;

/** True while impersonating a user without permission to change anything. */
CREATE OR REPLACE FUNCTION public.impersonation_read_only()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.impersonation_read_only
      FROM profiles p
     WHERE p.id = auth.uid()
       AND p.impersonating_profile_id IS NOT NULL
       AND p.impersonating_profile_id <> p.id
       AND p.is_platform_admin
       AND p.active
       AND (p.impersonation_expires_at IS NULL OR p.impersonation_expires_at > now())
  ), false)
$$;

GRANT EXECUTE ON FUNCTION public.is_real_platform_admin()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.acting_uid()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.impersonation_read_only()  TO authenticated;

/* ── 4. every access decision re-pointed at acting_uid() ─────────────────── */

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT tenant_id FROM profiles WHERE id = public.acting_uid() $$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_platform_admin FROM profiles WHERE id = public.acting_uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.my_customer_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM customers WHERE user_id = public.acting_uid() $$;

CREATE OR REPLACE FUNCTION public.writes_own_only()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT ps.own_records_only
      FROM profiles p JOIN permission_sets ps ON ps.id = p.permission_set_id
     WHERE p.id = public.acting_uid()
  ), false)
$$;

/* The three-layer resolution, now answering for whoever is being acted as. */
CREATE OR REPLACE FUNCTION public.can_module(mod text, act text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  me      profiles%ROWTYPE;
  granted boolean;
  ovr     profile_module_overrides%ROWTYPE;
BEGIN
  SELECT * INTO me FROM profiles WHERE id = public.acting_uid();
  IF me.id IS NULL OR NOT me.active THEN RETURN false; END IF;
  IF me.is_platform_admin THEN RETURN true; END IF;

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

/* ── 5. the policies that name auth.uid() directly ───────────────────────── */

/*
  These decide "is this row mine?" — a technician's own job, a customer's own
  record, a person's own notifications. While impersonating, "mine" must mean
  the target's, or viewing as a technician would show an empty day.
*/

DROP POLICY IF EXISTS appointments_own_write ON appointments;
CREATE POLICY appointments_own_write ON appointments
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT public.writes_own_only() OR technician_id = public.acting_uid());

DROP POLICY IF EXISTS invoices_own_write ON invoices;
CREATE POLICY invoices_own_write ON invoices
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT public.writes_own_only() OR technician_id = public.acting_uid());

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['job_tasks', 'job_parts', 'job_photos', 'job_readings'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_own_write', tbl);
    EXECUTE format($f$
      CREATE POLICY %I ON %I AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (
          NOT public.writes_own_only()
          OR EXISTS (SELECT 1 FROM appointments a
                      WHERE a.id = %I.appointment_id AND a.technician_id = public.acting_uid())
        )$f$, tbl || '_own_write', tbl, tbl);
  END LOOP;
END $$;

DROP POLICY IF EXISTS customers_portal_read ON customers;
CREATE POLICY customers_portal_read ON customers
  FOR SELECT TO authenticated USING (user_id = public.acting_uid());

DROP POLICY IF EXISTS notifications_own_read ON notifications;
CREATE POLICY notifications_own_read ON notifications
  FOR SELECT TO authenticated
  USING (user_id = public.acting_uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS notifications_own_update ON notifications;
CREATE POLICY notifications_own_update ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = public.acting_uid()) WITH CHECK (user_id = public.acting_uid());

DROP POLICY IF EXISTS notifications_staff_insert ON notifications;
CREATE POLICY notifications_staff_insert ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR user_id = public.acting_uid()
    OR EXISTS (SELECT 1 FROM profiles p
                WHERE p.id = notifications.user_id
                  AND p.tenant_id = public.current_tenant_id())
  );

/*
  Profiles. Reading follows the acting user; writing your own row keeps the real
  account as well, so a superadmin is never locked out of their own settings.
*/
DROP POLICY IF EXISTS profiles_read ON profiles;
CREATE POLICY profiles_read ON profiles FOR SELECT TO authenticated
  USING (id = public.acting_uid()
         OR id = auth.uid()
         OR public.is_platform_admin()
         OR tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS profiles_self_update ON profiles;
CREATE POLICY profiles_self_update ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR id = public.acting_uid())
  WITH CHECK (id = auth.uid() OR id = public.acting_uid());

DROP POLICY IF EXISTS profiles_insert_self ON profiles;
CREATE POLICY profiles_insert_self ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_platform_admin()
              OR (tenant_id = public.current_tenant_id() AND public.can_module('team', 'create')));

/*
  Nobody may hand themselves the platform flag, or park an impersonation on
  someone else's row. Both are written only by the functions below, which are
  SECURITY DEFINER and check the caller first.
*/
CREATE OR REPLACE FUNCTION public.guard_privileged_profile_columns()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  /* Set by the seeding trigger, the functions below, or a superadmin. */
  IF current_setting('app.privileged_profile_write', true) = 'on'
     OR public.is_real_platform_admin() THEN
    RETURN NEW;
  END IF;

  NEW.is_platform_admin        := OLD.is_platform_admin;
  NEW.impersonating_profile_id := OLD.impersonating_profile_id;
  NEW.impersonation_expires_at := OLD.impersonation_expires_at;
  NEW.impersonation_read_only  := OLD.impersonation_read_only;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_privileged_profile_columns_trg ON profiles;
CREATE TRIGGER guard_privileged_profile_columns_trg
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_profile_columns();

/* ── 6. read-only while impersonating ────────────────────────────────────── */

/*
  Restrictive, so it is AND-ed with everything else and can only take away. The
  default is to look without touching; a superadmin who needs to reproduce a
  save starts the session with changes allowed, and it is in the log either way.
*/
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customers', 'appointments', 'contracts', 'contract_devices', 'customer_devices',
    'filter_status', 'invoices', 'quotations', 'service_requests', 'inventory',
    'inventory_transactions', 'branches', 'job_tasks', 'job_parts', 'job_photos',
    'job_readings', 'notifications', 'activity_log', 'profiles',
    'permission_sets', 'permission_set_modules', 'profile_module_overrides',
    'tenants', 'tenant_modules'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_no_write_when_viewing', tbl);
    EXECUTE format($f$
      CREATE POLICY %I ON %I AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (NOT public.impersonation_read_only())$f$,
      tbl || '_no_write_when_viewing', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_no_update_when_viewing', tbl);
    EXECUTE format($f$
      CREATE POLICY %I ON %I AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (NOT public.impersonation_read_only())$f$,
      tbl || '_no_update_when_viewing', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_no_delete_when_viewing', tbl);
    EXECUTE format($f$
      CREATE POLICY %I ON %I AS RESTRICTIVE FOR DELETE TO authenticated
        USING (NOT public.impersonation_read_only())$f$,
      tbl || '_no_delete_when_viewing', tbl);
  END LOOP;
END $$;

/* ── 7. starting, stopping, and looking at it ────────────────────────────── */

CREATE OR REPLACE FUNCTION public.start_impersonation(
  target uuid,
  allow_changes boolean DEFAULT false,
  reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  victim profiles%ROWTYPE;
BEGIN
  IF NOT public.is_real_platform_admin() THEN
    RAISE EXCEPTION 'only a platform admin may view the app as another user';
  END IF;

  SELECT * INTO victim FROM profiles WHERE id = target;

  IF victim.id IS NULL THEN
    RAISE EXCEPTION 'no such user';
  END IF;
  IF victim.id = auth.uid() THEN
    RAISE EXCEPTION 'that is already you';
  END IF;
  IF victim.is_platform_admin THEN
    RAISE EXCEPTION 'a platform admin cannot be impersonated';
  END IF;

  /* Any session left open by a browser that was simply closed. */
  UPDATE impersonation_log
     SET ended_at = now(), ended_reason = 'superseded'
   WHERE actor_id = auth.uid() AND ended_at IS NULL;

  INSERT INTO impersonation_log (actor_id, target_id, target_tenant, read_only, reason)
  VALUES (auth.uid(), target, victim.tenant_id, NOT allow_changes, COALESCE(reason, ''));

  PERFORM set_config('app.privileged_profile_write', 'on', true);
  UPDATE profiles
     SET impersonating_profile_id = target,
         impersonation_expires_at = now() + interval '60 minutes',
         impersonation_read_only  = NOT allow_changes
   WHERE id = auth.uid();
  PERFORM set_config('app.privileged_profile_write', 'off', true);
END $$;

/*
  Keyed on the real auth.uid() and SECURITY DEFINER, so it works even though
  everything else is being refused — the way back is never blocked.
*/
CREATE OR REPLACE FUNCTION public.stop_impersonation()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE impersonation_log
     SET ended_at = now(), ended_reason = 'stopped'
   WHERE actor_id = auth.uid() AND ended_at IS NULL;

  PERFORM set_config('app.privileged_profile_write', 'on', true);
  UPDATE profiles
     SET impersonating_profile_id = NULL,
         impersonation_expires_at = NULL,
         impersonation_read_only  = true
   WHERE id = auth.uid();
  PERFORM set_config('app.privileged_profile_write', 'off', true);
END $$;

/** What the banner shows: who I really am, who I am acting as, until when. */
CREATE OR REPLACE FUNCTION public.my_impersonation()
RETURNS TABLE (
  target_id    uuid,
  target_name  text,
  target_role  text,
  tenant_id    uuid,
  tenant_name  text,
  read_only    boolean,
  expires_at   timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT t.id, t.full_name, t.role, t.tenant_id, ten.name,
         me.impersonation_read_only, me.impersonation_expires_at
    FROM profiles me
    JOIN profiles t ON t.id = me.impersonating_profile_id
    LEFT JOIN tenants ten ON ten.id = t.tenant_id
   WHERE me.id = auth.uid()
     AND me.is_platform_admin
     AND (me.impersonation_expires_at IS NULL OR me.impersonation_expires_at > now())
$$;

/*
  Everyone on the platform, for the superadmin's screen — including the email,
  which lives in auth.users and is not otherwise readable from the client.
*/
CREATE OR REPLACE FUNCTION public.platform_directory()
RETURNS TABLE (
  id                uuid,
  full_name         text,
  email             text,
  role              text,
  tenant_id         uuid,
  permission_set_id uuid,
  active            boolean,
  is_platform_admin boolean,
  created_at        timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, u.email::text, p.role, p.tenant_id, p.permission_set_id,
         p.active, p.is_platform_admin, p.created_at
    FROM profiles p
    LEFT JOIN auth.users u ON u.id = p.id
   WHERE public.is_real_platform_admin()
   ORDER BY p.tenant_id, p.full_name
$$;

/** The audit trail, for the superadmin's screen. */
CREATE OR REPLACE FUNCTION public.impersonation_history(limit_rows int DEFAULT 50)
RETURNS TABLE (
  id           uuid,
  actor_name   text,
  target_name  text,
  tenant_name  text,
  read_only    boolean,
  reason       text,
  started_at   timestamptz,
  ended_at     timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT l.id, a.full_name, t.full_name, ten.name, l.read_only, l.reason,
         l.started_at, l.ended_at
    FROM impersonation_log l
    LEFT JOIN profiles a  ON a.id = l.actor_id
    LEFT JOIN profiles t  ON t.id = l.target_id
    LEFT JOIN tenants ten ON ten.id = l.target_tenant
   WHERE public.is_real_platform_admin()
   ORDER BY l.started_at DESC
   LIMIT GREATEST(limit_rows, 1)
$$;

GRANT EXECUTE ON FUNCTION public.start_impersonation(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stop_impersonation()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_impersonation()                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_directory()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.impersonation_history(int)               TO authenticated;

/*
  The superadmin manages other companies' people from their own screen, so the
  directory is read through the function above rather than the table — but the
  team screen still needs to write those rows, which the existing
  `profiles_team_manage` policy already allows a platform admin to do.
*/
