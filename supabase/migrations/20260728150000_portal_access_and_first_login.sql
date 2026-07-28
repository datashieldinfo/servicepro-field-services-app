/*
  # Portal (360) access flag + forced password change on first login

  1. `customers.portal_access`
    Whether this customer gets a login to the 360 customer portal. Decided by a
    checkbox at registration time. Existing rows that already have a `user_id`
    are backfilled to true.

  2. `profiles.must_change_password`
    Set when an account is created for someone else (a customer invited by the
    office, a technician created by an admin). The app blocks the dashboard
    behind a "choose your password" screen until the user clears it, so a
    one-time login link cannot leave a shared password in circulation.

  3. Security
    - No new policies needed: `profiles_update` already restricts updates to
      `id = auth.uid()`, which is exactly who is allowed to clear the flag, and
      the customer policies already cover the new column.
*/

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal_access boolean NOT NULL DEFAULT false;

UPDATE customers SET portal_access = true WHERE user_id IS NOT NULL AND portal_access = false;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS customers_portal_access_idx ON customers (portal_access);
