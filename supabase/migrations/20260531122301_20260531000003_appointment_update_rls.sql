-- Ensure technicians can UPDATE their own appointments (status transitions, notes)
DROP POLICY IF EXISTS "Technicians update own appointments" ON appointments;
DROP POLICY IF EXISTS "Technicians can update own appointments" ON appointments;
CREATE POLICY "Technicians can update own appointments"
  ON appointments FOR UPDATE TO authenticated
  USING (technician_id = auth.uid())
  WITH CHECK (technician_id = auth.uid());

-- Ensure customers can UPDATE their own appointments (confirm, approve/reject)
DROP POLICY IF EXISTS "Customers update own appointments" ON appointments;
DROP POLICY IF EXISTS "Customers can confirm own appointments" ON appointments;
CREATE POLICY "Customers can update own appointments"
  ON appointments FOR UPDATE TO authenticated
  USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()))
  WITH CHECK (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));
