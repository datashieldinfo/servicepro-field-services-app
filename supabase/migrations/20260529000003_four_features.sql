-- Feature 1: Customer Device Registry (new schema) --------------------------

DROP TABLE IF EXISTS customer_devices CASCADE;

CREATE TABLE customer_devices (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          uuid        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  device_brand         text        NOT NULL DEFAULT 'BioFamily 4-Stage'
                                   CHECK (device_brand IN ('BioFamily 4-Stage','BioFamily 7-Stage','Ruhens Cooler','Family Cooler','Other')),
  device_model         text,
  serial_number        text,
  installation_date    date,
  warranty_expires     date,
  location_in_premises text,
  notes                text        DEFAULT '',
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_see_own_devices" ON customer_devices
  FOR SELECT TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner','technician')
  );

CREATE POLICY "admins_manage_devices" ON customer_devices
  FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner'));

-- Feature 3: BioFamily Product Catalog (English only) -----------------------

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS cost_price                  numeric(10,2),
  ADD COLUMN IF NOT EXISTS selling_price               numeric(10,2),
  ADD COLUMN IF NOT EXISTS replacement_interval_months int;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_part_name_unique ON inventory(part_name);

INSERT INTO inventory (part_name, quantity, unit, low_stock_threshold, cost_price, selling_price, replacement_interval_months) VALUES
  ('PP Sediment Filter 5um',          20, 'pcs',   5,  2.00,  5.00,  3),
  ('Pre-Carbon Block Filter',         20, 'pcs',   5,  3.00,  7.00,  6),
  ('Post-Carbon Filter',              20, 'pcs',   5,  3.00,  7.00, 12),
  ('RO Membrane 75 GPD',              10, 'pcs',   3, 15.00, 35.00, 24),
  ('Mineral Alkaline Filter',         10, 'pcs',   3,  4.00,  9.00, 12),
  ('UV Sterilizer Lamp',              10, 'pcs',   3,  8.00, 18.00, 12),
  ('Hygiene Guard Filter',            10, 'pcs',   3,  5.00, 12.00,  6),
  ('O-Ring Kit',                      30, 'set',   5,  1.00,  3.00,  0),
  ('Food-Grade Silicone Grease',      20, 'tube',  5,  1.00,  3.00,  0),
  ('Booster Pump',                     5, 'pcs',   2, 25.00, 55.00, 60)
ON CONFLICT (part_name) DO UPDATE SET
  cost_price                  = EXCLUDED.cost_price,
  selling_price               = EXCLUDED.selling_price,
  replacement_interval_months = EXCLUDED.replacement_interval_months,
  low_stock_threshold         = EXCLUDED.low_stock_threshold;

-- Feature 4: Contract Management --------------------------------------------

CREATE TABLE IF NOT EXISTS contracts (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_type       text          NOT NULL CHECK (plan_type IN ('monthly','quarterly','biannual','annual')),
  visits_included int           NOT NULL DEFAULT 4,
  visits_used     int           NOT NULL DEFAULT 0,
  price_jod       numeric(10,2) NOT NULL DEFAULT 0,
  start_date      date          NOT NULL,
  end_date        date          NOT NULL,
  auto_renew      boolean       NOT NULL DEFAULT true,
  status          text          NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','expired','cancelled','pending')),
  notes           text          DEFAULT '',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_see_own_contracts" ON contracts
  FOR SELECT TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner')
  );

CREATE POLICY "admins_manage_contracts" ON contracts
  FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner'))
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','owner'));
