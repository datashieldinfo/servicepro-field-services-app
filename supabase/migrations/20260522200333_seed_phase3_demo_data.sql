-- Seed Phase 3 Demo Data
-- No Arabic text. Hardcoded UUIDs for demo accounts ensure FK chain is satisfied
-- regardless of whether the app has been opened before.
--
-- Dependency order:
--   auth.users → profiles (via trigger)
--   customers, profiles → appointments
--   appointments → job_tasks, job_parts
--   profiles → notifications
--   customers → filter_status

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1: Rename existing Arabic customer/inventory records to English
--         Uses email (customers) and unique quantity (inventory) as keys.
--         Safe to run even if file 7 was already seeded with Arabic text.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE customers SET name = 'Al Amal Medical Clinic',  address = 'University Street, Jubeiha, Amman' WHERE email = 'info@alamal-clinic.jo';
UPDATE customers SET name = 'Al Zeitouneh Restaurant', address = 'Sweifieh, Amman'                    WHERE email = 'manager@zeitouna.jo';
UPDATE customers SET name = 'Al Nahda Private School', address = 'Khalda, Amman'                      WHERE email = 'admin@nahda-school.jo';
UPDATE customers SET name = 'Lavender Hotel Amman',    address = 'Shmeisani, Amman'                   WHERE email = 'ops@lavender-hotel.jo';
UPDATE customers SET name = 'Digital Technology Co.',  address = 'Al Rabieh, Amman'                   WHERE email = 'facilities@digitech.jo';
UPDATE customers SET name = 'Al Shifa Pharmacy',       address = 'Abdali, Amman'                      WHERE email = 'pharmacy@alshifa.jo';
UPDATE customers SET name = 'Al Kawthar Mall',         address = 'Marj Al Hamam, Amman'               WHERE email = 'info@kawthar-mall.jo';
UPDATE customers SET name = 'Aql Law Office',          address = 'Wadi Al Seer, Amman'                WHERE email = 'office@aql-law.jo';

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

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2: Create demo auth users
--         Hardcoded UUIDs make all FK references deterministic.
--         The handle_new_user trigger auto-creates the profiles row.
--         Identities row is required for email/password sign-in to work.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  id, instance_id, aud, role,
  email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, is_sso_user, is_anonymous
) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'owner@demo.com',
    crypt('demo1234', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Ahmad Al-Sharif","role":"owner"}',
    now(), now(), false, false
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'tech@demo.com',
    crypt('demo1234', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Sami Al-Atabi","role":"technician"}',
    now(), now(), false, false
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'admin@demo.com',
    crypt('demo1234', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Noura Al-Qahtani","role":"admin"}',
    now(), now(), false, false
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    'customer@demo.com',
    crypt('demo1234', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Fahad Al-Malki","role":"customer"}',
    now(), now(), false, false
  )
ON CONFLICT (id) DO NOTHING;

-- Identities are required for email/password sign-in
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'owner@demo.com',
    '{"sub":"00000000-0000-0000-0000-000000000001","email":"owner@demo.com","email_verified":true,"phone_verified":false}',
    'email', now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000002',
    'tech@demo.com',
    '{"sub":"00000000-0000-0000-0000-000000000002","email":"tech@demo.com","email_verified":true,"phone_verified":false}',
    'email', now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000003',
    'admin@demo.com',
    '{"sub":"00000000-0000-0000-0000-000000000003","email":"admin@demo.com","email_verified":true,"phone_verified":false}',
    'email', now(), now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000004',
    'customer@demo.com',
    '{"sub":"00000000-0000-0000-0000-000000000004","email":"customer@demo.com","email_verified":true,"phone_verified":false}',
    'email', now(), now(), now()
  )
ON CONFLICT DO NOTHING;

-- Ensure profiles have correct roles (handles cases where the trigger fired but
-- raw_user_meta_data was not read correctly, or the profile already existed)
INSERT INTO profiles (id, full_name, role)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ahmad Al-Sharif',  'owner'),
  ('00000000-0000-0000-0000-000000000002', 'Sami Al-Atabi',    'technician'),
  ('00000000-0000-0000-0000-000000000003', 'Noura Al-Qahtani', 'admin'),
  ('00000000-0000-0000-0000-000000000004', 'Fahad Al-Malki',   'customer')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role      = EXCLUDED.role;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3: Appointments
--         technician_id is hardcoded to the demo technician UUID.
--         No cross-join; SELECT only looks up customer_id by name.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO appointments (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT
  '11111111-1111-1111-1111-111111111101'::uuid,
  c.id,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'Periodic Maintenance',
  (CURRENT_DATE + interval '9 hours')::timestamptz,
  'in_progress',
  'University Street, Jubeiha, Amman',
  'Full periodic maintenance of RO water purification unit',
  true
FROM customers c WHERE c.name = 'Al Amal Medical Clinic'
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT
  '11111111-1111-1111-1111-111111111102'::uuid,
  c.id,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'Filter Replacement',
  (CURRENT_DATE + interval '13 hours 30 minutes')::timestamptz,
  'pending',
  'Sweifieh, Amman',
  'Replace sediment, carbon and inspect RO membrane',
  false
FROM customers c WHERE c.name = 'Al Zeitouneh Restaurant'
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT
  '11111111-1111-1111-1111-111111111103'::uuid,
  c.id,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'RO System Inspection',
  (CURRENT_DATE + interval '16 hours')::timestamptz,
  'pending',
  'Khalda, Amman',
  'Quarterly inspection and membrane condition assessment',
  false
FROM customers c WHERE c.name = 'Al Nahda Private School'
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT
  '11111111-1111-1111-1111-111111111104'::uuid,
  c.id,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'Filter Replacement',
  (CURRENT_DATE - interval '3 days' + interval '10 hours')::timestamptz,
  'completed',
  'Shmeisani, Amman',
  'All three filters replaced successfully',
  true
FROM customers c WHERE c.name = 'Lavender Hotel Amman'
ON CONFLICT (id) DO NOTHING;

INSERT INTO appointments (id, customer_id, technician_id, service_type, scheduled_at, status, address, notes, confirmed)
SELECT
  '11111111-1111-1111-1111-111111111105'::uuid,
  c.id,
  '00000000-0000-0000-0000-000000000002'::uuid,
  'Emergency Repair',
  (CURRENT_DATE - interval '5 days' + interval '11 hours')::timestamptz,
  'completed',
  'Al Rabieh, Amman',
  'Pressure pump replaced and unit recalibrated',
  true
FROM customers c WHERE c.name = 'Digital Technology Co.'
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 4: Job tasks (appointment 101 — in_progress, appointment 102 — pending)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES ('11111111-1111-1111-1111-111111111101', 'Measure water quality before and after filtration', true,  now() - interval '30 minutes');
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES ('11111111-1111-1111-1111-111111111101', 'Check water pressure at device inlet',               true,  now() - interval '25 minutes');
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES ('11111111-1111-1111-1111-111111111101', 'Replace sediment filter',                            true,  now() - interval '20 minutes');
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES ('11111111-1111-1111-1111-111111111101', 'Replace active carbon filter',                       true,  now() - interval '15 minutes');
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES ('11111111-1111-1111-1111-111111111101', 'Replace block carbon filter',                        false, null);
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES ('11111111-1111-1111-1111-111111111101', 'Inspect and clean RO membrane',                      false, null);
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES ('11111111-1111-1111-1111-111111111101', 'Replace post carbon filter',                         false, null);
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES ('11111111-1111-1111-1111-111111111101', 'Inspect and clean pressure tank',                    false, null);
INSERT INTO job_tasks (appointment_id, title, completed, completed_at) VALUES ('11111111-1111-1111-1111-111111111101', 'Full system operational test',                       false, null);

INSERT INTO job_tasks (appointment_id, title, completed) VALUES ('11111111-1111-1111-1111-111111111102', 'Measure water quality before and after filtration', false);
INSERT INTO job_tasks (appointment_id, title, completed) VALUES ('11111111-1111-1111-1111-111111111102', 'Check water pressure at device inlet',               false);
INSERT INTO job_tasks (appointment_id, title, completed) VALUES ('11111111-1111-1111-1111-111111111102', 'Replace sediment filter',                            false);
INSERT INTO job_tasks (appointment_id, title, completed) VALUES ('11111111-1111-1111-1111-111111111102', 'Replace active carbon filter',                       false);
INSERT INTO job_tasks (appointment_id, title, completed) VALUES ('11111111-1111-1111-1111-111111111102', 'Replace block carbon filter',                        false);
INSERT INTO job_tasks (appointment_id, title, completed) VALUES ('11111111-1111-1111-1111-111111111102', 'Inspect and clean RO membrane',                      false);
INSERT INTO job_tasks (appointment_id, title, completed) VALUES ('11111111-1111-1111-1111-111111111102', 'Replace post carbon filter',                         false);
INSERT INTO job_tasks (appointment_id, title, completed) VALUES ('11111111-1111-1111-1111-111111111102', 'Inspect and clean pressure tank',                    false);
INSERT INTO job_tasks (appointment_id, title, completed) VALUES ('11111111-1111-1111-1111-111111111102', 'Full system operational test',                       false);

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 5: Job parts
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO job_parts (appointment_id, inventory_id, quantity_used, notes)
SELECT '11111111-1111-1111-1111-111111111101', i.id, 1, 'Replaced'
FROM inventory i WHERE i.part_name = 'Sediment Filter 5 Micron' LIMIT 1;

INSERT INTO job_parts (appointment_id, inventory_id, quantity_used, notes)
SELECT '11111111-1111-1111-1111-111111111101', i.id, 1, 'Replaced'
FROM inventory i WHERE i.part_name = 'Active Carbon Filter' LIMIT 1;

INSERT INTO job_parts (appointment_id, inventory_id, quantity_used, notes)
SELECT '11111111-1111-1111-1111-111111111104', i.id, 1, 'Full replacement'
FROM inventory i WHERE i.part_name = 'Sediment Filter 5 Micron' LIMIT 1;

INSERT INTO job_parts (appointment_id, inventory_id, quantity_used, notes)
SELECT '11111111-1111-1111-1111-111111111104', i.id, 1, 'Full replacement'
FROM inventory i WHERE i.part_name = 'Active Carbon Filter' LIMIT 1;

INSERT INTO job_parts (appointment_id, inventory_id, quantity_used, notes)
SELECT '11111111-1111-1111-1111-111111111104', i.id, 1, 'Full replacement'
FROM inventory i WHERE i.part_name = 'Block Carbon Filter' LIMIT 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 6: Notifications (targeted directly at demo customer profile)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO notifications (user_id, type, message, is_read, created_at) VALUES
  ('00000000-0000-0000-0000-000000000004', 'reminder', 'Reminder: RO system maintenance appointment tomorrow at 10 AM',              false, now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000004', 'offer',    'Special offer: discount on RO membrane replacement this month',              false, now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000004', 'alert',    'Alert: water quality has declined - RO membrane inspection recommended',     true,  now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000004', 'reminder', 'Your appointment with the technician for RO system maintenance is confirmed', true,  now() - interval '5 days');

-- ─────────────────────────────────────────────────────────────────────────────
-- PART 7: Filter status (linked to Al Amal Medical Clinic — the customer record
--         that will be associated with customer@demo.com in the next migration)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 1', 'Sediment Filter 5 Micron',
  CURRENT_DATE - interval '60 days', CURRENT_DATE + interval '30 days', 67
FROM customers c WHERE c.email = 'info@alamal-clinic.jo';

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 2', 'Active Carbon Filter',
  CURRENT_DATE - interval '30 days', CURRENT_DATE + interval '60 days', 85
FROM customers c WHERE c.email = 'info@alamal-clinic.jo';

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 3', 'RO Membrane',
  CURRENT_DATE - interval '300 days', CURRENT_DATE + interval '65 days', 32
FROM customers c WHERE c.email = 'info@alamal-clinic.jo';

INSERT INTO filter_status (customer_id, location, filter_type, last_replaced, next_due, health_percent)
SELECT c.id, 'Kitchen - Stage 4', 'Post Carbon Filter',
  CURRENT_DATE - interval '15 days', CURRENT_DATE + interval '75 days', 92
FROM customers c WHERE c.email = 'info@alamal-clinic.jo';
