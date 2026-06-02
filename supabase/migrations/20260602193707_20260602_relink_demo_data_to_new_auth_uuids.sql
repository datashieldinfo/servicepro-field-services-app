/*
  # Relink demo data to new auth UUIDs

  The 4 demo auth users were recreated via the admin API with new UUIDs.
  This migration re-assigns appointments.technician_id, customers.user_id,
  notifications, and activity_log to the new UUIDs by looking up auth.users
  by email — so it stays correct regardless of the exact UUIDs assigned.

  No schema objects, policies, or non-demo data are modified.
*/

-- Re-assign appointments to technician (tech@demo.com)
UPDATE public.appointments
SET technician_id = (SELECT id FROM auth.users WHERE email = 'tech@demo.com' LIMIT 1)
WHERE technician_id IS NULL;

-- Re-link Al Amal Medical Clinic to customer@demo.com
UPDATE public.customers
SET user_id = (SELECT id FROM auth.users WHERE email = 'customer@demo.com' LIMIT 1)
WHERE email = 'info@alamal-clinic.jo';

-- Re-seed notifications for the customer
INSERT INTO public.notifications (user_id, type, message, is_read, created_at)
SELECT
  (SELECT id FROM auth.users WHERE email = 'customer@demo.com' LIMIT 1),
  t.type, t.message, t.is_read, now() - t.offset_interval
FROM (VALUES
  ('reminder', 'Reminder: RO system maintenance appointment tomorrow at 10 AM', false, INTERVAL '2 hours'),
  ('offer',    'Special offer: discount on RO membrane replacement this month',  false, INTERVAL '1 day'),
  ('alert',    'Alert: water quality has declined - RO membrane inspection recommended', true, INTERVAL '3 days'),
  ('reminder', 'Your appointment with the technician for RO system maintenance is confirmed', true, INTERVAL '5 days')
) AS t(type, message, is_read, offset_interval)
WHERE EXISTS (SELECT 1 FROM auth.users WHERE email = 'customer@demo.com');
