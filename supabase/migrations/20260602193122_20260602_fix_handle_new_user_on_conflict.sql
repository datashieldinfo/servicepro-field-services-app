/*
  # Fix handle_new_user trigger: add ON CONFLICT DO NOTHING

  The trigger was failing with a unique constraint violation when signUp was
  called for a user whose profile already existed (e.g. demo accounts seeded
  with fixed UUIDs). Supabase wraps this as HTTP 500 "Database error querying
  schema", blocking all signIn and signUp attempts.

  Only the INSERT statement is changed — ON CONFLICT (id) DO NOTHING is added.
  No tables, policies, data, or other functions are modified.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
