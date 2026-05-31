/*
  # Add SELECT policy on customers for technicians

  Technicians need to read customer details (name, address, phone) for their
  assigned appointments. Without this policy, the customers sub-select in
  TechnicianDashboard queries returns null, and invoice creation fails.

  Changes:
  - Adds one SELECT policy on public.customers for authenticated users with
    role = technician, scoped only to customers linked to their own appointments.

  No other tables, policies, or data are modified.
*/

CREATE POLICY "Technicians can read customers for their assigned jobs"
  ON public.customers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.customer_id = customers.id
        AND appointments.technician_id = auth.uid()
    )
  );
