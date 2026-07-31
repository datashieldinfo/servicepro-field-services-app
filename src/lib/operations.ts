/**
 * The writes several dashboards make against the same rows.
 *
 * Each of these was spelled out separately in the Office Admin, Back Office
 * and Owner screens, so the table names, the column names and details like
 * "paid also stamps paid_at" were repeated three times over and could be
 * changed in one screen without the others noticing.
 *
 * Each returns Supabase's `{ error }` so the caller keeps its own toast and
 * its own local state update.
 */

import { supabase } from './supabase';

/** Corrects the counted stock of a part. */
export async function setInventoryQuantity(id: string, quantity: number) {
  return supabase.from('inventory').update({ quantity }).eq('id', id);
}

/** Settles an invoice, stamping when it was paid. */
export async function markInvoicePaid(id: string) {
  return supabase
    .from('invoices')
    .update({ payment_status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id);
}

/** Takes a service request off the queue without booking anything. */
export async function dismissServiceRequest(id: string) {
  return supabase.from('service_requests').update({ status: 'dismissed' }).eq('id', id);
}

/**
 * Records that the customer confirmed the appointment. The database trigger
 * keeps the legacy `confirmed` boolean and `confirmed_at` in step, whichever
 * one a screen writes.
 */
export async function confirmAppointment(
  id: string,
  confirmedBy?: string | null,
  channel = 'phone',
) {
  return supabase
    .from('appointments')
    .update({
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy ?? null,
      confirmation_channel: channel,
    })
    .eq('id', id);
}
