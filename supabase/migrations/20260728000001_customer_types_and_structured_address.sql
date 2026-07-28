/*
  # Customer record types + structured address

  1. Changes to `customers`
    - `customer_type` (text) — 'individual' | 'corporate' (default 'individual')
    - `country_code` (text) — dial code for `phone`, e.g. '+962'
    - Structured address: `state`, `city`, `area`, `street`,
      `building_type` ('villa' | 'building'),
      `villa_name`, `villa_number`,
      `building_name`, `building_number`, `flat_number`
    - Map pin: `latitude`, `longitude`, `location_label`
    - `notes` (text) — previously collected in the UI but never persisted
    - Corporate-only fields: `company_name`, `trade_name`, `industry`,
      `commercial_reg_no`, `tax_number`, `branch_count`, `payment_terms`,
      `billing_email`, `contact_person_name`, `contact_person_title`,
      `contact_person_phone`, `contact_person_email`
    - `source` (text) — how the record was created: 'manual' | 'excel' | 'vcf' | 'contacts'

  `address` is kept as the human-readable composed one-line address so every
  existing query / print view keeps working unchanged.

  2. Security
    - No policy changes; existing owner/admin insert + update policies still apply.
*/

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_type         text NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS country_code          text NOT NULL DEFAULT '+962',
  ADD COLUMN IF NOT EXISTS state                 text DEFAULT '',
  ADD COLUMN IF NOT EXISTS city                  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS area                  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS street                text DEFAULT '',
  ADD COLUMN IF NOT EXISTS building_type         text,
  ADD COLUMN IF NOT EXISTS villa_name            text DEFAULT '',
  ADD COLUMN IF NOT EXISTS villa_number          text DEFAULT '',
  ADD COLUMN IF NOT EXISTS building_name         text DEFAULT '',
  ADD COLUMN IF NOT EXISTS building_number       text DEFAULT '',
  ADD COLUMN IF NOT EXISTS flat_number           text DEFAULT '',
  ADD COLUMN IF NOT EXISTS latitude              numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude             numeric(10,7),
  ADD COLUMN IF NOT EXISTS location_label        text DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes                 text DEFAULT '',
  ADD COLUMN IF NOT EXISTS company_name          text DEFAULT '',
  ADD COLUMN IF NOT EXISTS trade_name            text DEFAULT '',
  ADD COLUMN IF NOT EXISTS industry              text DEFAULT '',
  ADD COLUMN IF NOT EXISTS commercial_reg_no     text DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_number            text DEFAULT '',
  ADD COLUMN IF NOT EXISTS branch_count          integer,
  ADD COLUMN IF NOT EXISTS payment_terms         text DEFAULT '',
  ADD COLUMN IF NOT EXISTS billing_email         text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_person_name   text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_person_title  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_person_phone  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS contact_person_email  text DEFAULT '',
  ADD COLUMN IF NOT EXISTS source                text DEFAULT 'manual';

-- Constrained value sets (added defensively so re-running the migration is safe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_customer_type_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_customer_type_check
      CHECK (customer_type IN ('individual', 'corporate'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_building_type_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_building_type_check
      CHECK (building_type IS NULL OR building_type IN ('villa', 'building'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_source_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_source_check
      CHECK (source IS NULL OR source IN ('manual', 'excel', 'vcf', 'contacts'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS customers_customer_type_idx ON customers (customer_type);
CREATE INDEX IF NOT EXISTS customers_city_idx          ON customers (city);

-- Existing rows keep their free-text address; mark them explicitly as individuals.
UPDATE customers SET customer_type = 'individual' WHERE customer_type IS NULL;
