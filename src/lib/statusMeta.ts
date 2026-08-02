/**
 * What every status actually means, and what the office is supposed to do about it.
 *
 * A raw word like "pending" tells nobody at which point the work is stuck. Each
 * status here carries a stage, a plain-language meaning, and the next action —
 * so a list can be read without asking anyone.
 */

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'muted';

export interface StatusMeta {
  /** i18n key suffix; labels live under `status.<key>` etc. */
  key: string;
  tone: Tone;
  /** Where in the process this sits, 1-based, for the stage indicator. */
  stage: number;
  totalStages: number;
}

export const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  info:    'bg-blue-50 text-blue-700 border-blue-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  success: 'bg-green-50 text-green-700 border-green-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
  muted:   'bg-slate-50 text-slate-400 border-slate-200',
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  info:    'bg-blue-500',
  warning: 'bg-amber-500',
  success: 'bg-green-500',
  danger:  'bg-red-500',
  muted:   'bg-slate-300',
};

/* ── Visits ──────────────────────────────────────────────────────────────── */

export const VISIT_STATUS: Record<string, StatusMeta> = {
  pending:           { key: 'pending',          tone: 'warning', stage: 1, totalStages: 4 },
  in_progress:       { key: 'inProgress',       tone: 'info',    stage: 2, totalStages: 4 },
  awaiting_approval: { key: 'awaitingApproval', tone: 'warning', stage: 3, totalStages: 4 },
  completed:         { key: 'completed',        tone: 'success', stage: 4, totalStages: 4 },
  cancelled:         { key: 'cancelled',        tone: 'muted',   stage: 4, totalStages: 4 },
};

export function visitStatusMeta(status: string): StatusMeta {
  return VISIT_STATUS[status] ?? { key: 'unknown', tone: 'neutral', stage: 1, totalStages: 4 };
}

/**
 * The reason a visit is sitting where it is. More specific than the status
 * alone: a pending visit nobody has confirmed is a different problem from a
 * pending visit with no technician on it.
 */
export function visitBlockers(visit: {
  status: string;
  confirmed?: boolean;
  technician_id?: string | null;
  scheduled_at: string;
  notes?: string | null;
}): string[] {
  const reasons: string[] = [];
  const when = new Date(visit.scheduled_at);
  const overdue = when.getTime() < Date.now();

  if (visit.status === 'pending') {
    if (!visit.confirmed) reasons.push('unconfirmed');
    if (!visit.technician_id) reasons.push('unassigned');
    if (overdue) reasons.push('overdue');
    if (visit.notes?.toLowerCase().includes('customer rejected')) reasons.push('rejected');
    if (!reasons.length) reasons.push('waitingForDay');
  }

  if (visit.status === 'in_progress') {
    reasons.push(overdue ? 'onSiteNow' : 'started');
  }

  if (visit.status === 'awaiting_approval') reasons.push('waitingCustomerApproval');
  if (visit.status === 'completed')         reasons.push('done');
  if (visit.status === 'cancelled')         reasons.push('cancelledReason');

  return reasons;
}

/* ── Service requests ────────────────────────────────────────────────────── */

export const REQUEST_STATUS: Record<string, StatusMeta> = {
  pending:   { key: 'pending',   tone: 'warning', stage: 1, totalStages: 3 },
  scheduled: { key: 'scheduled', tone: 'info',    stage: 2, totalStages: 3 },
  dismissed: { key: 'dismissed', tone: 'muted',   stage: 3, totalStages: 3 },
};

export function requestStatusMeta(status: string): StatusMeta {
  return REQUEST_STATUS[status] ?? { key: 'unknown', tone: 'neutral', stage: 1, totalStages: 3 };
}

export const URGENCY_TONE: Record<string, Tone> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

/** How long a request has been waiting, and whether that is too long. */
export function waitingFor(createdAt: string, urgency: string): { days: number; hours: number; breached: boolean } {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(hours / 24);
  const limit = urgency === 'high' ? 4 : urgency === 'medium' ? 48 : 168;
  return { days, hours, breached: hours > limit };
}

/* ── Contracts ───────────────────────────────────────────────────────────── */

export type ContractState = 'active' | 'lastVisit' | 'exhausted' | 'expiringSoon' | 'expired' | 'cancelled' | 'pending';

export interface ContractHealth {
  state: ContractState;
  tone: Tone;
  remaining: number;
  daysLeft: number;
  /** Worth putting in front of the office right now. */
  alert: boolean;
}

/**
 * Derives what is actually going on with a contract from its dates and usage,
 * rather than trusting the stored status alone.
 */
export function contractHealth(contract: {
  status: string;
  visits_included: number;
  visits_used: number;
  end_date: string;
}): ContractHealth {
  const remaining = Math.max(0, (contract.visits_included ?? 0) - (contract.visits_used ?? 0));
  const daysLeft = Math.ceil(
    (new Date(contract.end_date).getTime() - Date.now()) / 86_400_000
  );

  if (contract.status === 'cancelled') return { state: 'cancelled', tone: 'muted', remaining, daysLeft, alert: false };
  if (contract.status === 'pending')   return { state: 'pending',   tone: 'neutral', remaining, daysLeft, alert: false };

  if (daysLeft < 0)      return { state: 'expired',      tone: 'danger',  remaining, daysLeft, alert: true };
  if (remaining === 0)   return { state: 'exhausted',    tone: 'danger',  remaining, daysLeft, alert: true };
  if (remaining === 1)   return { state: 'lastVisit',    tone: 'warning', remaining, daysLeft, alert: true };
  if (daysLeft <= 30)    return { state: 'expiringSoon', tone: 'warning', remaining, daysLeft, alert: true };

  return { state: 'active', tone: 'success', remaining, daysLeft, alert: false };
}

/* ── Customers ───────────────────────────────────────────────────────────── */

export type CustomerState =
  | 'new'              // registered, nothing has happened yet
  | 'offerSent'        // an offer is with them, waiting on a yes or no
  | 'scheduled'        // a visit is booked but none has been completed
  | 'underContract'    // a live maintenance contract
  | 'contractExpiring' // live contract, ending within a month
  | 'contractExpired'  // the contract ran out and was not renewed
  | 'served'           // visits happened, no contract — a normal paying customer
  | 'dormant';         // nothing for a year

export interface CustomerStatus {
  state: CustomerState;
  tone: Tone;
  /** Worth chasing: the office should do something about this one. */
  alert: boolean;
}

export interface CustomerSignals {
  /** Newest contract, whatever its state. */
  contract?: { status: string; end_date: string } | null;
  /** Has an offer nobody has answered. */
  openOffer?: boolean;
  /** ISO date of the most recent completed visit. */
  lastVisitAt?: string | null;
  /** ISO date of the next visit still to happen. */
  nextVisitAt?: string | null;
}

const YEAR_MS = 365 * 86_400_000;

/**
 * Where a customer stands with us, from the traces they leave: a contract, an
 * open offer, visits done and visits booked. Read top to bottom — the first
 * thing that is true wins, so a live contract outranks an old visit.
 */
export function customerStatus(signals: CustomerSignals): CustomerStatus {
  const { contract, openOffer, lastVisitAt, nextVisitAt } = signals;

  if (contract && contract.status !== 'cancelled') {
    const daysLeft = Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / 86_400_000);
    if (daysLeft < 0)   return { state: 'contractExpired',  tone: 'danger',  alert: true };
    if (daysLeft <= 30) return { state: 'contractExpiring', tone: 'warning', alert: true };
    return { state: 'underContract', tone: 'success', alert: false };
  }

  if (openOffer) return { state: 'offerSent', tone: 'warning', alert: true };

  if (lastVisitAt) {
    const since = Date.now() - new Date(lastVisitAt).getTime();
    if (since > YEAR_MS) return { state: 'dormant', tone: 'muted', alert: true };
    return { state: 'served', tone: 'info', alert: false };
  }

  if (nextVisitAt) return { state: 'scheduled', tone: 'info', alert: false };

  return { state: 'new', tone: 'neutral', alert: true };
}

/* ── Contract plans ──────────────────────────────────────────────────────── */

export interface PlanDef {
  value: string;
  months: number;
  /** What the office would normally sell with this plan. */
  defaultVisits: number;
}

export const CONTRACT_PLANS: PlanDef[] = [
  { value: 'annual',    months: 12, defaultVisits: 4 },
  { value: 'biannual',  months: 6,  defaultVisits: 2 },
  { value: 'quarterly', months: 3,  defaultVisits: 1 },
  { value: 'monthly',   months: 1,  defaultVisits: 1 },
];

export function planDef(value: string): PlanDef {
  return CONTRACT_PLANS.find(p => p.value === value) ?? CONTRACT_PLANS[0];
}

/** End date implied by a plan starting on `start`, as an ISO date. */
export function planEndDate(start: string, plan: string): string {
  if (!start) return '';
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + planDef(plan).months);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
