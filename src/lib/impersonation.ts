/**
 * Seeing the app as one of its users.
 *
 * The superadmin does not get a copy of someone's screen — they get their
 * access. `start_impersonation` parks the target on the admin's own profile row,
 * and from that moment every policy in the database resolves through
 * `acting_uid()` instead of `auth.uid()`, so the rows that come back are exactly
 * the rows that user would have received. Nothing here re-implements any of
 * that; it starts it, stops it, and asks what the state is.
 *
 * Two things are true for the whole session and worth remembering when reading
 * the screens: while impersonating, the superadmin genuinely loses their own
 * reach (`is_platform_admin()` answers false), and every write is refused unless
 * the session was started with changes allowed.
 */

import { supabase } from './supabase';

export interface ImpersonationState {
  targetId: string;
  targetName: string;
  targetRole: string;
  tenantId: string | null;
  tenantName: string | null;
  readOnly: boolean;
  expiresAt: string | null;
}

export interface DirectoryPerson {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
  tenant_id: string | null;
  permission_set_id: string | null;
  active: boolean;
  is_platform_admin: boolean;
  created_at: string;
}

export interface ImpersonationEntry {
  id: string;
  actor_name: string | null;
  target_name: string | null;
  tenant_name: string | null;
  read_only: boolean;
  reason: string | null;
  started_at: string;
  ended_at: string | null;
}

/** Everyone on the platform, with their email — superadmin only. */
export async function fetchDirectory(): Promise<DirectoryPerson[]> {
  const { data } = await supabase.rpc('platform_directory');
  return (data as DirectoryPerson[]) ?? [];
}

export async function fetchImpersonation(): Promise<ImpersonationState | null> {
  const { data } = await supabase.rpc('my_impersonation');
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) return null;
  return {
    targetId: row.target_id as string,
    targetName: (row.target_name as string) ?? '',
    targetRole: (row.target_role as string) ?? '',
    tenantId: (row.tenant_id as string) ?? null,
    tenantName: (row.tenant_name as string) ?? null,
    readOnly: Boolean(row.read_only),
    expiresAt: (row.expires_at as string) ?? null,
  };
}

export async function startImpersonation(
  targetId: string,
  allowChanges = false,
  reason = ''
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('start_impersonation', {
    target: targetId,
    allow_changes: allowChanges,
    reason,
  });
  return { error: error?.message ?? null };
}

export async function stopImpersonation(): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('stop_impersonation');
  return { error: error?.message ?? null };
}

export async function fetchImpersonationHistory(limit = 25): Promise<ImpersonationEntry[]> {
  const { data } = await supabase.rpc('impersonation_history', { limit_rows: limit });
  return (data as ImpersonationEntry[]) ?? [];
}

/** Minutes left, for the banner. Negative or zero means it has lapsed. */
export function minutesLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000);
}
