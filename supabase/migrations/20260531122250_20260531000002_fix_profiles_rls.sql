-- Drop ALL existing policies on profiles to eliminate the recursive one
-- ("Admin and Owner can read all profiles" queries profiles inside a profiles policy → infinite loop → 500)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'profiles'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS "' || r.policyname || '" ON profiles';
  END LOOP;
END $$;

-- Clean non-recursive policies
-- SELECT: all authenticated users can read all profiles (needed for technician names, dropdowns, JOINs)
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

-- INSERT: any authenticated user can insert (handle_new_user trigger also inserts via SECURITY DEFINER)
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated WITH CHECK (true);

-- UPDATE: users can only update their own profile
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
