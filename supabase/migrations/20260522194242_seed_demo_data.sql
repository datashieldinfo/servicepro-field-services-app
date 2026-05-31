/*
  # Seed demo data — Jordan / Water Filtration context

  1. 8 customers (Amman businesses)
  2. Inventory (RO water filtration parts)
  3. Activity log entries
*/

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

INSERT INTO inventory (part_name, quantity, unit, low_stock_threshold) VALUES
  ('Sediment Filter 5 Micron',    45,  'pcs',  10),
  ('Active Carbon Filter',        38,  'pcs',  10),
  ('Block Carbon Filter',         30,  'pcs',   8),
  ('RO Membrane 75 GPD',           8,  'pcs',   3),
  ('RO Membrane 100 GPD',          5,  'pcs',   2),
  ('Post Carbon Filter',          28,  'pcs',   8),
  ('Pressure Tank 3.2 Gallon',     6,  'pcs',   2),
  ('Pressure Pump',                4,  'pcs',   2),
  ('O-Ring Seals',               200,  'pcs',  50),
  ('Food Grade Silicone Grease',  15, 'tube',   5)
ON CONFLICT DO NOTHING;

INSERT INTO activity_log (action, description, created_at) VALUES
  ('appointment_completed', 'Completed periodic maintenance at Al Amal Medical Clinic',                       now() - interval '2 hours'),
  ('appointment_created',   'Created new RO system installation appointment for Al Zeitouneh Restaurant',     now() - interval '3 hours'),
  ('technician_assigned',   'Technician assigned for filter replacement at Lavender Hotel Amman',             now() - interval '4 hours'),
  ('inventory_low',         'Alert: RO Membrane 75 GPD stock is low',                                        now() - interval '5 hours'),
  ('appointment_completed', 'Completed new water filter installation at Al Kawthar Mall',                     now() - interval '6 hours'),
  ('customer_added',        'New customer added: Aql Law Office',                                             now() - interval '8 hours'),
  ('appointment_cancelled', 'Appointment cancelled for Al Nahda Private School at customer request',          now() - interval '1 day'),
  ('inventory_restocked',   'Sediment and carbon filters restocked',                                          now() - interval '1 day'),
  ('appointment_created',   'TDS measurement and periodic maintenance scheduled for Digital Technology Co.',  now() - interval '2 days'),
  ('technician_assigned',   'Technician assigned to inspect and replace RO membrane at Al Shifa Pharmacy',   now() - interval '2 days')
ON CONFLICT DO NOTHING;
