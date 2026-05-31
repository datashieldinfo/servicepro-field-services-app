/*
  # Service Requests System

  1. New table: service_requests
  2. New columns on customers: contract_type, warranty_expires, device_install_date
  3. New columns on appointments: tds_before, tds_after, followup_recommended, followup_days, followup_reason
  4. RLS policies for service_requests
*/

-- ── service_requests ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'schedule','part_due','complaint','followup','test_fail',
    'warranty','emergency','unknown_history','customer_request'
  )),
  urgency text NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low','medium','high','emergency')),
  description text DEFAULT '',
  triggered_by text NOT NULL DEFAULT 'system' CHECK (triggered_by IN ('system','customer','technician','admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scheduled','dismissed')),
  linked_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  suggested_date date,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

-- Customers: insert own requests, read own
CREATE POLICY "Customers can insert own service requests"
  ON service_requests FOR INSERT TO authenticated
  WITH CHECK (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

CREATE POLICY "Customers can view own service requests"
  ON service_requests FOR SELECT TO authenticated
  USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Technicians: insert only (triggered_by=technician)
CREATE POLICY "Technicians can insert service requests"
  ON service_requests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'technician'));

-- Admins and owners: full access
CREATE POLICY "Admins and owners can read all service requests"
  ON service_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));

CREATE POLICY "Admins and owners can update service requests"
  ON service_requests FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));

CREATE POLICY "Admins and owners can insert service requests"
  ON service_requests FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','owner')));

-- ── customers: new columns ─────────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contract_type text DEFAULT 'quarterly'
  CHECK (contract_type IN ('monthly','quarterly','biannual','annual'));
ALTER TABLE customers ADD COLUMN IF NOT EXISTS warranty_expires date;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS device_install_date date;

-- ── appointments: new columns ──────────────────────────────────────────────
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tds_before integer;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tds_after integer;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS followup_recommended boolean DEFAULT false;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS followup_days integer;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS followup_reason text DEFAULT '';
