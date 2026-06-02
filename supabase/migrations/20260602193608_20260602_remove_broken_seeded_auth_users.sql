/*
  # Remove broken seeded auth users and dependent rows

  Cleans up the 4 demo auth.users rows inserted directly via SQL with
  hardcoded UUIDs (00000000-...) that cause Supabase auth HTTP 500 errors.
  The LoginPage signUp fallback will recreate them properly on next login.
*/

-- 1. Remove notifications (NOT NULL user_id — must delete)
DELETE FROM public.notifications
WHERE user_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004'
);

-- 2. Null out appointments.technician_id
UPDATE public.appointments
SET technician_id = NULL
WHERE technician_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004'
);

-- 3. Null out customers.user_id
UPDATE public.customers
SET user_id = NULL
WHERE user_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004'
);

-- 4. Null out activity_log.user_id
UPDATE public.activity_log
SET user_id = NULL
WHERE user_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004'
);

-- 5. Drop FK so profile rows can be deleted without cascade issues
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 6. Delete the 4 broken profiles
DELETE FROM public.profiles
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004'
);

-- 7. Delete broken auth.users rows (CASCADE cleans identities/sessions)
DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004'
);

-- 8. Restore FK
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
