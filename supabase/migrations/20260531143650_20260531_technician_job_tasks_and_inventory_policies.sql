/*
  # Technician RLS: job_tasks INSERT + inventory UPDATE

  1. New Policies
    - `job_tasks`: Technicians can insert checklist items only for appointments assigned to them
    - `inventory`: Technicians can update inventory rows (to decrement quantity when using parts)

  2. Scope
    - job_tasks INSERT: scoped to appointments.technician_id = auth.uid()
    - inventory UPDATE: scoped to authenticated technician role (no direct FK to appointment available)

  3. No other tables, policies, data, or schema objects are modified.
*/

CREATE POLICY "Technicians can insert tasks for their own appointments"
  ON public.job_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = job_tasks.appointment_id
        AND appointments.technician_id = auth.uid()
    )
  );

CREATE POLICY "Technicians can decrement inventory quantity for job parts"
  ON public.inventory
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'technician'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'technician'
    )
  );
