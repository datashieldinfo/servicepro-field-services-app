/*
  # Parts Approval Flow + TDS Readings

  1. Schema changes
     - appointments: add `awaiting_approval` status, `approval_notes`, `approval_granted`
     - New table: `job_readings` (tds_before, tds_after)

  2. New RLS policies
     - job_readings: technician insert/select, customer select, admin/owner select
     - job_tasks: customer select (for service report)
     - job_parts: customer select (for service report)
*/

-- ── appointments: extend status + add approval columns ─────────────────────
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('pending', 'in_progress', 'awaiting_approval', 'completed', 'cancelled'));

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS approval_notes text DEFAULT '';
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS approval_granted boolean DEFAULT false;

-- ── job_readings table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  tds_before integer,
  tds_after  integer,
  recorded_at timestamptz DEFAULT now()
);

ALTER TABLE job_readings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Technicians can insert readings for their jobs"
  ON job_readings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = job_readings.appointment_id
        AND appointments.technician_id = auth.uid()
    )
  );

CREATE POLICY "Technicians can view readings for their jobs"
  ON job_readings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = job_readings.appointment_id
        AND appointments.technician_id = auth.uid()
    )
  );

CREATE POLICY "Customers can view readings for their appointments"
  ON job_readings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      JOIN customers c ON c.id = a.customer_id
      WHERE a.id = job_readings.appointment_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins and owners can view all readings"
  ON job_readings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner')
    )
  );

-- ── job_tasks: customer SELECT (for service report) ────────────────────────
CREATE POLICY "Customers can view job tasks for their appointments"
  ON job_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      JOIN customers c ON c.id = a.customer_id
      WHERE a.id = job_tasks.appointment_id
        AND c.user_id = auth.uid()
    )
  );

-- ── job_parts: customer SELECT (for service report) ────────────────────────
CREATE POLICY "Customers can view job parts for their appointments"
  ON job_parts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments a
      JOIN customers c ON c.id = a.customer_id
      WHERE a.id = job_parts.appointment_id
        AND c.user_id = auth.uid()
    )
  );
