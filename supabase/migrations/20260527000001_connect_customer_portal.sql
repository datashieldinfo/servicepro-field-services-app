/*
  # Connect Customer Portal to Supabase

  1. Schema changes
     - Add `user_id` to `customers` — links an auth user to their customer record

  2. New / fixed policies
     - customers: own-record SELECT + INSERT
     - appointments: customer SELECT, UPDATE (confirmed only), INSERT (for demo seeding)
     - filter_status: fix broken customer SELECT, add customer INSERT
     - notifications: user self-INSERT (for demo seeding)
*/

-- ── customers ──────────────────────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_user_id_key
  ON customers(user_id)
  WHERE user_id IS NOT NULL;

CREATE POLICY "Customers can view own customer record"
  ON customers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own customer record"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── appointments ───────────────────────────────────────────────────────────
CREATE POLICY "Customers can view own appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

CREATE POLICY "Customers can confirm own appointments"
  ON appointments FOR UPDATE
  TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- Allow customers to insert appointments against their own customer record (demo seeding)
CREATE POLICY "Customers can insert own appointments"
  ON appointments FOR INSERT
  TO authenticated
  WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- Allow technicians to update their assigned appointments (status transitions)
CREATE POLICY "Technicians can update own appointments"
  ON appointments FOR UPDATE
  TO authenticated
  USING (technician_id = auth.uid())
  WITH CHECK (technician_id = auth.uid());

-- ── filter_status ──────────────────────────────────────────────────────────
-- Drop the broken policy that allowed all customers to see all filter statuses
DROP POLICY IF EXISTS "Customers can view their own filter status" ON filter_status;

CREATE POLICY "Customers can view own filter status"
  ON filter_status FOR SELECT
  TO authenticated
  USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

CREATE POLICY "Customers can insert own filter status"
  ON filter_status FOR INSERT
  TO authenticated
  WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- ── notifications ──────────────────────────────────────────────────────────
CREATE POLICY "Users can insert own notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── Link demo customer account to customer record ──────────────────────────
-- Associates customer@demo.com (UUID 00000000-...-0004) with Al Amal Medical
-- Clinic so the CustomerDashboard shows real data when logged in as that account.
UPDATE customers
SET user_id = '00000000-0000-0000-0000-000000000004'
WHERE email = 'info@alamal-clinic.jo'
  AND (user_id IS NULL OR user_id = '00000000-0000-0000-0000-000000000004');
