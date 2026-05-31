/*
  # Create inventory table

  1. New Tables
    - `inventory`
      - `id` (uuid, primary key)
      - `part_name` (text)
      - `quantity` (integer)
      - `unit` (text)
      - `low_stock_threshold` (integer, default 5)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Owner and Admin can read/write inventory
    - Technicians can read inventory
*/

CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'piece',
  low_stock_threshold integer NOT NULL DEFAULT 5,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read inventory"
  ON inventory FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'owner'
    )
  );

CREATE POLICY "Admin can read inventory"
  ON inventory FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Technician can read inventory"
  ON inventory FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'technician'
    )
  );

CREATE POLICY "Admin and Owner can insert inventory"
  ON inventory FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admin and Owner can update inventory"
  ON inventory FOR UPDATE
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
