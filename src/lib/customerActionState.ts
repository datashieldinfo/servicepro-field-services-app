/**
 * Which customers still need the office to do something, and what offer is
 * open for them.
 *
 * A customer created through the registration window gets a "what's next?"
 * screen — send an offer, book an installation, schedule a visit. Closing that
 * window used to lose the thread entirely, so the same state is computed here
 * and reused by every dashboard that lists customers.
 */

import { supabase } from './supabase';
import type { QuotationItem } from './quotationFields';

export interface OpenOffer {
  id: string;
  quote_number: string;
  status: string;
  total_amount: number;
  items: QuotationItem[] | null;
  valid_until: string | null;
  notes: string | null;
  subtotal: number | null;
  discount: number | null;
  created_at: string;
}

export interface CustomerActionState {
  /** Registered, but with no visit and no offer — nobody followed up. */
  awaiting: Set<string>;
  /** Newest offer per customer that the customer has not answered yet. */
  offers: Record<string, OpenOffer>;
}

const OFFER_COLUMNS =
  'id, customer_id, quote_number, status, total_amount, items, valid_until, notes, subtotal, discount, created_at';

/** An offer still waiting on the customer's yes or no. */
export function isOfferOpen(offer: { status: string }): boolean {
  return offer.status === 'draft' || offer.status === 'sent';
}

export async function loadCustomerActionState(
  customerRows: { id: string }[]
): Promise<CustomerActionState> {
  const [apptRes, quoteRes] = await Promise.all([
    supabase.from('appointments').select('customer_id'),
    supabase.from('quotations').select(OFFER_COLUMNS).order('created_at', { ascending: false }),
  ]);

  const withVisit = new Set(
    ((apptRes.data ?? []) as { customer_id: string | null }[])
      .map(r => r.customer_id)
      .filter(Boolean) as string[]
  );

  const quotes = (quoteRes.data ?? []) as (OpenOffer & { customer_id: string })[];
  const withOffer = new Set(quotes.map(q => q.customer_id));

  const offers: Record<string, OpenOffer> = {};
  quotes.forEach(q => {
    if (!offers[q.customer_id] && isOfferOpen(q)) offers[q.customer_id] = q;
  });

  return {
    offers,
    awaiting: new Set(
      customerRows.filter(c => !withVisit.has(c.id) && !withOffer.has(c.id)).map(c => c.id)
    ),
  };
}

/** The newest unanswered offer for one customer — used where no list was loaded. */
export async function loadOpenOffer(customerId: string): Promise<OpenOffer | null> {
  const { data } = await supabase
    .from('quotations')
    .select(OFFER_COLUMNS)
    .eq('customer_id', customerId)
    .in('status', ['draft', 'sent'])
    .order('created_at', { ascending: false })
    .limit(1);

  return ((data ?? [])[0] as OpenOffer) ?? null;
}
