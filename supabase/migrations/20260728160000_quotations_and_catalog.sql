/*
  # Price offers (quotations) + a priced catalogue that can hold devices

  1. `inventory.category`
    The catalogue already carries `cost_price` / `selling_price`, but every row
    is a consumable part. Adding `category` ('part' | 'device' | 'accessory' |
    'service') lets whole devices be priced in the same table, so an offer, a
    job and an invoice all quote from one price list instead of three.
    The BioFamily device models are seeded with prices and no stock; the office
    edits both from the existing inventory screen.

  2. `quotations`
    A price offer sent to a customer — typically for a new device before any
    installation exists. `items` is a jsonb array of
    `{ kind, ref_id, name, qty, unit_price, total }` so a line can point at a
    catalogue row or be typed by hand. When the customer accepts, the offer is
    converted into an installation visit and `converted_appointment_id` records
    where it went.

  3. Security
    - RLS on, matching the `invoices` policies: staff (owner/admin/manager)
      manage everything, technicians read, and a customer reads only offers
      addressed to them.
*/

/* ── 1. catalogue ────────────────────────────────────────────────────────── */

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'part';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_category_check') THEN
    ALTER TABLE inventory ADD CONSTRAINT inventory_category_check
      CHECK (category IN ('part', 'device', 'accessory', 'service'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inventory_category_idx ON inventory (category);

/* Device models priced for offers. Insert-if-absent so re-running is safe and
   no unique index is assumed to exist on `part_name`. */
INSERT INTO inventory (part_name, category, quantity, unit, low_stock_threshold, cost_price, selling_price)
SELECT v.part_name, 'device', 0, 'unit', 1, v.cost_price, v.selling_price
FROM (VALUES
  ('BioFamily 4-Stage RO System',  180.00, 320.00),
  ('BioFamily 7-Stage RO System',  240.00, 420.00),
  ('Ruhens Water Cooler',          300.00, 520.00),
  ('Family Water Cooler',          260.00, 450.00),
  ('Built-in Under-Sink Cooler',   320.00, 560.00)
) AS v(part_name, cost_price, selling_price)
WHERE NOT EXISTS (
  SELECT 1 FROM inventory i WHERE i.part_name = v.part_name
);

/* ── 2. quotations ───────────────────────────────────────────────────────── */

CREATE TABLE IF NOT EXISTS quotations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number             text UNIQUE NOT NULL,
  customer_id              uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status                   text NOT NULL DEFAULT 'draft',
  items                    jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal                 numeric(10,2) NOT NULL DEFAULT 0,
  discount                 numeric(10,2) NOT NULL DEFAULT 0,
  total_amount             numeric(10,2) NOT NULL DEFAULT 0,
  currency                 text NOT NULL DEFAULT 'JOD',
  valid_until              date,
  notes                    text DEFAULT '',
  sent_at                  timestamptz,
  sent_channel             text,
  accepted_at              timestamptz,
  rejected_at              timestamptz,
  converted_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  created_by               uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_status_check') THEN
    ALTER TABLE quotations ADD CONSTRAINT quotations_status_check
      CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_sent_channel_check') THEN
    ALTER TABLE quotations ADD CONSTRAINT quotations_sent_channel_check
      CHECK (sent_channel IS NULL OR sent_channel IN ('whatsapp', 'email', 'print', 'in_person'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS quotations_customer_idx ON quotations (customer_id);
CREATE INDEX IF NOT EXISTS quotations_status_idx   ON quotations (status);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage quotations" ON quotations;
CREATE POLICY "Staff manage quotations" ON quotations
  FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['owner', 'admin', 'manager']))
  WITH CHECK (get_my_role() = ANY (ARRAY['owner', 'admin', 'manager']));

DROP POLICY IF EXISTS "Technicians read quotations" ON quotations;
CREATE POLICY "Technicians read quotations" ON quotations
  FOR SELECT TO authenticated
  USING (get_my_role() = 'technician');

DROP POLICY IF EXISTS "Customers read own quotations" ON quotations;
CREATE POLICY "Customers read own quotations" ON quotations
  FOR SELECT TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

/* Sequential offer numbers per year: QT-2026-001 */
CREATE OR REPLACE FUNCTION next_quote_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr   text := to_char(now(), 'YYYY');
  seq  int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(quote_number, '^QT-\d{4}-', ''), '')::int), 0) + 1
    INTO seq
    FROM quotations
   WHERE quote_number LIKE 'QT-' || yr || '-%';

  RETURN 'QT-' || yr || '-' || lpad(seq::text, 3, '0');
END $$;
