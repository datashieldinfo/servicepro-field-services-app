-- ============================================================================
-- ServisGo Complete Setup — Schema + Seed Data
-- Single file replaces all previous migrations.
-- Zero Arabic characters. Fully idempotent (IF NOT EXISTS / DROP IF EXISTS).
-- Run once in Supabase SQL Editor after a clean project.
-- ============================================================================

-- ============================================================================
-- CLEANUP: Wipe all seed data before re-inserting (safe to re-run)
-- ============================================================================

DELETE FROM service_requests WHERE true;
DELETE FROM notifications    WHERE true;
DELETE FROM filter_status    WHERE true;
DELETE FROM job_tasks        WHERE true;
DELETE FROM job_parts        WHERE true;
DELETE FROM job_photos       WHERE true;
DELETE FROM job_readings     WHERE true;
DELETE FROM activity_log     WHERE true;
DELETE FROM appointments     WHERE true;
DELETE FROM inventory        WHERE true;
DELETE FROM customers        WHERE true;
DELETE FROM profiles WHERE id IN (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000004'
);

-- ============================================================================
-- PART 1: SCHEMA
-- ============================================================================

-- ── 1.1 profiles ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text NOT NULL DEFAULT '',
  role       text NOT NULL DEFAULT 'customer'
    CHECK (role IN ('owner','technician','admin','customer')),
  phone      text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile"                ON profiles;
DROP POLICY IF EXISTS "Users can update own profile"              ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile"              ON profiles;
DROP POLICY IF EXISTS "Admins and owners can read all profiles"   ON profiles;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins and owners can read all profiles"
  ON profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','owner')));
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── 1.2 customers ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  phone               text NOT NULL DEFAULT '',
  email               text DEFAULT '',
  address             text NOT NULL DEFAULT '',
  last_service_date   date,
  next_appointment    date,
  user_id             uuid REFERENCES profiles(id) ON DELETE SET NULL,
  contract_type       text DEFAULT 'quarterly'
    CHECK (contract_type IN ('monthly','quarterly','biannual','annual')),
  warranty_expires    date,
  device_install_date date,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Add new columns to existing tables (no-op if already present)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id             uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contract_type       text DEFAULT 'quarterly';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS warranty_expires    date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS device_install_date date;

CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_key
  ON customers(user_id) WHERE user_id IS NOT NULL;

DROP POLICY IF EXISTS "Owner can read all customers"              ON customers;
DROP POLICY IF EXISTS "Admin can read all customers"              ON customers;
DROP POLICY IF EXISTS "Admin can insert customers"                ON customers;
DROP POLICY IF EXISTS "Admin can update customers"                ON customers;
DROP POLICY IF EXISTS "Customers can view own customer record"    ON customers;
DROP POLICY IF EXISTS "Users can insert own customer record"      ON customers;

CREATE POLICY "Owner can read all customers"
  ON customers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner'));
CREATE POLICY "Admin can read all customers"
  ON customers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Admin can insert customers"
  ON customers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Admin can update customers"
  ON customers FOR UPDATE TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Customers can view own customer record"
  ON customers FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own customer record"
  ON customers FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ── 1.3 appointments ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid REFERENCES customers(id) ON DELETE CASCADE,
  technician_id        uuid REFERENCES profiles(id)  ON DELETE SET NULL,
  service_type         text NOT NULL DEFAULT '',
  scheduled_at         timestamptz NOT NULL DEFAULT now(),
  status               text NOT NULL DEFAULT 'pending',
  address              text NOT NULL DEFAULT '',
  notes                text DEFAULT '',
  confirmed            boolean DEFAULT false,
  approval_notes       text DEFAULT '',
  approval_granted     boolean DEFAULT false,
  tds_before           integer,
  tds_after            integer,
  followup_recommended boolean DEFAULT false,
  followup_days        integer,
  followup_reason      text DEFAULT '',
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Add new columns to existing tables
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS confirmed            boolean DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS approval_notes       text DEFAULT '';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS approval_granted     boolean DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tds_before           integer;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tds_after            integer;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS followup_recommended boolean DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS followup_days        integer;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS followup_reason      text DEFAULT '';

-- Apply full status constraint (adds awaiting_approval)
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending','in_progress','awaiting_approval','completed','cancelled'));

DROP POLICY IF EXISTS "Owner can read all appointments"           ON appointments;
DROP POLICY IF EXISTS "Admin can read all appointments"           ON appointments;
DROP POLICY IF EXISTS "Technician can read own appointments"      ON appointments;
DROP POLICY IF EXISTS "Admin and Owner can insert appointments"   ON appointments;
DROP POLICY IF EXISTS "Admin and Owner can update appointments"   ON appointments;
DROP POLICY IF EXISTS "Customers can view own appointments"       ON appointments;
DROP POLICY IF EXISTS "Customers can confirm own appointments"    ON appointments;
DROP POLICY IF EXISTS "Customers can insert own appointments"     ON appointments;
DROP POLICY IF EXISTS "Technicians can update own appointments"   ON appointments;

CREATE POLICY "Owner can read all appointments"
  ON appointments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner'));
CREATE POLICY "Admin can read all appointments"
  ON appointments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Technician can read own appointments"
  ON appointments FOR SELECT TO authenticated USING (technician_id = auth.uid());
CREATE POLICY "Admin and Owner can insert appointments"
  ON appointments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Admin and Owner can update appointments"
  ON appointments FOR UPDATE TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Customers can view own appointments"
  ON appointments FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));
CREATE POLICY "Customers can confirm own appointments"
  ON appointments FOR UPDATE TO authenticated
  USING  (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()))
  WITH CHECK (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));
CREATE POLICY "Customers can insert own appointments"
  ON appointments FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));
CREATE POLICY "Technicians can update own appointments"
  ON appointments FOR UPDATE TO authenticated
  USING (technician_id = auth.uid()) WITH CHECK (technician_id = auth.uid());

-- ── 1.4 inventory ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_name           text NOT NULL,
  quantity            integer NOT NULL DEFAULT 0,
  unit                text NOT NULL DEFAULT 'pcs',
  low_stock_threshold integer NOT NULL DEFAULT 5,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read inventory"             ON inventory;
DROP POLICY IF EXISTS "Admin can read inventory"             ON inventory;
DROP POLICY IF EXISTS "Technician can read inventory"        ON inventory;
DROP POLICY IF EXISTS "Admin and Owner can insert inventory" ON inventory;
DROP POLICY IF EXISTS "Admin and Owner can update inventory" ON inventory;

CREATE POLICY "Owner can read inventory"
  ON inventory FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner'));
CREATE POLICY "Admin can read inventory"
  ON inventory FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Technician can read inventory"
  ON inventory FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'technician'));
CREATE POLICY "Admin and Owner can insert inventory"
  ON inventory FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Admin and Owner can update inventory"
  ON inventory FOR UPDATE TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));

-- ── 1.5 activity_log ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action      text NOT NULL,
  description text NOT NULL DEFAULT '',
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read activity log"                 ON activity_log;
DROP POLICY IF EXISTS "Admin can read activity log"                 ON activity_log;
DROP POLICY IF EXISTS "Authenticated users can insert activity log" ON activity_log;

CREATE POLICY "Owner can read activity log"
  ON activity_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner'));
CREATE POLICY "Admin can read activity log"
  ON activity_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
CREATE POLICY "Authenticated users can insert activity log"
  ON activity_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── 1.6 job_tasks ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  title          text NOT NULL,
  completed      boolean DEFAULT false,
  completed_at   timestamptz,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE job_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Technicians can view tasks for their jobs"              ON job_tasks;
DROP POLICY IF EXISTS "Admins and owners can view all job tasks"               ON job_tasks;
DROP POLICY IF EXISTS "Technicians can update their job tasks"                 ON job_tasks;
DROP POLICY IF EXISTS "Admins can insert job tasks"                            ON job_tasks;
DROP POLICY IF EXISTS "Customers can view job tasks for their appointments"    ON job_tasks;

CREATE POLICY "Technicians can view tasks for their jobs"
  ON job_tasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM appointments WHERE appointments.id = job_tasks.appointment_id AND appointments.technician_id = auth.uid()));
CREATE POLICY "Admins and owners can view all job tasks"
  ON job_tasks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Technicians can update their job tasks"
  ON job_tasks FOR UPDATE TO authenticated
  USING  (EXISTS (SELECT 1 FROM appointments WHERE appointments.id = job_tasks.appointment_id AND appointments.technician_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM appointments WHERE appointments.id = job_tasks.appointment_id AND appointments.technician_id = auth.uid()));
CREATE POLICY "Admins can insert job tasks"
  ON job_tasks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Customers can view job tasks for their appointments"
  ON job_tasks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM appointments a JOIN customers c ON c.id = a.customer_id
    WHERE a.id = job_tasks.appointment_id AND c.user_id = auth.uid()
  ));

-- ── 1.7 job_parts ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_parts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  inventory_id   uuid NOT NULL REFERENCES inventory(id),
  quantity_used  integer DEFAULT 1,
  notes          text DEFAULT '',
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE job_parts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Technicians can view parts for their jobs"             ON job_parts;
DROP POLICY IF EXISTS "Admins and owners can view all job parts"              ON job_parts;
DROP POLICY IF EXISTS "Technicians can insert parts for their jobs"           ON job_parts;
DROP POLICY IF EXISTS "Customers can view job parts for their appointments"   ON job_parts;

CREATE POLICY "Technicians can view parts for their jobs"
  ON job_parts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM appointments WHERE appointments.id = job_parts.appointment_id AND appointments.technician_id = auth.uid()));
CREATE POLICY "Admins and owners can view all job parts"
  ON job_parts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Technicians can insert parts for their jobs"
  ON job_parts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM appointments WHERE appointments.id = job_parts.appointment_id AND appointments.technician_id = auth.uid()));
CREATE POLICY "Customers can view job parts for their appointments"
  ON job_parts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM appointments a JOIN customers c ON c.id = a.customer_id
    WHERE a.id = job_parts.appointment_id AND c.user_id = auth.uid()
  ));

-- ── 1.8 job_photos ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_photos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  url            text NOT NULL,
  caption        text DEFAULT '',
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Technicians can view photos for their jobs"    ON job_photos;
DROP POLICY IF EXISTS "Admins and owners can view all job photos"     ON job_photos;
DROP POLICY IF EXISTS "Technicians can upload photos for their jobs"  ON job_photos;

CREATE POLICY "Technicians can view photos for their jobs"
  ON job_photos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM appointments WHERE appointments.id = job_photos.appointment_id AND appointments.technician_id = auth.uid()));
CREATE POLICY "Admins and owners can view all job photos"
  ON job_photos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Technicians can upload photos for their jobs"
  ON job_photos FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM appointments WHERE appointments.id = job_photos.appointment_id AND appointments.technician_id = auth.uid()));

-- ── 1.9 notifications ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id),
  type       text NOT NULL DEFAULT 'reminder'
    CHECK (type IN ('reminder','offer','alert')),
  message    text NOT NULL,
  is_read    boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications"    ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications"  ON notifications;
DROP POLICY IF EXISTS "System can insert notifications for users" ON notifications;
DROP POLICY IF EXISTS "Users can insert own notifications"        ON notifications;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "System can insert notifications for users"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ── 1.10 filter_status ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS filter_status (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    uuid NOT NULL REFERENCES customers(id),
  location       text NOT NULL,
  filter_type    text NOT NULL DEFAULT '',
  last_replaced  date,
  next_due       date,
  health_percent integer DEFAULT 100,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE filter_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view their own filter status"     ON filter_status;
DROP POLICY IF EXISTS "Customers can view own filter status"           ON filter_status;
DROP POLICY IF EXISTS "Admins and owners can view all filter statuses" ON filter_status;
DROP POLICY IF EXISTS "Admins can manage filter statuses"              ON filter_status;
DROP POLICY IF EXISTS "Admins can update filter statuses"              ON filter_status;
DROP POLICY IF EXISTS "Customers can insert own filter status"         ON filter_status;

CREATE POLICY "Customers can view own filter status"
  ON filter_status FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));
CREATE POLICY "Admins and owners can view all filter statuses"
  ON filter_status FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner','technician')));
CREATE POLICY "Admins can manage filter statuses"
  ON filter_status FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner','technician')));
CREATE POLICY "Admins can update filter statuses"
  ON filter_status FOR UPDATE TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner','technician')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner','technician')));
CREATE POLICY "Customers can insert own filter status"
  ON filter_status FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- ── 1.11 service_requests ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  trigger_type          text NOT NULL CHECK (trigger_type IN (
    'schedule','part_due','complaint','followup','test_fail',
    'warranty','emergency','unknown_history','customer_request'
  )),
  urgency               text NOT NULL DEFAULT 'medium'
    CHECK (urgency IN ('low','medium','high','emergency')),
  description           text DEFAULT '',
  triggered_by          text NOT NULL DEFAULT 'system'
    CHECK (triggered_by IN ('system','customer','technician','admin')),
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','scheduled','dismissed')),
  linked_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  suggested_date        date,
  created_at            timestamptz DEFAULT now(),
  resolved_at           timestamptz
);

ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can insert own service requests"       ON service_requests;
DROP POLICY IF EXISTS "Customers can view own service requests"         ON service_requests;
DROP POLICY IF EXISTS "Technicians can insert service requests"         ON service_requests;
DROP POLICY IF EXISTS "Admins and owners can read all service requests" ON service_requests;
DROP POLICY IF EXISTS "Admins and owners can update service requests"   ON service_requests;
DROP POLICY IF EXISTS "Admins and owners can insert service requests"   ON service_requests;

CREATE POLICY "Customers can insert own service requests"
  ON service_requests FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));
CREATE POLICY "Customers can view own service requests"
  ON service_requests FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));
CREATE POLICY "Technicians can insert service requests"
  ON service_requests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'technician'));
CREATE POLICY "Admins and owners can read all service requests"
  ON service_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Admins and owners can update service requests"
  ON service_requests FOR UPDATE TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));
CREATE POLICY "Admins and owners can insert service requests"
  ON service_requests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));

-- ── 1.12 job_readings ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_readings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  tds_before     integer,
  tds_after      integer,
  recorded_at    timestamptz DEFAULT now()
);

ALTER TABLE job_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Technicians can insert readings for their jobs"        ON job_readings;
DROP POLICY IF EXISTS "Technicians can view readings for their jobs"          ON job_readings;
DROP POLICY IF EXISTS "Customers can view readings for their appointments"    ON job_readings;
DROP POLICY IF EXISTS "Admins and owners can view all readings"               ON job_readings;

CREATE POLICY "Technicians can insert readings for their jobs"
  ON job_readings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM appointments WHERE appointments.id = job_readings.appointment_id AND appointments.technician_id = auth.uid()));
CREATE POLICY "Technicians can view readings for their jobs"
  ON job_readings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM appointments WHERE appointments.id = job_readings.appointment_id AND appointments.technician_id = auth.uid()));
CREATE POLICY "Customers can view readings for their appointments"
  ON job_readings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM appointments a JOIN customers c ON c.id = a.customer_id
    WHERE a.id = job_readings.appointment_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "Admins and owners can view all readings"
  ON job_readings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));

-- ── 1.13 check_filter_triggers function + trigger ─────────────────────────────

CREATE OR REPLACE FUNCTION check_filter_triggers()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- part_due medium: next_due within 14 days
  INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by)
  SELECT DISTINCT fs.customer_id, 'part_due', 'medium',
    'Filter ' || fs.filter_type || ' at ' || fs.location || ' needs replacement soon',
    'system'
  FROM filter_status fs
  WHERE fs.next_due IS NOT NULL
    AND fs.next_due <= CURRENT_DATE + INTERVAL '14 days'
    AND NOT EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.customer_id = fs.customer_id AND sr.trigger_type = 'part_due'
        AND sr.urgency = 'medium' AND sr.status = 'pending'
        AND sr.created_at > NOW() - INTERVAL '7 days'
    );

  -- part_due high: health < 25%
  INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by)
  SELECT DISTINCT fs.customer_id, 'part_due', 'high',
    'Filter ' || fs.filter_type || ' is in critical condition (' || fs.health_percent || '% health remaining)',
    'system'
  FROM filter_status fs
  WHERE fs.health_percent < 25
    AND NOT EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.customer_id = fs.customer_id AND sr.trigger_type = 'part_due'
        AND sr.urgency = 'high' AND sr.status = 'pending'
        AND sr.created_at > NOW() - INTERVAL '7 days'
    );

  -- unknown_history: customers with no filter_status
  INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by)
  SELECT c.id, 'unknown_history', 'medium',
    'No filter history on record for this customer - assessment visit recommended',
    'system'
  FROM customers c
  WHERE NOT EXISTS (SELECT 1 FROM filter_status fs WHERE fs.customer_id = c.id)
    AND NOT EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.customer_id = c.id AND sr.trigger_type = 'unknown_history'
        AND sr.status = 'pending' AND sr.created_at > NOW() - INTERVAL '30 days'
    );

  -- warranty: expires within 30 days
  INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by)
  SELECT c.id, 'warranty', 'medium',
    'Device warranty expires on ' || TO_CHAR(c.warranty_expires, 'DD/MM/YYYY'),
    'system'
  FROM customers c
  WHERE c.warranty_expires IS NOT NULL
    AND c.warranty_expires <= CURRENT_DATE + INTERVAL '30 days'
    AND c.warranty_expires >= CURRENT_DATE
    AND NOT EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.customer_id = c.id AND sr.trigger_type = 'warranty'
        AND sr.status = 'pending' AND sr.created_at > NOW() - INTERVAL '14 days'
    );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS check_triggers_on_filter_change ON filter_status;
CREATE TRIGGER check_triggers_on_filter_change
  AFTER INSERT OR UPDATE ON filter_status
  FOR EACH STATEMENT EXECUTE FUNCTION check_filter_triggers();


-- ============================================================================
-- PART 2: SEED DATA
-- ============================================================================

-- ── Cleanup: remove previous seed rows so this file is safe to re-run ────────

DELETE FROM service_requests WHERE customer_id IN (
  SELECT id FROM customers WHERE email IN (
    'info@alamal-clinic.jo','manager@zeitouna.jo','admin@nahda-school.jo',
    'ops@lavender-hotel.jo','facilities@digitech.jo','pharmacy@alshifa.jo',
    'info@kawthar-mall.jo','office@aql-law.jo'
  )
);
DELETE FROM filter_status WHERE customer_id IN (
  SELECT id FROM customers WHERE email = 'info@alamal-clinic.jo'
);
DELETE FROM notifications WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000004';
DELETE FROM job_parts  WHERE appointment_id IN (
  '11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103','11111111-1111-1111-1111-111111111104',
  '11111111-1111-1111-1111-111111111105'
);
DELETE FROM job_tasks  WHERE appointment_id IN (
  '11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103','11111111-1111-1111-1111-111111111104',
  '11111111-1111-1111-1111-111111111105'
);
DELETE FROM appointments WHERE id IN (
  '11111111-1111-1111-1111-111111111101','11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103','11111111-1111-1111-1111-111111111104',
  '11111111-1111-1111-1111-111111111105'
);

-- ── 1. Customers ─────────────────────────────────────────────────────────────

INSERT INTO customers (name, phone, email, address, last_service_date, next_appointment) VALUES
  ('Al Amal Medical Clinic',   '0791234567', 'info@alamal-clinic.jo',  'University Street, Jubeiha, Amman', '2026-05-15', '2026-06-15'),
  ('Al Zeitouneh Restaurant',  '0779876543', 'manager@zeitouna.jo',    'Sweifieh, Amman',                   '2026-05-10', '2026-06-10'),
  ('Al Nahda Private School',  '0783334444', 'admin@nahda-school.jo',  'Khalda, Amman',                     '2026-04-20', '2026-07-20'),
  ('Lavender Hotel Amman',     '0785558888', 'ops@lavender-hotel.jo',  'Shmeisani, Amman',                  '2026-05-01', '2026-06-01'),
  ('Digital Technology Co.',   '0782223333', 'facilities@digitech.jo', 'Al Rabieh, Amman',                  '2026-05-18', '2026-06-18'),
  ('Al Shifa Pharmacy',        '0774445555', 'pharmacy@alshifa.jo',    'Abdali, Amman',                     '2026-04-30', '2026-05-30'),
  ('Al Kawthar Mall',          '0796667777', 'info@kawthar-mall.jo',   'Marj Al Hamam, Amman',              '2026-05-12', '2026-06-12'),
  ('Aql Law Office',           '0778889999', 'office@aql-law.jo',      'Wadi Al Seer, Amman',               '2026-05-05', '2026-06-05')
ON CONFLICT DO NOTHING;

-- Normalise any previously seeded Arabic names to English
UPDATE customers SET name = 'Al Amal Medical Clinic',  address = 'University Street, Jubeiha, Amman' WHERE email = 'info@alamal-clinic.jo';
UPDATE customers SET name = 'Al Zeitouneh Restaurant', address = 'Sweifieh, Amman'                    WHERE email = 'manager@zeitouna.jo';
UPDATE customers SET name = 'Al Nahda Private School', address = 'Khalda, Amman'                      WHERE email = 'admin@nahda-school.jo';
UPDATE customers SET name = 'Lavender Hotel Amman',    address = 'Shmeisani, Amman'                   WHERE email = 'ops@lavender-hotel.jo';
UPDATE customers SET name = 'Digital Technology Co.',  address = 'Al Rabieh, Amman'                   WHERE email = 'facilities@digitech.jo';
UPDATE customers SET name = 'Al Shifa Pharmacy',       address = 'Abdali, Amman'                      WHERE email = 'pharmacy@alshifa.jo';
UPDATE customers SET name = 'Al Kawthar Mall',         address = 'Marj Al Hamam, Amman'               WHERE email = 'info@kawthar-mall.jo';
UPDATE customers SET name = 'Aql Law Office',          address = 'Wadi Al Seer, Amman'                WHERE email = 'office@aql-law.jo';

-- ── 2. Inventory ─────────────────────────────────────────────────────────────

INSERT INTO inventory (part_name, quantity, unit, low_stock_threshold) VALUES
  ('Sediment Filter 5 Micron',   45,  'pcs',  10),
  ('Active Carbon Filter',       38,  'pcs',  10),
  ('Block Carbon Filter',        30,  'pcs',   8),
  ('RO Membrane 75 GPD',          8,  'pcs',   3),
  ('RO Membrane 100 GPD',         5,  'pcs',   2),
  ('Post Carbon Filter',         28,  'pcs',   8),
  ('Pressure Tank 3.2 Gallon',    6,  'pcs',   2),
  ('Pressure Pump',               4,  'pcs',   2),
  ('O-Ring Seals',              200,  'pcs',  50),
  ('Food Grade Silicone Grease', 15, 'tube',   5)
ON CONFLICT DO NOTHING;

-- Normalise any previously seeded Arabic inventory (identified by unique quantity)
UPDATE inventory SET part_name = 'Sediment Filter 5 Micron',  unit = 'pcs'  WHERE quantity = 45;
UPDATE inventory SET part_name = 'Active Carbon Filter',       unit = 'pcs'  WHERE quantity = 38;
UPDATE inventory SET part_name = 'Block Carbon Filter',        unit = 'pcs'  WHERE quantity = 30;
UPDATE inventory SET part_name = 'RO Membrane 75 GPD',         unit = 'pcs'  WHERE quantity = 8;
UPDATE inventory SET part_name = 'RO Membrane 100 GPD',        unit = 'pcs'  WHERE quantity = 5;
UPDATE inventory SET part_name = 'Post Carbon Filter',         unit = 'pcs'  WHERE quantity = 28;
UPDATE inventory SET part_name = 'Pressure Tank 3.2 Gallon',   unit = 'pcs'  WHERE quantity = 6;
UPDATE inventory SET part_name = 'Pressure Pump',              unit = 'pcs'  WHERE quantity = 4;
UPDATE inventory SET part_name = 'O-Ring Seals',               unit = 'pcs'  WHERE quantity = 200;
UPDATE inventory SET part_name = 'Food Grade Silicone Grease', unit = 'tube' WHERE quantity = 15;

-- ── 3. Profiles (demo accounts with fixed UUIDs) ─────────────────────────────
-- profiles.id FK to auth.users is bypassed via session_replication_role.
-- When a demo user logs in, their real auth row is created and the profile
-- upserted — the FK becomes satisfied at that point.

SET session_replication_role = 'replica';

INSERT INTO profiles (id, full_name, role) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ahmad Al-Sharif',  'owner'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Sami Al-Atabi',    'technician'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Noura Al-Qahtani', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Fahad Al-Malki',   'customer')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role      = EXCLUDED.role;

SET session_replication_role = DEFAULT;

-- Link demo customer profile to Al Amal Medical Clinic
UPDATE customers
SET user_id = 'aaaaaaaa-0000-0000-0000-000000000004'
WHERE email = 'info@alamal-clinic.jo';

-- ── 4. Appointments (3 today + 2 past completed) ─────────────────────────────

INSERT INTO appointments (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT '11111111-1111-1111-1111-111111111101'::uuid, c.id,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'Periodic Maintenance',
  (CURRENT_DATE + interval '9 hours')::timestamptz, 'in_progress',
  'University Street, Jubeiha, Amman',
  'Full periodic maintenance of RO water purification unit', true
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT '11111111-1111-1111-1111-111111111102'::uuid, c.id,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'Filter Replacement',
  (CURRENT_DATE + interval '13 hours 30 minutes')::timestamptz, 'pending',
  'Sweifieh, Amman',
  'Replace sediment, carbon filters and inspect RO membrane', false
FROM customers c WHERE c.email = 'manager@zeitouna.jo' LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT '11111111-1111-1111-1111-111111111103'::uuid, c.id,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'RO System Inspection',
  (CURRENT_DATE + interval '16 hours')::timestamptz, 'pending',
  'Khalda, Amman',
  'Quarterly inspection and membrane condition assessment', false
FROM customers c WHERE c.email = 'admin@nahda-school.jo' LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT '11111111-1111-1111-1111-111111111104'::uuid, c.id,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'Filter Replacement',
  (CURRENT_DATE - interval '3 days' + interval '10 hours')::timestamptz, 'completed',
  'Shmeisani, Amman',
  'All three filters replaced successfully', true
FROM customers c WHERE c.email = 'ops@lavender-hotel.jo' LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT '11111111-1111-1111-1111-111111111105'::uuid, c.id,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'Emergency Repair',
  (CURRENT_DATE - interval '5 days' + interval '11 hours')::timestamptz, 'completed',
  'Al Rabieh, Amman',
  'Pressure pump replaced and unit recalibrated', true
FROM customers c WHERE c.email = 'facilities@digitech.jo' LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- ── 5. Job tasks (9 checklist items per appointment) ─────────────────────────

-- Appointment 101: in_progress — first 4 tasks done
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Measure water quality before and after filtration', true,  now() - interval '30 minutes'),
  ('11111111-1111-1111-1111-111111111101', 'Check water pressure at device inlet',               true,  now() - interval '25 minutes'),
  ('11111111-1111-1111-1111-111111111101', 'Replace sediment filter',                            true,  now() - interval '20 minutes'),
  ('11111111-1111-1111-1111-111111111101', 'Replace active carbon filter',                       true,  now() - interval '15 minutes'),
  ('11111111-1111-1111-1111-111111111101', 'Replace block carbon filter',                        false, null),
  ('11111111-1111-1111-1111-111111111101', 'Inspect and clean RO membrane',                      false, null),
  ('11111111-1111-1111-1111-111111111101', 'Replace post carbon filter',                         false, null),
  ('11111111-1111-1111-1111-111111111101', 'Inspect and clean pressure tank',                    false, null),
  ('11111111-1111-1111-1111-111111111101', 'Full system operational test',                       false, null);

-- Appointment 102: pending — all tasks incomplete
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES
  ('11111111-1111-1111-1111-111111111102', 'Measure water quality before and after filtration', false, null),
  ('11111111-1111-1111-1111-111111111102', 'Check water pressure at device inlet',               false, null),
  ('11111111-1111-1111-1111-111111111102', 'Replace sediment filter',                            false, null),
  ('11111111-1111-1111-1111-111111111102', 'Replace active carbon filter',                       false, null),
  ('11111111-1111-1111-1111-111111111102', 'Replace block carbon filter',                        false, null),
  ('11111111-1111-1111-1111-111111111102', 'Inspect and clean RO membrane',                      false, null),
  ('11111111-1111-1111-1111-111111111102', 'Replace post carbon filter',                         false, null),
  ('11111111-1111-1111-1111-111111111102', 'Inspect and clean pressure tank',                    false, null),
  ('11111111-1111-1111-1111-111111111102', 'Full system operational test',                       false, null);

-- Appointment 103: pending — all tasks incomplete
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES
  ('11111111-1111-1111-1111-111111111103', 'Measure water quality before and after filtration', false, null),
  ('11111111-1111-1111-1111-111111111103', 'Check water pressure at device inlet',               false, null),
  ('11111111-1111-1111-1111-111111111103', 'Replace sediment filter',                            false, null),
  ('11111111-1111-1111-1111-111111111103', 'Replace active carbon filter',                       false, null),
  ('11111111-1111-1111-1111-111111111103', 'Replace block carbon filter',                        false, null),
  ('11111111-1111-1111-1111-111111111103', 'Inspect and clean RO membrane',                      false, null),
  ('11111111-1111-1111-1111-111111111103', 'Replace post carbon filter',                         false, null),
  ('11111111-1111-1111-1111-111111111103', 'Inspect and clean pressure tank',                    false, null),
  ('11111111-1111-1111-1111-111111111103', 'Full system operational test',                       false, null);

-- Appointment 104: completed 3 days ago — all tasks done
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES
  ('11111111-1111-1111-1111-111111111104', 'Measure water quality before and after filtration', true, CURRENT_DATE - interval '3 days' + interval '8 hours'),
  ('11111111-1111-1111-1111-111111111104', 'Check water pressure at device inlet',               true, CURRENT_DATE - interval '3 days' + interval '8 hours 15 minutes'),
  ('11111111-1111-1111-1111-111111111104', 'Replace sediment filter',                            true, CURRENT_DATE - interval '3 days' + interval '8 hours 30 minutes'),
  ('11111111-1111-1111-1111-111111111104', 'Replace active carbon filter',                       true, CURRENT_DATE - interval '3 days' + interval '8 hours 45 minutes'),
  ('11111111-1111-1111-1111-111111111104', 'Replace block carbon filter',                        true, CURRENT_DATE - interval '3 days' + interval '9 hours'),
  ('11111111-1111-1111-1111-111111111104', 'Inspect and clean RO membrane',                      true, CURRENT_DATE - interval '3 days' + interval '9 hours 30 minutes'),
  ('11111111-1111-1111-1111-111111111104', 'Replace post carbon filter',                         true, CURRENT_DATE - interval '3 days' + interval '10 hours'),
  ('11111111-1111-1111-1111-111111111104', 'Inspect and clean pressure tank',                    true, CURRENT_DATE - interval '3 days' + interval '10 hours 20 minutes'),
  ('11111111-1111-1111-1111-111111111104', 'Full system operational test',                       true, CURRENT_DATE - interval '3 days' + interval '10 hours 45 minutes');

-- Appointment 105: completed 5 days ago — all tasks done
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES
  ('11111111-1111-1111-1111-111111111105', 'Measure water quality before and after filtration', true, CURRENT_DATE - interval '5 days' + interval '9 hours'),
  ('11111111-1111-1111-1111-111111111105', 'Check water pressure at device inlet',               true, CURRENT_DATE - interval '5 days' + interval '9 hours 15 minutes'),
  ('11111111-1111-1111-1111-111111111105', 'Replace sediment filter',                            true, CURRENT_DATE - interval '5 days' + interval '9 hours 30 minutes'),
  ('11111111-1111-1111-1111-111111111105', 'Replace active carbon filter',                       true, CURRENT_DATE - interval '5 days' + interval '9 hours 45 minutes'),
  ('11111111-1111-1111-1111-111111111105', 'Replace block carbon filter',                        true, CURRENT_DATE - interval '5 days' + interval '10 hours'),
  ('11111111-1111-1111-1111-111111111105', 'Inspect and clean RO membrane',                      true, CURRENT_DATE - interval '5 days' + interval '10 hours 30 minutes'),
  ('11111111-1111-1111-1111-111111111105', 'Replace post carbon filter',                         true, CURRENT_DATE - interval '5 days' + interval '11 hours'),
  ('11111111-1111-1111-1111-111111111105', 'Inspect and clean pressure tank',                    true, CURRENT_DATE - interval '5 days' + interval '11 hours 20 minutes'),
  ('11111111-1111-1111-1111-111111111105', 'Full system operational test',                       true, CURRENT_DATE - interval '5 days' + interval '11 hours 45 minutes');

-- ── 6. Filter status (4 stages for Al Amal Medical Clinic) ───────────────────

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 1', 'Sediment Filter 5 Micron',
  CURRENT_DATE - interval '60 days', CURRENT_DATE + interval '30 days', 67
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1;

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 2', 'Active Carbon Filter',
  CURRENT_DATE - interval '30 days', CURRENT_DATE + interval '60 days', 85
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1;

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 3', 'RO Membrane',
  CURRENT_DATE - interval '300 days', CURRENT_DATE + interval '65 days', 32
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1;

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 4', 'Post Carbon Filter',
  CURRENT_DATE - interval '15 days', CURRENT_DATE + interval '75 days', 92
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1;

-- ── 7. Notifications (4 for demo customer profile) ───────────────────────────

INSERT INTO notifications (user_id, type, message, is_read, created_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000004', 'reminder', 'Reminder: RO system maintenance appointment tomorrow at 10 AM',               false, now() - interval '2 hours'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'offer',    'Special offer: discount on RO membrane replacement this month',               false, now() - interval '1 day'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'alert',    'Alert: water quality has declined - RO membrane inspection recommended',      true,  now() - interval '3 days'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'reminder', 'Your appointment with the technician for RO system maintenance is confirmed', true,  now() - interval '5 days');

-- ── 8. Activity log (10 entries) ─────────────────────────────────────────────

INSERT INTO activity_log (action, description, created_at) VALUES
  ('appointment_completed', 'Completed periodic maintenance at Al Amal Medical Clinic',                       now() - interval '2 hours'),
  ('appointment_created',   'New RO system installation appointment for Al Zeitouneh Restaurant',             now() - interval '3 hours'),
  ('technician_assigned',   'Technician Sami Al-Atabi assigned for filter replacement at Lavender Hotel',     now() - interval '4 hours'),
  ('inventory_low',         'Alert: RO Membrane 75 GPD stock is low (8 units remaining)',                     now() - interval '5 hours'),
  ('appointment_completed', 'Completed water filter installation at Al Kawthar Mall',                         now() - interval '6 hours'),
  ('customer_added',        'New customer added: Aql Law Office',                                             now() - interval '8 hours'),
  ('appointment_cancelled', 'Appointment cancelled for Al Nahda Private School at customer request',          now() - interval '1 day'),
  ('inventory_restocked',   'Sediment and carbon filters restocked',                                          now() - interval '1 day'),
  ('appointment_created',   'TDS measurement and periodic maintenance scheduled for Digital Technology Co.',  now() - interval '2 days'),
  ('technician_assigned',   'Technician assigned to inspect and replace RO membrane at Al Shifa Pharmacy',   now() - interval '2 days');

-- ── 9. Service requests (mix of trigger types for AdminDashboard) ─────────────

INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by, status, created_at)
SELECT c.id, 'part_due', 'high',
  'RO membrane health at 32% - urgent replacement needed',
  'system', 'pending', now() - interval '1 hour'
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1;

INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by, status, created_at)
SELECT c.id, 'emergency', 'emergency',
  'Device not producing water - emergency visit required',
  'customer', 'pending', now() - interval '30 minutes'
FROM customers c WHERE c.email = 'ops@lavender-hotel.jo' LIMIT 1;

INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by, status, created_at)
SELECT c.id, 'schedule', 'medium',
  'Quarterly maintenance due - filter inspection recommended',
  'system', 'pending', now() - interval '2 hours'
FROM customers c WHERE c.email = 'manager@zeitouna.jo' LIMIT 1;

INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by, status, created_at)
SELECT c.id, 'complaint', 'medium',
  'Customer reports unusual taste in filtered water',
  'customer', 'pending', now() - interval '4 hours'
FROM customers c WHERE c.email = 'admin@nahda-school.jo' LIMIT 1;

INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by, status, created_at)
SELECT c.id, 'followup', 'low',
  'Follow-up visit recommended after pump replacement last week',
  'technician', 'pending', now() - interval '1 day'
FROM customers c WHERE c.email = 'facilities@digitech.jo' LIMIT 1;

INSERT INTO service_requests (customer_id, trigger_type, urgency, description, triggered_by, status, created_at)
SELECT c.id, 'warranty', 'medium',
  'Device warranty expires within 30 days - renewal reminder',
  'system', 'pending', now() - interval '6 hours'
FROM customers c WHERE c.email = 'pharmacy@alshifa.jo' LIMIT 1;
