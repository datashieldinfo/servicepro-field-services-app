/**
 * The first login of a new company.
 *
 * A company with modules and permission sets but no account is a company
 * nobody can open. When one is created, its owner is created with it, and the
 * credentials are shown once on screen to be handed over.
 *
 * The defaults are derived from the company name so they are predictable:
 * the slug is used rather than the name itself because the name may carry
 * spaces, Arabic, or punctuation that make a password painful to type on a
 * phone and an address invalid outright. Both are editable before saving.
 */

import { supabase } from './supabase';

/** Change this if the company logins should sit on your own domain. */
export const OWNER_LOGIN_DOMAIN = 'servisgo.app';

/** The year in the default password. Stated by the business, not derived. */
export const OWNER_PASSWORD_YEAR = '2026';

export interface OwnerCredentials {
  email: string;
  password: string;
}

/**
 * `Aqua Rivals` → aqua-rivals@servisgo.app / aqua-rivals@2026
 *
 * A company that gave a contact address logs in with that instead — it is a
 * real mailbox, so the link and any future reset actually arrive.
 */
export function defaultOwnerCredentials(slug: string, contactEmail?: string): OwnerCredentials {
  const handle = (slug || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const safe = handle || 'company';
  return {
    email: contactEmail?.trim() || `${safe}@${OWNER_LOGIN_DOMAIN}`,
    password: `${safe}@${OWNER_PASSWORD_YEAR}`,
  };
}

export interface OwnerResult {
  ok: boolean;
  error?: string;
  email?: string;
  password?: string;
  /** One-time link, for a company whose address is a real mailbox. */
  loginLink?: string;
}

/**
 * Creates the company's owner account. Goes through the `create-user` edge
 * function because only the service role may create a login — and that
 * function refuses this type to anyone who is not a platform admin.
 */
export async function createTenantOwner(
  tenantId: string,
  companyName: string,
  credentials: OwnerCredentials,
  phone = '',
  mustChangePassword = false
): Promise<OwnerResult> {
  const { data: { session } } = await supabase.auth.getSession();

  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        type: 'tenant_owner',
        tenant_id: tenantId,
        email: credentials.email,
        password: credentials.password,
        full_name: companyName,
        phone,
        must_change_password: mustChangePassword,
      }),
    });

    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error ?? `create-user failed (${res.status})` };

    return {
      ok: true,
      email: json.email ?? credentials.email,
      password: json.password ?? credentials.password,
      loginLink: json.login_link ?? undefined,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
