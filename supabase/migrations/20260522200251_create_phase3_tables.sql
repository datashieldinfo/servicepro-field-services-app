/*
  # Phase 3: Technician & Customer Portal Tables

  1. New Tables
    - `job_tasks` - Checklist items for each appointment/job
      - `id` (uuid, primary key)
      - `appointment_id` (uuid, FK to appointments)
      - `title` (text) - task description
      - `completed` (boolean, default false)
      - `completed_at` (timestamptz, nullable)
    - `job_parts` - Parts/inventory used per job
      - `id` (uuid, primary key)
      - `appointment_id` (uuid, FK to appointments)
      - `inventory_id` (uuid, FK to inventory)
      - `quantity_used` (integer, default 1)
      - `notes` (text, nullable)
      - `created_at` (timestamptz)
    - `job_photos` - Photos uploaded by technicians
      - `id` (uuid, primary key)
      - `appointment_id` (uuid, FK to appointments)
      - `url` (text) - storage URL
      - `caption` (text, nullable)
      - `created_at` (timestamptz)
    - `notifications` - Customer/technician notifications
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to profiles)
      - `type` (text) - reminder, offer, alert
      - `message` (text)
      - `is_read` (boolean, default false)
      - `created_at` (timestamptz)
    - `filter_status` - Track filter replacement status per customer
      - `id` (uuid, primary key)
      - `customer_id` (uuid, FK to customers)
      - `location` (text)
      - `filter_type` (text)
      - `last_replaced` (date)
      - `next_due` (date)
      - `health_percent` (integer, default 100)

  2. Security
    - Enable RLS on all tables
    - Authenticated users can access their relevant data
*/

-- job_tasks table
CREATE TABLE IF NOT EXISTS job_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  title text NOT NULL,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Technicians can view tasks for their jobs"
  ON job_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = job_tasks.appointment_id
      AND appointments.technician_id = auth.uid()
    )
  );

CREATE POLICY "Admins and owners can view all job tasks"
  ON job_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Technicians can update their job tasks"
  ON job_tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = job_tasks.appointment_id
      AND appointments.technician_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = job_tasks.appointment_id
      AND appointments.technician_id = auth.uid()
    )
  );

CREATE POLICY "Admins can insert job tasks"
  ON job_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- job_parts table
CREATE TABLE IF NOT EXISTS job_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  inventory_id uuid NOT NULL REFERENCES inventory(id),
  quantity_used integer DEFAULT 1,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Technicians can view parts for their jobs"
  ON job_parts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = job_parts.appointment_id
      AND appointments.technician_id = auth.uid()
    )
  );

CREATE POLICY "Admins and owners can view all job parts"
  ON job_parts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Technicians can insert parts for their jobs"
  ON job_parts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = job_parts.appointment_id
      AND appointments.technician_id = auth.uid()
    )
  );

-- job_photos table
CREATE TABLE IF NOT EXISTS job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  url text NOT NULL,
  caption text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Technicians can view photos for their jobs"
  ON job_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = job_photos.appointment_id
      AND appointments.technician_id = auth.uid()
    )
  );

CREATE POLICY "Admins and owners can view all job photos"
  ON job_photos FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "Technicians can upload photos for their jobs"
  ON job_photos FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM appointments
      WHERE appointments.id = job_photos.appointment_id
      AND appointments.technician_id = auth.uid()
    )
  );

-- notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id),
  type text NOT NULL DEFAULT 'reminder',
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT notifications_type_check CHECK (type IN ('reminder', 'offer', 'alert'))
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can insert notifications for users"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- filter_status table
CREATE TABLE IF NOT EXISTS filter_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id),
  location text NOT NULL,
  filter_type text NOT NULL DEFAULT '',
  last_replaced date,
  next_due date,
  health_percent integer DEFAULT 100,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE filter_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view their own filter status"
  ON filter_status FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = filter_status.customer_id
      AND customers.id IN (
        SELECT c.id FROM customers c
        JOIN profiles p ON p.id = auth.uid()
        WHERE p.role = 'customer'
      )
    )
  );

CREATE POLICY "Admins and owners can view all filter statuses"
  ON filter_status FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'technician')
    )
  );

CREATE POLICY "Admins can manage filter statuses"
  ON filter_status FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'technician')
    )
  );

CREATE POLICY "Admins can update filter statuses"
  ON filter_status FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'technician')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'technician')
    )
  );

-- Add confirmed field to appointments for customer confirmation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments' AND column_name = 'confirmed'
  ) THEN
    ALTER TABLE appointments ADD COLUMN confirmed boolean DEFAULT false;
  END IF;
END $$;
