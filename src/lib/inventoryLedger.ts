/**
 * The stock ledger behind the inventory card.
 *
 * A part's quantity is the end of a story, not the whole of it: the card has to
 * say which branch holds it, when it was last filled and by whom, who it came
 * from, when the batch expires, and every movement in and out since. All of
 * that is one table — `inventory_transactions` — plus the per-branch view the
 * database derives from it.
 */

import { supabase } from './supabase';

export type MovementDirection = 'in' | 'out';

/** Why stock moved. The two 'opening'/'adjustment' rows are written by the DB. */
export const MOVEMENT_REASONS_IN = ['purchase', 'return', 'transfer', 'adjustment'] as const;
export const MOVEMENT_REASONS_OUT = ['issue', 'consumption', 'damage', 'transfer', 'adjustment'] as const;

export interface Branch {
  id: string;
  name: string;
  name_ar: string | null;
  kind: string;
  is_default: boolean;
  active: boolean;
}

export interface BranchStock {
  item_id: string;
  branch_id: string;
  branch_name: string;
  branch_name_ar: string | null;
  quantity: number;
  last_in_at: string | null;
  next_expiry: string | null;
}

export interface InventoryTransaction {
  id: string;
  item_id: string;
  branch_id: string;
  direction: MovementDirection;
  reason: string;
  quantity: number;
  unit_cost: number | null;
  counterparty: string | null;
  reference: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  note: string | null;
  performed_by: string | null;
  created_at: string;
  /** Joined for display — who keyed the movement in. */
  performer?: { full_name: string } | null;
  branch?: { name: string; name_ar: string | null } | null;
}

const TX_SELECT = `
  id, item_id, branch_id, direction, reason, quantity, unit_cost, counterparty,
  reference, batch_no, expiry_date, note, performed_by, created_at,
  performer:profiles!inventory_transactions_performed_by_fkey(full_name),
  branch:branches!inventory_transactions_branch_id_fkey(name, name_ar)
`;

/** Branch name in the reader's language, falling back to the other one. */
export function branchLabel(
  branch: { name: string; name_ar?: string | null } | null | undefined,
  isAr: boolean
): string {
  if (!branch) return '—';
  return (isAr ? branch.name_ar || branch.name : branch.name) || '—';
}

export async function fetchBranches(): Promise<Branch[]> {
  const { data } = await supabase
    .from('branches')
    .select('id, name, name_ar, kind, is_default, active')
    .eq('active', true)
    .order('is_default', { ascending: false })
    .order('name');
  return (data ?? []) as Branch[];
}

export async function fetchBranchStock(itemId: string): Promise<BranchStock[]> {
  const { data } = await supabase
    .from('inventory_branch_stock')
    .select('item_id, branch_id, branch_name, branch_name_ar, quantity, last_in_at, next_expiry')
    .eq('item_id', itemId);
  return (data ?? []) as BranchStock[];
}

export async function fetchItemLedger(itemId: string, limit = 100): Promise<InventoryTransaction[]> {
  const { data } = await supabase
    .from('inventory_transactions')
    .select(TX_SELECT)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(limit);

  /* PostgREST returns an embed as an array when it cannot prove it is unique. */
  return ((data ?? []) as unknown as (Omit<InventoryTransaction, 'performer' | 'branch'> & {
    performer: { full_name: string } | { full_name: string }[] | null;
    branch: { name: string; name_ar: string | null } | { name: string; name_ar: string | null }[] | null;
  })[]).map(row => ({
    ...row,
    performer: Array.isArray(row.performer) ? row.performer[0] ?? null : row.performer,
    branch: Array.isArray(row.branch) ? row.branch[0] ?? null : row.branch,
  }));
}

export interface MovementInput {
  itemId: string;
  branchId: string;
  direction: MovementDirection;
  reason: string;
  quantity: number;
  unitCost?: number | null;
  /** Supplier it came from, or the technician / customer it went to. */
  counterparty?: string;
  reference?: string;
  batchNo?: string;
  expiryDate?: string | null;
  note?: string;
  performedBy?: string | null;
}

/**
 * Books one movement. The database recomputes `inventory.quantity` from the
 * ledger afterwards, so the caller never writes the stock number itself.
 */
export async function recordMovement(input: MovementInput) {
  return supabase.from('inventory_transactions').insert({
    item_id: input.itemId,
    branch_id: input.branchId,
    direction: input.direction,
    reason: input.reason,
    quantity: input.quantity,
    unit_cost: input.unitCost ?? null,
    counterparty: input.counterparty?.trim() || '',
    reference: input.reference?.trim() || '',
    batch_no: input.batchNo?.trim() || '',
    expiry_date: input.expiryDate || null,
    note: input.note?.trim() || '',
    performed_by: input.performedBy ?? null,
  });
}

export interface LedgerSummary {
  totalIn: number;
  totalOut: number;
  /** The last time stock came in, with who booked it and where it came from. */
  lastIn: InventoryTransaction | null;
  lastOut: InventoryTransaction | null;
  /** Nearest expiry still ahead of us, across every batch received. */
  nextExpiry: string | null;
  expired: boolean;
}

export function summariseLedger(rows: InventoryTransaction[]): LedgerSummary {
  const today = new Date().toISOString().split('T')[0];
  let totalIn = 0;
  let totalOut = 0;
  let lastIn: InventoryTransaction | null = null;
  let lastOut: InventoryTransaction | null = null;
  let nextExpiry: string | null = null;
  let expired = false;

  rows.forEach(row => {
    if (row.direction === 'in') {
      totalIn += row.quantity;
      if (!lastIn || row.created_at > lastIn.created_at) lastIn = row;
      if (row.expiry_date) {
        if (row.expiry_date < today) expired = true;
        else if (!nextExpiry || row.expiry_date < nextExpiry) nextExpiry = row.expiry_date;
      }
    } else {
      totalOut += row.quantity;
      if (!lastOut || row.created_at > lastOut.created_at) lastOut = row;
    }
  });

  return { totalIn, totalOut, lastIn, lastOut, nextExpiry, expired };
}
