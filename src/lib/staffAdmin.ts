/**
 * Managing somebody who already works here: edit, disable, re-enable, reset
 * their password, delete.
 *
 * All of it goes through the `manage-user` edge function rather than straight
 * at the table, because disabling and deleting a login need the service role —
 * the browser can flip a column but it cannot ban an account or remove it from
 * `auth.users`. The function re-checks the company boundary and the caller's
 * `team` rights; nothing here is trusted to have got that right.
 */

import { supabase } from './supabase';

export interface StaffResult {
  ok: boolean;
  error?: string;
  /** Set when a delete was refused because the account has work against it. */
  history?: { visits: number; invoices: number; customer: number };
}

async function call(body: Record<string, unknown>): Promise<StaffResult> {
  const { data: { session } } = await supabase.auth.getSession();

  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();

    if (res.status === 409 && json.error === 'has_history') {
      return {
        ok: false,
        error: 'has_history',
        history: { visits: json.visits ?? 0, invoices: json.invoices ?? 0, customer: json.customer ?? 0 },
      };
    }
    if (!res.ok || json.error) return { ok: false, error: json.error ?? `Failed (${res.status})` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export function updateStaff(
  profileId: string,
  patch: { full_name?: string; phone?: string; role?: string; permission_set_id?: string | null }
) {
  return call({ action: 'update', profile_id: profileId, ...patch });
}

export function setStaffActive(profileId: string, active: boolean) {
  return call({ action: 'set_active', profile_id: profileId, active });
}

export function resetStaffPassword(profileId: string, password: string) {
  return call({ action: 'reset_password', profile_id: profileId, password });
}

export function deleteStaff(profileId: string) {
  return call({ action: 'delete', profile_id: profileId });
}
