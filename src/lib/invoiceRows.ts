/**
 * Reading invoices back out of the database.
 *
 * The Office Admin, Back Office and Owner screens each fetched invoices with
 * their own copy of the same select string and their own copy of the same
 * fifteen-field mapping into the printable document — three places to update
 * whenever an invoice gained a field, and three places for them to disagree.
 */

import { supabase } from './supabase';
import type { InvoiceData } from '../components/PrintableInvoice';

/** Columns every invoice list needs, including the embeds the document uses. */
export const INVOICE_SELECT =
  'id, invoice_number, total_amount, payment_method, payment_status, issued_at, ' +
  'appointment_id, customer_id, technician_id, labor_cost, parts_used, ' +
  'customers(name, address, phone), ' +
  'technician:profiles!invoices_technician_id_fkey(full_name), ' +
  'appointments(service_type, scheduled_at)';

/**
 * PostgREST returns an embedded row as an object or as a one-element array
 * depending on how it inferred the relationship — this flattens both.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export interface InvoiceEmbeds {
  customer: { name: string; address: string; phone: string } | null;
  technician: { full_name: string } | null;
  appointment: { service_type: string; scheduled_at: string } | null;
}

export function invoiceEmbeds(row: Record<string, unknown>): InvoiceEmbeds {
  return {
    customer: one(row.customers as Record<string, unknown>) as InvoiceEmbeds['customer'],
    technician: one(row.technician as Record<string, unknown>) as InvoiceEmbeds['technician'],
    appointment: one(row.appointments as Record<string, unknown>) as InvoiceEmbeds['appointment'],
  };
}

/** A fetched invoice row as the printable document wants it. */
export function toInvoiceData(row: Record<string, unknown>): InvoiceData {
  const { customer, technician, appointment } = invoiceEmbeds(row);
  // Older seeded rows stored the unit price as `price`.
  const parts = (Array.isArray(row.parts_used) ? row.parts_used : []) as
    { name: string; quantity: number; unit_price?: number; price?: number }[];

  return {
    invoiceNumber: row.invoice_number as string,
    issuedAt: row.issued_at as string,
    customer: {
      name: customer?.name ?? '-',
      address: customer?.address ?? '-',
      phone: customer?.phone ?? '-',
    },
    technicianName: technician?.full_name ?? '-',
    serviceType: appointment?.service_type ?? '-',
    serviceDate: appointment?.scheduled_at ?? (row.issued_at as string),
    parts: parts.map(p => ({ name: p.name, quantity: p.quantity, unitPrice: p.unit_price ?? p.price ?? 0 })),
    laborCost: (row.labor_cost as number) ?? 0,
    totalAmount: (row.total_amount as number) ?? 0,
    paymentMethod: (row.payment_method as string) ?? 'cash',
    paymentStatus: (row.payment_status as string) ?? 'pending',
  };
}

interface FetchOptions {
  /** Only invoices issued on or after this ISO timestamp. */
  since?: string;
  limit?: number;
}

/** Newest invoices first, with the embeds each screen renders. */
export async function fetchInvoices({ since, limit = 100 }: FetchOptions = {}) {
  let query = supabase.from('invoices').select(INVOICE_SELECT);
  if (since) query = query.gte('issued_at', since);

  const { data } = await query.order('issued_at', { ascending: false }).limit(limit);
  return (data ?? []) as unknown as Record<string, unknown>[];
}

/** Midnight on the first of the current month, as an ISO timestamp. */
export function startOfMonth(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}
