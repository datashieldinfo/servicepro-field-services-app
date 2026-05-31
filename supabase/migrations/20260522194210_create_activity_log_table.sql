/*
  # Create activity_log table

  1. New Tables
    - `activity_log`
      - `id` (uuid, primary key)
      - `action` (text - e.g. appointment_created, job_completed)
      - `description` (text - human-readable description)
      - `user_id` (uuid, references profiles, nullable)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Owner and Admin can read all activity logs
*/

CREATE TABLE IF NOT EXISTS activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  description text NOT NULL DEFAULT '',
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can read activity log"
  ON activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'owner'
    )
  );

CREATE POLICY "Admin can read activity log"
  ON activity_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can insert activity log"
  ON activity_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
