/**
 * Single write path for customer records, shared by every role's UI.
 *
 * - With portal access ticked (which requires an email) → an auth account +
 *   profile is created through the `create-user` edge function, then the
 *   `customers` row is completed with the structured fields. A temporary
 *   password and a one-time login link come back so the office can hand either
 *   to the customer; the account is flagged to force a password change on first
 *   sign-in.
 * - Otherwise → only the `customers` row is written (no portal login), even if
 *   an email was given.
 */

import { supabase } from './supabase';
import {
  composeAddress,
  customerDisplayName,
  toCustomerRow,
  type CustomerForm,
  type CustomerSource,
} from './customerFields';

export interface CreateResult {
  ok: boolean;
  error?: string;
  customerId?: string;
  tempPassword?: string;
  /** One-time magic link that signs the customer in and forces a new password. */
  loginLink?: string;
  hasLogin: boolean;
}

/** 14-char URL-safe password from the CSPRNG. */
export function generatePassword(length = 14): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%';
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

export async function createCustomer(
  form: CustomerForm,
  source: CustomerSource = 'manual',
  isAr = false
): Promise<CreateResult> {
  const row = toCustomerRow(form, source, isAr);
  const email = row.email;

  // No portal access (or no email to sign in with) → record only, no account.
  if (!email || !form.portal_access) {
    const { data, error } = await supabase.from('customers').insert(row).select('id').single();
    if (error) return { ok: false, error: error.message, hasLogin: false };
    return { ok: true, customerId: data?.id, hasLogin: false };
  }

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
      type: 'customer',
      email,
      password: tempPassword,
      full_name: customerDisplayName(form),
      phone: row.phone,
      address: row.address,
      customer: row,
      must_change_password: true,
      redirect_to: `${window.location.origin}/login`,
    }),
  });

  let json: { user?: { id: string }; login_link?: string | null; error?: string } = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok || json.error || !json.user?.id) {
    return { ok: false, error: json.error ?? `create-user failed (${res.status})`, hasLogin: false };
  }

  const userId = json.user.id;
  const loginLink = json.login_link ?? undefined;

  // The edge function already inserted a bare row (name/email/phone/address).
  // Complete it with the structured fields — or insert it if that step failed.
  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from('customers').update(row).eq('id', existing.id);
    if (error) return { ok: true, customerId: existing.id, tempPassword, loginLink, hasLogin: true, error: error.message };
    return { ok: true, customerId: existing.id, tempPassword, loginLink, hasLogin: true };
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({ ...row, user_id: userId })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message, hasLogin: true };
  return { ok: true, customerId: data?.id, tempPassword, loginLink, hasLogin: true };
}

export interface BulkResult {
  inserted: number;
  failed: { name: string; error: string }[];
}

/**
 * Imported records are written straight to `customers` — no portal logins are
 * created in bulk. Accounts can be added later from the customer record.
 */
export async function createCustomersBulk(
  forms: CustomerForm[],
  source: CustomerSource,
  isAr = false
): Promise<BulkResult> {
  const result: BulkResult = { inserted: 0, failed: [] };
  const CHUNK = 25;

  for (let i = 0; i < forms.length; i += CHUNK) {
    const slice = forms.slice(i, i + CHUNK);
    const rows = slice.map(f => toCustomerRow(f, source, isAr));

    const { data, error } = await supabase.from('customers').insert(rows).select('id');

    if (!error) {
      result.inserted += data?.length ?? rows.length;
      continue;
    }

    // A single bad row fails the whole batch — retry one by one to isolate it.
    for (const form of slice) {
      const single = toCustomerRow(form, source, isAr);
      const { error: rowError } = await supabase.from('customers').insert(single);
      if (rowError) {
        result.failed.push({ name: single.name || composeAddress(form, isAr) || '—', error: rowError.message });
      } else {
        result.inserted += 1;
      }
    }
  }

  return result;
}
