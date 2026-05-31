/*
  Grant supabase_auth_admin the minimum privileges needed to query profiles
  during Auth signIn/signUp schema inspection.
  Only adds missing privileges — no table, data, policy, or trigger changes.
*/
GRANT SELECT ON public.profiles TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.get_technicians() TO supabase_auth_admin;
