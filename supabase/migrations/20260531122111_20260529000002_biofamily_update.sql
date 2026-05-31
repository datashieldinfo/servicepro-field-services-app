/*
  BioFamily Jordan - System Update

  1. customer_devices table (device registry per customer)
  2. inventory - add cost_price, selling_price, replacement_interval_months columns
  3. Seed BioFamily-specific inventory parts (English only)
  4. Update customer addresses to Amman neighborhoods (English)
*/

-- 1. customer_devices -------------------------------------------------------

CREATE TABLE IF NOT EXISTS customer_devices (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id              uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  device_brand             text        NOT NULL DEFAULT 'BioFamily'
    CHECK (device_brand IN ('BioFamily', 'Family', 'Ruhens', 'Other')),
  device_model             text,
  device_type              text
    CHECK (device_type IN ('filter_4stage', 'filter_7stage', 'cooler_builtin', 'cooler_standalone', 'other')),
  serial_number            text,
  installation_date        date,
  warranty_expires         date,
  warranty_duration_months integer     DEFAULT 24,
  location_in_premises     text,
  notes                    text,
  created_at               timestamptz DEFAULT now()
);

ALTER TABLE customer_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customer views own devices"
  ON customer_devices FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

CREATE POLICY "Technician views devices"
  ON customer_devices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'technician'));

CREATE POLICY "Admin and Owner manage devices"
  ON customer_devices FOR ALL TO authenticated
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','owner')));

CREATE INDEX IF NOT EXISTS customer_devices_customer_id_idx ON customer_devices(customer_id);

-- 2. inventory - add new columns --------------------------------------------

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS cost_price                  numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS selling_price               numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replacement_interval_months integer       DEFAULT 12;

-- 3. BioFamily inventory parts (English only, skip if already exists) -------

INSERT INTO inventory (part_name, quantity, unit, low_stock_threshold, cost_price, selling_price, replacement_interval_months) VALUES
  ('PP Sediment Filter 5um',         20, 'pcs',   5,  2.00,  5.00,  3),
  ('Pre-Carbon Block Filter',        20, 'pcs',   5,  3.00,  7.00,  6),
  ('Post-Carbon Filter',             20, 'pcs',   5,  3.00,  7.00, 12),
  ('RO Membrane 75 GPD',             10, 'pcs',   3, 15.00, 35.00, 24),
  ('Mineral Alkaline Filter',        10, 'pcs',   3,  4.00,  9.00, 12),
  ('UV Sterilizer Lamp',             10, 'pcs',   3,  8.00, 18.00, 12),
  ('Hygiene Guard Filter',           10, 'pcs',   3,  5.00, 12.00,  6),
  ('O-Ring Kit',                     30, 'set',   5,  1.00,  3.00,  0),
  ('Food-Grade Silicone Grease',     20, 'tube',  5,  1.00,  3.00,  0)
ON CONFLICT DO NOTHING;

-- 4. Update customer addresses to Amman neighborhoods (English) -------------

UPDATE customers SET address = 'Al Hashmi Al Shamali, Al Batha St, Amman'   WHERE name = 'Al Amal Medical Clinic';
UPDATE customers SET address = 'Al Sweifieh, Al Wekalat St, Amman'          WHERE name = 'Al Zeitouneh Restaurant';
UPDATE customers SET address = 'Khalda, University of Jordan St, Amman'     WHERE name = 'Al Nahda Private School';
UPDATE customers SET address = 'Al Shmeisani, Abdullah Ghosheh St, Amman'   WHERE name = 'Lavender Hotel Amman';
UPDATE customers SET address = 'Al Rabia, Sports City St, Amman'            WHERE name = 'Digital Technology Co.';
UPDATE customers SET address = 'Al Abdali, Queen Noor St, Amman'            WHERE name = 'Al Shifa Pharmacy';
UPDATE customers SET address = 'Marj Al Hamam, Desert Hwy, Amman'          WHERE name = 'Al Kawthar Mall';
UPDATE customers SET address = 'Nazzal, Al Izaa St, Amman'                  WHERE name = 'Aql Law Office';
