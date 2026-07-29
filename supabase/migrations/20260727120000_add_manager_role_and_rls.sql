-- Add 'manager' role and grant it backoffice-equivalent (admin/owner-level) access
-- across every table so a manager/back-office user can view & manage master and
-- transactional data (Customer 360, invoices, contracts, devices, inventory, etc).

-- 1. Allow 'manager' in profiles.role
ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'technician'::text, 'admin'::text, 'customer'::text, 'manager'::text]));

-- 2. appointments
ALTER POLICY "Admins manage appointments" ON public.appointments
  USING (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text]))
  WITH CHECK (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text]));

ALTER POLICY "Technicians read appointments" ON public.appointments
  USING (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'technician'::text, 'manager'::text]));

-- 3. contracts
ALTER POLICY "admins_manage_contracts" ON public.contracts
  USING (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text]))
  WITH CHECK (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text]));

ALTER POLICY "customers_see_own_contracts" ON public.contracts
  USING ((customer_id IN ( SELECT customers.id FROM customers WHERE customers.user_id = auth.uid()))
    OR (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

-- 4. customer_devices
ALTER POLICY "Admin and Owner manage devices" ON public.customer_devices
  USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

ALTER POLICY "admins_manage_devices" ON public.customer_devices
  USING (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text]))
  WITH CHECK (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text]));

ALTER POLICY "customers_see_own_devices" ON public.customer_devices
  USING ((customer_id IN ( SELECT customers.id FROM customers WHERE customers.user_id = auth.uid()))
    OR (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'technician'::text, 'manager'::text])));

-- 5. customers
ALTER POLICY "Admins manage customers" ON public.customers
  USING (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text]))
  WITH CHECK (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text]));

-- 6. filter_status
ALTER POLICY "Admins can manage filter statuses" ON public.filter_status
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'technician'::text, 'manager'::text])));

ALTER POLICY "Admins can update filter statuses" ON public.filter_status
  USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'technician'::text, 'manager'::text])))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'technician'::text, 'manager'::text])));

-- 7. inventory
ALTER POLICY "Admin and Owner can insert inventory" ON public.inventory
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

ALTER POLICY "Admin and Owner can update inventory" ON public.inventory
  USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

-- 8. invoices
ALTER POLICY "Admins and owners can delete invoices" ON public.invoices
  USING (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text]));

ALTER POLICY "Admins and owners can update invoices" ON public.invoices
  USING (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text]));

ALTER POLICY "Users can read relevant invoices" ON public.invoices
  USING ((customer_id IN ( SELECT customers.id FROM customers WHERE customers.user_id = auth.uid()))
    OR (technician_id = auth.uid())
    OR (( SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

-- 9. job_parts / job_photos / job_readings (read-only for backoffice)
ALTER POLICY "Admins and owners can view all job parts" ON public.job_parts
  USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

ALTER POLICY "Admins and owners can view all job photos" ON public.job_photos
  USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

ALTER POLICY "Admins and owners can view all readings" ON public.job_readings
  USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

-- 10. job_tasks
ALTER POLICY "Admins can insert job tasks" ON public.job_tasks
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

-- 11. notifications
ALTER POLICY "System can insert notifications for users" ON public.notifications
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

-- 12. service_requests
ALTER POLICY "Admins and owners can insert service requests" ON public.service_requests
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

ALTER POLICY "Admins and owners can read all service requests" ON public.service_requests
  USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

ALTER POLICY "Admins and owners can update service requests" ON public.service_requests
  USING (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])))
  WITH CHECK (EXISTS ( SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin'::text, 'owner'::text, 'manager'::text])));

-- 13. get_my_role() helper is unaffected (returns raw role text; callers already treat 'manager' as a valid value)
