/**
 * Price offers (quotations).
 *
 * Lines are quoted from `inventory` — the same catalogue the jobs and invoices
 * price from — or typed by hand for one-off items. An accepted offer converts
 * into an installation visit, carrying its device lines across.
 */

import { supabase } from './supabase';

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
export type QuotationChannel = 'whatsapp' | 'email' | 'print' | 'in_person';
export type LineKind = 'device' | 'part' | 'accessory' | 'service' | 'custom';

export interface QuotationItem {
  kind: LineKind;
  /** `inventory.id` when the line came from the catalogue. */
  ref_id: string | null;
  name: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface QuotationRecord {
  id: string;
  quote_number: string;
  customer_id: string;
  status: QuotationStatus;
  items: QuotationItem[];
  subtotal: number;
  discount: number;
  total_amount: number;
  currency: string;
  valid_until: string | null;
  notes: string;
  created_at: string;
}

export const QUOTATION_STATUS_COLORS: Record<QuotationStatus, string> = {
  draft:    'bg-slate-100 text-slate-600',
  sent:     'bg-blue-50 text-blue-700',
  accepted: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  expired:  'bg-amber-50 text-amber-700',
};

export function lineTotal(qty: number, unitPrice: number): number {
  return Math.round(qty * unitPrice * 100) / 100;
}

export function quotationTotals(items: QuotationItem[], discount: number) {
  const subtotal = Math.round(items.reduce((sum, i) => sum + i.total, 0) * 100) / 100;
  const total = Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  return { subtotal, total };
}

/** Default validity: 30 days out, as an ISO date. */
export function defaultValidUntil(days = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Sequential offer number (QT-YYYY-NNN). Uses the DB helper so concurrent
 * drafts cannot collide on a number computed in the browser.
 */
export async function nextQuoteNumber(): Promise<string> {
  const { data, error } = await supabase.rpc('next_quote_number');
  if (!error && typeof data === 'string') return data;

  // Helper missing (older database) — fall back to a client-side count.
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('quotations')
    .select('id', { count: 'exact', head: true })
    .like('quote_number', `QT-${year}-%`);
  return `QT-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`;
}

/** The WhatsApp/email body for an offer. */
export function quotationMessage(
  quote: { quote_number: string; items: QuotationItem[]; total_amount: number; currency: string; valid_until: string | null },
  customerName: string,
  isAr: boolean
): string {
  const lines = quote.items.map(i => `• ${i.name} × ${i.qty} — ${i.total.toFixed(2)} ${quote.currency}`).join('\n');

  if (isAr) {
    return [
      `مرحباً ${customerName}،`,
      `عرض السعر رقم ${quote.quote_number} من BioFamily الأردن:`,
      '',
      lines,
      '',
      `الإجمالي: ${quote.total_amount.toFixed(2)} ${quote.currency}`,
      quote.valid_until ? `صالح حتى: ${quote.valid_until}` : '',
      '',
      'لتأكيد الطلب أو الاستفسار، يرجى الرد على هذه الرسالة.',
    ].filter(Boolean).join('\n');
  }

  return [
    `Hello ${customerName},`,
    `Price offer ${quote.quote_number} from BioFamily Jordan:`,
    '',
    lines,
    '',
    `Total: ${quote.total_amount.toFixed(2)} ${quote.currency}`,
    quote.valid_until ? `Valid until: ${quote.valid_until}` : '',
    '',
    'Reply to this message to accept or ask a question.',
  ].filter(Boolean).join('\n');
}
