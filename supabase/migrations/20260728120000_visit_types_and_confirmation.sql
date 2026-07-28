/*
  # Typed visits, device link and confirmation gate (workflow phase A)

  1. Changes to `appointments`
    - `visit_type` (text) — installation | preventive_maintenance | scheduled_visit
      | repair | emergency | survey. Defaults to 'scheduled_visit' so existing
      rows keep working; `service_type` stays as the free-text description.
    - `device_id` (uuid → customer_devices) — which device the visit is for.
      Null for installations (the device does not exist yet) and for
      whole-site visits.
    - Confirmation gate: `confirmed_at`, `confirmed_by` (→ profiles),
      `confirmation_channel` (phone | whatsapp | portal | email | in_person).
      The legacy `confirmed` boolean is kept in sync so older screens still work.
    - `created_by` (→ profiles) — who booked the visit.
    - `next_visit_of` (uuid → appointments) — set when a visit was generated as
      the follow-up of an earlier one, so the chain is walkable.

  2. Security
    - No policy changes: the existing appointment policies cover the new columns.
*/

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS visit_type           text NOT NULL DEFAULT 'scheduled_visit',
  ADD COLUMN IF NOT EXISTS device_id            uuid REFERENCES customer_devices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at         timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmation_channel text,
  ADD COLUMN IF NOT EXISTS created_by           uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_visit_of        uuid REFERENCES appointments(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_visit_type_check') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_visit_type_check
      CHECK (visit_type IN (
        'installation', 'preventive_maintenance', 'scheduled_visit',
        'repair', 'emergency', 'survey'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_confirmation_channel_check') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_confirmation_channel_check
      CHECK (confirmation_channel IS NULL OR confirmation_channel IN (
        'phone', 'whatsapp', 'portal', 'email', 'in_person'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS appointments_visit_type_idx   ON appointments (visit_type);
CREATE INDEX IF NOT EXISTS appointments_device_id_idx    ON appointments (device_id);
CREATE INDEX IF NOT EXISTS appointments_confirmed_at_idx ON appointments (confirmed_at);

/*
  Backfill: infer a visit type for existing rows from their free-text
  `service_type`, so history reports are not all lumped into one bucket.
*/
UPDATE appointments SET visit_type = 'installation'
  WHERE visit_type = 'scheduled_visit'
    AND (service_type ILIKE '%install%' OR service_type ILIKE '%تركيب%');

UPDATE appointments SET visit_type = 'repair'
  WHERE visit_type = 'scheduled_visit'
    AND (service_type ILIKE '%repair%' OR service_type ILIKE '%fix%' OR service_type ILIKE '%إصلاح%' OR service_type ILIKE '%صيانة طارئة%');

UPDATE appointments SET visit_type = 'emergency'
  WHERE visit_type = 'scheduled_visit'
    AND (service_type ILIKE '%emergency%' OR service_type ILIKE '%urgent%' OR service_type ILIKE '%طارئ%');

UPDATE appointments SET visit_type = 'preventive_maintenance'
  WHERE visit_type = 'scheduled_visit'
    AND (service_type ILIKE '%maintenance%' OR service_type ILIKE '%filter%' OR service_type ILIKE '%صيانة%' OR service_type ILIKE '%فلتر%');

-- Rows already flagged confirmed keep that state in the new columns.
UPDATE appointments
   SET confirmed_at = COALESCE(confirmed_at, created_at),
       confirmation_channel = COALESCE(confirmation_channel, 'phone')
 WHERE confirmed = true AND confirmed_at IS NULL;

/*
  Keep the legacy boolean and the new timestamp in agreement, whichever side
  a screen writes to.
*/
CREATE OR REPLACE FUNCTION sync_appointment_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
    NEW.confirmed := NEW.confirmed_at IS NOT NULL;
  ELSIF NEW.confirmed IS DISTINCT FROM OLD.confirmed THEN
    IF NEW.confirmed THEN
      NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
    ELSE
      NEW.confirmed_at := NULL;
      NEW.confirmed_by := NULL;
      NEW.confirmation_channel := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sync_appointment_confirmation_trg ON appointments;
CREATE TRIGGER sync_appointment_confirmation_trg
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION sync_appointment_confirmation();
