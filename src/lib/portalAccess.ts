/**
 * Portal (BioFamily 360) access for a customer who already exists.
 *
 * The one-time login link shown right after registration is gone the moment
 * that window closes — it cannot be read back out of Supabase. This issues a
 * fresh one, and grants access to a customer who was registered without it.
 */

import { supabase } from './supabase';
import { generatePassword } from './customerService';

export interface PortalResult {
  ok: boolean;
  error?: string;
  /** One-time magic link that signs the customer in and forces a new password. */
  loginLink?: string;
  /** Fallback for when the link expires. */
  tempPassword?: string;
  /** True when this call created the account rather than re-issuing a link. */
  created?: boolean;
  email?: string;
}

export async function issuePortalAccess(
  customerId: string,
  fullName: string,
  email?: string | null
): Promise<PortalResult> {
  const tempPassword = generatePassword();
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      mode: 'invite',
      type: 'customer',
      customer_id: customerId,
      email: email?.trim() || undefined,
      full_name: fullName,
      password: tempPassword,
      must_change_password: true,
      redirect_to: `${window.location.origin}/login`,
    }),
  });

  let json: {
    login_link?: string | null;
    created?: boolean;
    email?: string;
    error?: string;
  } = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok || json.error) {
    return { ok: false, error: json.error ?? `portal access failed (${res.status})` };
  }

  return {
    ok: true,
    loginLink: json.login_link ?? undefined,
    tempPassword,
    created: json.created,
    email: json.email,
  };
}
