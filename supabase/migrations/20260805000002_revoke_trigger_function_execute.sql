/*
  # Trigger functions are not an API

  Supabase's advisor flags every SECURITY DEFINER function that `anon` or
  `authenticated` may call over `/rest/v1/rpc/...`. For the functions that answer
  questions about the caller that is intended — they are how the app asks what it
  may open, and each one reports only on whoever is asking. For the ones that
  only ever run as triggers it is not: nothing should be able to invoke them by
  name, and Postgres refuses such a call anyway, so revoking costs nothing and
  removes the question.

  This covers the trigger functions this work introduced. The older ones
  (`handle_new_user`, `check_filter_triggers`, the inventory and contract sync
  triggers) carry the same grant and predate it; they are left alone here rather
  than changed as a side effect of unrelated work.
*/

REVOKE EXECUTE ON FUNCTION public.set_tenant_id()                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_platform_admin_flag()         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_privileged_profile_columns()  FROM anon, authenticated;
