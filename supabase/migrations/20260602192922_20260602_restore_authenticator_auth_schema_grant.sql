/*
  # Restore authenticator USAGE grant on auth schema

  The authenticator role lost its USAGE privilege on the auth schema,
  causing Supabase auth (signIn / signUp) to return HTTP 500
  "Database error querying schema".

  This migration restores the single missing grant.
  No tables, policies, functions, triggers, or data are modified.
*/

GRANT USAGE ON SCHEMA auth TO authenticator;
