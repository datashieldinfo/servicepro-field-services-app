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
import { customerStatus, type CustomerStatus } from './statusMeta';

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
  /** Where each customer stands with us, for the badge on their row. */
  statuses: Record<string, CustomerStatus>;
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
  const [apptRes, quoteRes, contractRes] = await Promise.all([
    supabase.from('appointments').select('customer_id, status, scheduled_at'),
    supabase.from('quotations').select(OFFER_COLUMNS).order('created_at', { ascending: false }),
    supabase.from('contracts').select('customer_id, status, end_date').order('end_date', { ascending: false }),
  ]);

  const visits = (apptRes.data ?? []) as {
    customer_id: string | null;
    status: string;
    scheduled_at: string;
  }[];

  const withVisit = new Set(visits.map(r => r.customer_id).filter(Boolean) as string[]);

  const quotes = (quoteRes.data ?? []) as (OpenOffer & { customer_id: string })[];
  const withOffer = new Set(quotes.map(q => q.customer_id));

  const offers: Record<string, OpenOffer> = {};
  quotes.forEach(q => {
    if (!offers[q.customer_id] && isOfferOpen(q)) offers[q.customer_id] = q;
  });

  /* Newest contract per customer — the list is already sorted by end date. */
  const contracts: Record<string, { status: string; end_date: string }> = {};
  ((contractRes.data ?? []) as { customer_id: string; status: string; end_date: string }[])
    .forEach(c => {
      if (!contracts[c.customer_id]) contracts[c.customer_id] = c;
    });

  /* Last visit done and next visit booked, per customer. */
  const lastVisit: Record<string, string> = {};
  const nextVisit: Record<string, string> = {};
  const now = Date.now();
  visits.forEach(v => {
    if (!v.customer_id) return;
    if (v.status === 'completed') {
      if (!lastVisit[v.customer_id] || v.scheduled_at > lastVisit[v.customer_id]) {
        lastVisit[v.customer_id] = v.scheduled_at;
      }
    } else if (v.status !== 'cancelled' && new Date(v.scheduled_at).getTime() >= now) {
      if (!nextVisit[v.customer_id] || v.scheduled_at < nextVisit[v.customer_id]) {
        nextVisit[v.customer_id] = v.scheduled_at;
      }
    }
  });

  const statuses: Record<string, CustomerStatus> = {};
  customerRows.forEach(c => {
    statuses[c.id] = customerStatus({
      contract: contracts[c.id] ?? null,
      openOffer: Boolean(offers[c.id]),
      lastVisitAt: lastVisit[c.id] ?? null,
      nextVisitAt: nextVisit[c.id] ?? null,
    });
  });

  return {
    offers,
    statuses,
    awaiting: new Set(
      customerRows.filter(c => !withVisit.has(c.id) && !withOffer.has(c.id)).map(c => c.id)
    ),
  };
}

/**
 * The last offer this customer received, answered or not — what the 360 card
 * shows, where "the offer we sent them" matters more than "the offer still open".
 */
export async function loadLatestOffer(customerId: string): Promise<OpenOffer | null> {
  const { data } = await supabase
    .from('quotations')
    .select(OFFER_COLUMNS)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1);

  return ((data ?? [])[0] as OpenOffer) ?? null;
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
