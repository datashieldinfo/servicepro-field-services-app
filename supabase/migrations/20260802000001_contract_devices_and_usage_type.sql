/*
  # A contract knows which devices it covers, and every device knows what it is for

  1. `customer_devices.usage_type` / `inventory.usage_type`
    Home use or industrial use. The same brand is sold into a flat and into a
    factory, and the maintenance interval, the filter size and the price are not
    the same — so the device screen groups by it and a contract states it.

  2. `contracts.contract_number`
    A contract that gets printed and signed needs a reference on the paper.
    `CT-YYYY-NNN`, sequential per year, from `next_contract_number()` — the same
    shape invoices and price offers already use. Existing rows are backfilled.

  3. `contracts.filter_category` + `contract_devices`
    Which of the customer's registered devices this contract covers, and the
    filter class fitted to each. The join table means a contract can cover two
    devices at a flat and a third at the warehouse, each with its own class.

  4. `contracts.status` gains 'new'
    A first contract for a brand-new customer is 'new' and the office never
    types it; the status list is only offered where a customer already has
    contract history.
*/

/* ── 1. usage type ───────────────────────────────────────────────────────── */

ALTER TABLE customer_devices
  ADD COLUMN IF NOT EXISTS usage_type text NOT NULL DEFAULT 'home';

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS usage_type text NOT NULL DEFAULT 'home';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_devices_usage_type_check') THEN
    ALTER TABLE customer_devices ADD CONSTRAINT customer_devices_usage_type_check
      CHECK (usage_type IN ('home', 'industrial'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_usage_type_check') THEN
    ALTER TABLE inventory ADD CONSTRAINT inventory_usage_type_check
      CHECK (usage_type IN ('home', 'industrial'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS customer_devices_usage_type_idx ON customer_devices (usage_type);

/* ── 2. contract number ──────────────────────────────────────────────────── */

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS contract_number text;

CREATE OR REPLACE FUNCTION next_contract_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr  text := to_char(now(), 'YYYY');
  seq int;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(contract_number, '^CT-\d{4}-', ''), '')::int), 0) + 1
    INTO seq
    FROM contracts
   WHERE contract_number LIKE 'CT-' || yr || '-%';

  RETURN 'CT-' || yr || '-' || lpad(seq::text, 3, '0');
END $$;

GRANT EXECUTE ON FUNCTION next_contract_number() TO authenticated;

/* Contracts written before this migration still need a reference to print. */
WITH numbered AS (
  SELECT id,
         'CT-' || to_char(created_at, 'YYYY') || '-' ||
         lpad(row_number() OVER (PARTITION BY to_char(created_at, 'YYYY') ORDER BY created_at)::text, 3, '0') AS num
    FROM contracts
   WHERE contract_number IS NULL
)
UPDATE contracts c
   SET contract_number = numbered.num
  FROM numbered
 WHERE c.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_contract_number_key
  ON contracts (contract_number) WHERE contract_number IS NOT NULL;

/* ── 3. what the contract covers ─────────────────────────────────────────── */

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS filter_category text NOT NULL DEFAULT 'home';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_filter_category_check') THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_filter_category_check
      CHECK (filter_category IN ('home', 'industrial'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS contract_devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     uuid NOT NULL REFERENCES contracts(id)        ON DELETE CASCADE,
  device_id       uuid NOT NULL REFERENCES customer_devices(id) ON DELETE CASCADE,
  filter_category text NOT NULL DEFAULT 'home'
                       CHECK (filter_category IN ('home', 'industrial')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, device_id)
);

CREATE INDEX IF NOT EXISTS contract_devices_contract_idx ON contract_devices (contract_id);
CREATE INDEX IF NOT EXISTS contract_devices_device_idx   ON contract_devices (device_id);

ALTER TABLE contract_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_contract_devices" ON contract_devices;
CREATE POLICY "staff_manage_contract_devices" ON contract_devices
  FOR ALL TO authenticated
  USING (public.get_my_role() IN ('admin', 'owner', 'manager'))
  WITH CHECK (public.get_my_role() IN ('admin', 'owner', 'manager'));

DROP POLICY IF EXISTS "customers_read_own_contract_devices" ON contract_devices;
CREATE POLICY "customers_read_own_contract_devices" ON contract_devices
  FOR SELECT TO authenticated
  USING (
    contract_id IN (
      SELECT c.id FROM contracts c
       WHERE c.customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    )
    OR public.get_my_role() IN ('admin', 'owner', 'manager', 'technician')
  );

/* ── 4. the 'new' status ─────────────────────────────────────────────────── */

DO $$
DECLARE
  con text;
BEGIN
  SELECT conname INTO con
    FROM pg_constraint
   WHERE conrelid = 'contracts'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%';

  IF con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE contracts DROP CONSTRAINT %I', con);
  END IF;
END $$;

ALTER TABLE contracts ADD CONSTRAINT contracts_status_check
  CHECK (status IN ('new', 'active', 'expired', 'cancelled', 'pending'));
