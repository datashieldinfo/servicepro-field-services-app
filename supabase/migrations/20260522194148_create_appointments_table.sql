/*
  # Create appointments table

  1. New Tables
    - `appointments`
      - `id` (uuid, primary key)
      - `customer_id` (uuid, references customers)
      - `technician_id` (uuid, references profiles, nullable)
      - `service_type` (text)
      - `scheduled_at` (timestamptz)
      - `status` (text: pending | in_progress | completed | cancelled)
      - `address` (text)
      - `notes` (text, optional)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Owner and Admin can read/write all appointments
    - Technicians can read their own assigned appointments
*/

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE,
  technician_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  service_type text NOT NULL DEFAULT '',
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  address text NOT NULL DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read all appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'owner'
    )
  );

CREATE POLICY "Admin can read all appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Technician can read own appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    technician_id = auth.uid()
  );

CREATE POLICY "Admin and Owner can insert appointments"
  ON appointments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admin and Owner can update appointments"
  ON appointments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner')
    )
  );
