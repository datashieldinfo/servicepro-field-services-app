/**
 * Finding the customer behind a ringing number.
 *
 * The same person is written down six different ways — `+962 77 806 8705`,
 * `0778068705`, `00962778068705`, `77806 8705` — so matching on the text never
 * worked. Everything here reduces a number to one comparable key, which the
 * database also generates into an indexed column on `customers`.
 */

import { supabase } from './supabase';

/**
 * The comparable form of a number, and the one the database generates into
 * `customers.phone_key` — the two must stay identical or nothing ever matches.
 *
 * Digits only, then the country code, then leading zeros, then the last nine.
 * Dropping the country code before the zeros is what makes landlines work:
 * `+962 6 551 2345` and `06 551 2345` are the same line, but taking the last
 * nine digits of each gives two different answers.
 */
export function phoneKey(raw?: string | null): string {
  const digits = (raw ?? '')
    .replace(/\D/g, '')
    .replace(/^(00)?962/, '')
    .replace(/^0+/, '');
  return digits.slice(-9);
}

/** Whether a typed number is long enough to be worth looking up. */
export function isLookupReady(raw?: string | null): boolean {
  return phoneKey(raw).length >= 6;
}

export interface PhoneMatch {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  customer_type: string | null;
  company_name: string | null;
  contact_person_name: string | null;
  contact_person_phone: string | null;
  created_at: string | null;
  /** Which number matched — the customer's own, or their contact person's. */
  matched_on: 'phone' | 'contact_person';
}

const MATCH_COLUMNS =
  'id, name, phone, email, address, customer_type, company_name, contact_person_name, contact_person_phone, created_at, phone_key, contact_phone_key';

/**
 * Every customer whose own number, or whose contact person's number, reduces to
 * the same key. Usually one; a shared office line can give several.
 */
export async function findCustomersByPhone(raw: string): Promise<PhoneMatch[]> {
  const key = phoneKey(raw);
  if (key.length < 6) return [];

  const { data, error } = await supabase
    .from('customers')
    .select(MATCH_COLUMNS)
    .or(`phone_key.eq.${key},contact_phone_key.eq.${key}`)
    .limit(25);

  if (error || !data) return [];

  return (data as (PhoneMatch & { phone_key: string | null; contact_phone_key: string | null })[])
    .map(row => ({
      ...row,
      matched_on: row.phone_key === key ? ('phone' as const) : ('contact_person' as const),
    }))
    /* The customer's own number outranks a contact person's. */
    .sort((a, b) => (a.matched_on === b.matched_on ? 0 : a.matched_on === 'phone' ? -1 : 1));
}

/** Pretty form for display: `+962 77 806 8705` stays as stored, else grouped. */
export function formatPhone(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '—';
  if (value.startsWith('+')) return value;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return value;
}
