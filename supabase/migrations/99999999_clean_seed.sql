-- ============================================================================
-- ServisGo Clean Seed Data
-- Zero Arabic characters. Run this AFTER all other migrations (1-12).
-- Timestamp 99999999 ensures it runs last.
-- Idempotent: deletes appointment-chain rows before re-inserting.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- CLEANUP: remove any rows from previous seed attempts so re-runs are safe
-- ----------------------------------------------------------------------------
DELETE FROM service_requests  WHERE customer_id IN (SELECT id FROM customers WHERE email IN (
  'info@alamal-clinic.jo','manager@zeitouna.jo','admin@nahda-school.jo',
  'ops@lavender-hotel.jo','facilities@digitech.jo','pharmacy@alshifa.jo',
  'info@kawthar-mall.jo','office@aql-law.jo'
));
DELETE FROM filter_status     WHERE customer_id IN (SELECT id FROM customers WHERE email = 'info@alamal-clinic.jo');
DELETE FROM notifications     WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000004';
DELETE FROM job_parts         WHERE appointment_id IN (
  '11111111-1111-1111-1111-111111111101',
  '11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103'
);
DELETE FROM job_tasks         WHERE appointment_id IN (
  '11111111-1111-1111-1111-111111111101',
  '11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103'
);
DELETE FROM appointments      WHERE id IN (
  '11111111-1111-1111-1111-111111111101',
  '11111111-1111-1111-1111-111111111102',
  '11111111-1111-1111-1111-111111111103'
);

-- ----------------------------------------------------------------------------
-- 1. CUSTOMERS  (8 Jordanian businesses, English names, Amman addresses)
-- ----------------------------------------------------------------------------
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

-- Normalise any previously seeded Arabic names to English (idempotent)
UPDATE customers SET name = 'Al Amal Medical Clinic',  address = 'University Street, Jubeiha, Amman' WHERE email = 'info@alamal-clinic.jo';
UPDATE customers SET name = 'Al Zeitouneh Restaurant', address = 'Sweifieh, Amman'                    WHERE email = 'manager@zeitouna.jo';
UPDATE customers SET name = 'Al Nahda Private School', address = 'Khalda, Amman'                      WHERE email = 'admin@nahda-school.jo';
UPDATE customers SET name = 'Lavender Hotel Amman',    address = 'Shmeisani, Amman'                   WHERE email = 'ops@lavender-hotel.jo';
UPDATE customers SET name = 'Digital Technology Co.',  address = 'Al Rabieh, Amman'                   WHERE email = 'facilities@digitech.jo';
UPDATE customers SET name = 'Al Shifa Pharmacy',       address = 'Abdali, Amman'                      WHERE email = 'pharmacy@alshifa.jo';
UPDATE customers SET name = 'Al Kawthar Mall',         address = 'Marj Al Hamam, Amman'               WHERE email = 'info@kawthar-mall.jo';
UPDATE customers SET name = 'Aql Law Office',          address = 'Wadi Al Seer, Amman'                WHERE email = 'office@aql-law.jo';

-- ----------------------------------------------------------------------------
-- 2. INVENTORY  (water filtration parts, English names)
-- ----------------------------------------------------------------------------
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

-- Normalise any previously seeded Arabic inventory to English (identified by unique quantity)
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

-- ----------------------------------------------------------------------------
-- 3. PROFILES  (demo accounts with fixed UUIDs)
--
-- profiles.id has a FK to auth.users(id).  We bypass it here with
-- session_replication_role so the seed works without pre-creating auth users.
-- When a demo user logs in via the app, Supabase creates a real auth.users row
-- and the LoginPage upserts the profile — at that point the FK is satisfied.
-- ----------------------------------------------------------------------------
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

-- Link the demo customer profile to Al Amal Medical Clinic so
-- CustomerDashboard shows real filter/appointment data when logged in.
-- (user_id column added by migration 20260527000001)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customers' AND column_name = 'user_id'
  ) THEN
    UPDATE customers
    SET user_id = 'aaaaaaaa-0000-0000-0000-000000000004'
    WHERE email = 'info@alamal-clinic.jo';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. APPOINTMENTS  (3 fixed UUIDs, technician = aaaaaaaa-...-0002)
--    Customers looked up by email so the query never returns 0 rows.
-- ----------------------------------------------------------------------------
INSERT INTO appointments
  (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT
  '11111111-1111-1111-1111-111111111101'::uuid,
  c.id,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'Periodic Maintenance',
  (CURRENT_DATE + interval '9 hours')::timestamptz,
  'in_progress',
  'University Street, Jubeiha, Amman',
  'Full periodic maintenance of RO water purification unit',
  true
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments
  (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT
  '11111111-1111-1111-1111-111111111102'::uuid,
  c.id,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'Filter Replacement',
  (CURRENT_DATE + interval '13 hours 30 minutes')::timestamptz,
  'pending',
  'Sweifieh, Amman',
  'Replace sediment, carbon and inspect RO membrane',
  false
FROM customers c WHERE c.email = 'manager@zeitouna.jo' LIMIT 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments
  (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT
  '11111111-1111-1111-1111-111111111103'::uuid,
  c.id,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'RO System Inspection',
  (CURRENT_DATE + interval '16 hours')::timestamptz,
  'pending',
  'Khalda, Amman',
  'Quarterly inspection and membrane condition assessment',
  false
FROM customers c WHERE c.email = 'admin@nahda-school.jo' LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. JOB TASKS  (checklist items per appointment)
-- ----------------------------------------------------------------------------

-- Appointment 101: in_progress — first 4 tasks completed
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES
  ('11111111-1111-1111-1111-111111111101', 'Measure water quality before and after filtration', true,  now() - interval '30 minutes'),
  ('11111111-1111-1111-1111-111111111101', 'Check water pressure at device inlet',               true,  now() - interval '25 minutes'),
  ('11111111-1111-1111-1111-111111111101', 'Replace sediment filter',                            true,  now() - interval '20 minutes'),
  ('11111111-1111-1111-1111-111111111101', 'Replace active carbon filter',                       true,  now() - interval '15 minutes'),
  ('11111111-1111-1111-1111-111111111101', 'Replace block carbon filter',                        false, null),
  ('11111111-1111-1111-1111-111111111101', 'Inspect and clean RO membrane',                      false, null),
  ('11111111-1111-1111-1111-111111111101', 'Replace post carbon filter',                         false, null),
  ('11111111-1111-1111-1111-111111111101', 'Full system operational test',                       false, null);

-- Appointment 102: pending — all tasks incomplete
INSERT INTO job_tasks (appointment_id, title, completed) VALUES
  ('11111111-1111-1111-1111-111111111102', 'Measure water quality before and after filtration', false),
  ('11111111-1111-1111-1111-111111111102', 'Check water pressure at device inlet',               false),
  ('11111111-1111-1111-1111-111111111102', 'Replace sediment filter',                            false),
  ('11111111-1111-1111-1111-111111111102', 'Replace active carbon filter',                       false),
  ('11111111-1111-1111-1111-111111111102', 'Replace block carbon filter',                        false),
  ('11111111-1111-1111-1111-111111111102', 'Inspect and clean RO membrane',                      false);

-- Appointment 103: pending — inspection checklist
INSERT INTO job_tasks (appointment_id, title, completed) VALUES
  ('11111111-1111-1111-1111-111111111103', 'Measure water quality before and after filtration', false),
  ('11111111-1111-1111-1111-111111111103', 'Check water pressure at device inlet',               false),
  ('11111111-1111-1111-1111-111111111103', 'Inspect and clean RO membrane',                      false),
  ('11111111-1111-1111-1111-111111111103', 'Full system operational test',                       false);

-- ----------------------------------------------------------------------------
-- 6. FILTER STATUS  (4 filter stages linked to Al Amal Medical Clinic)
-- ----------------------------------------------------------------------------
INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 1', 'Sediment Filter 5 Micron',
  CURRENT_DATE - interval '60 days',  CURRENT_DATE + interval '30 days', 67
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1;

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 2', 'Active Carbon Filter',
  CURRENT_DATE - interval '30 days',  CURRENT_DATE + interval '60 days', 85
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1;

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 3', 'RO Membrane',
  CURRENT_DATE - interval '300 days', CURRENT_DATE + interval '65 days', 32
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1;

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 4', 'Post Carbon Filter',
  CURRENT_DATE - interval '15 days',  CURRENT_DATE + interval '75 days', 92
FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1;

-- ----------------------------------------------------------------------------
-- 7. NOTIFICATIONS  (linked to demo customer profile aaaaaaaa-...-0004)
-- ----------------------------------------------------------------------------
INSERT INTO notifications (user_id, type, message, is_read, created_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000004', 'reminder', 'Reminder: RO system maintenance appointment tomorrow at 10 AM',               false, now() - interval '2 hours'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'offer',    'Special offer: discount on RO membrane replacement this month',               false, now() - interval '1 day'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'alert',    'Alert: water quality has declined - RO membrane inspection recommended',      true,  now() - interval '3 days'),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'reminder', 'Your appointment with the technician for RO system maintenance is confirmed', true,  now() - interval '5 days');

-- ----------------------------------------------------------------------------
-- 8. ACTIVITY LOG
-- ----------------------------------------------------------------------------
INSERT INTO activity_log (action, description, created_at) VALUES
  ('appointment_completed', 'Completed periodic maintenance at Al Amal Medical Clinic',                       now() - interval '2 hours'),
  ('appointment_created',   'Created new RO system installation appointment for Al Zeitouneh Restaurant',     now() - interval '3 hours'),
  ('technician_assigned',   'Technician Sami Al-Atabi assigned for filter replacement at Lavender Hotel',     now() - interval '4 hours'),
  ('inventory_low',         'Alert: RO Membrane 75 GPD stock is low (8 units remaining)',                     now() - interval '5 hours'),
  ('appointment_completed', 'Completed water filter installation at Al Kawthar Mall',                         now() - interval '6 hours'),
  ('customer_added',        'New customer added: Aql Law Office',                                             now() - interval '8 hours'),
  ('appointment_cancelled', 'Appointment cancelled for Al Nahda Private School at customer request',          now() - interval '1 day'),
  ('inventory_restocked',   'Sediment and carbon filters restocked',                                          now() - interval '1 day'),
  ('appointment_created',   'TDS measurement and periodic maintenance scheduled for Digital Technology Co.',  now() - interval '2 days'),
  ('technician_assigned',   'Technician assigned to inspect and replace RO membrane at Al Shifa Pharmacy',   now() - interval '2 days');

-- ----------------------------------------------------------------------------
-- 9. SERVICE REQUESTS  (demo pipeline for AdminDashboard)
--    Wrapped in a block so it silently skips if migration 11 has not run yet.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_requests'
  ) THEN
    INSERT INTO service_requests
      (customer_id, trigger_type, urgency, description, triggered_by, status, created_at)
    SELECT c.id, 'part_due', 'high',
      'RO membrane health at 32% - urgent replacement needed',
      'system', 'pending', now() - interval '1 hour'
    FROM customers c WHERE c.email = 'info@alamal-clinic.jo' LIMIT 1;

    INSERT INTO service_requests
      (customer_id, trigger_type, urgency, description, triggered_by, status, created_at)
    SELECT c.id, 'schedule', 'medium',
      'Quarterly maintenance due - filter inspection recommended',
      'system', 'pending', now() - interval '2 hours'
    FROM customers c WHERE c.email = 'manager@zeitouna.jo' LIMIT 1;

    INSERT INTO service_requests
      (customer_id, trigger_type, urgency, description, triggered_by, status, created_at)
    SELECT c.id, 'customer_request', 'medium',
      'Customer requested a routine check-up and filter status review',
      'customer', 'pending', now() - interval '3 hours'
    FROM customers c WHERE c.email = 'admin@nahda-school.jo' LIMIT 1;

    INSERT INTO service_requests
      (customer_id, trigger_type, urgency, description, triggered_by, status, created_at)
    SELECT c.id, 'emergency', 'emergency',
      'Device not producing water - emergency visit required',
      'customer', 'pending', now() - interval '30 minutes'
    FROM customers c WHERE c.email = 'ops@lavender-hotel.jo' LIMIT 1;
  END IF;
END $$;
