-- Fix 1: profiles SELECT policy moved to 20260531000002_fix_profiles_rls.sql
-- The recursive policy originally here (EXISTS SELECT FROM profiles inside a profiles policy)
-- caused infinite recursion → 500. Replaced with USING (true) in the next migration.

-- Fix 2: get_my_role() helper — used in invoices RLS policies
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Fix 3: get_technicians() RPC — used by AdminDashboard technician dropdown
-- Returns all technician profiles; SECURITY DEFINER bypasses profiles RLS
-- so it works even before Fix 1 is fully propagated.
CREATE OR REPLACE FUNCTION public.get_technicians()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name FROM profiles WHERE role = 'technician' ORDER BY full_name;
$$;
GRANT EXECUTE ON FUNCTION public.get_technicians() TO authenticated;
