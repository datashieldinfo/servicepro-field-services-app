/**
 * What the signed-in user may open, and what they may do there.
 *
 * The database is the authority — every policy is written against the same
 * three layers (what the company bought, what their permission set allows, what
 * was ticked for them personally), and `my_permissions()` returns the answer
 * already resolved. Nothing here re-implements that logic; it caches the answer
 * so a screen can hide a button without asking the server again.
 *
 * Hiding a button is courtesy, not security: a hidden action is still refused
 * by the database if it is attempted.
 */

import { supabase } from './supabase';

export type ModuleKey =
  | 'customers' | 'visits' | 'contracts' | 'devices' | 'inventory' | 'invoices'
  | 'quotations' | 'requests' | 'reports' | 'team' | 'settings' | 'lookup';

export type ModuleAction = 'view' | 'create' | 'edit' | 'delete';

export interface ModuleAccess {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export type PermissionMap = Partial<Record<ModuleKey, ModuleAccess>>;

export const NO_ACCESS: ModuleAccess = {
  can_view: false, can_create: false, can_edit: false, can_delete: false,
};

/** Order and labels are the database's; this is only for screens that list them. */
export const MODULE_KEYS: ModuleKey[] = [
  'customers', 'visits', 'contracts', 'devices', 'inventory', 'invoices',
  'quotations', 'requests', 'reports', 'team', 'settings', 'lookup',
];

export const MODULE_ACTIONS: ModuleAction[] = ['view', 'create', 'edit', 'delete'];

export interface TenantSummary {
  id: string;
  name: string;
  name_ar: string | null;
  slug: string;
  status: string;
  plan: string;
}

const ACTION_FIELD: Record<ModuleAction, keyof ModuleAccess> = {
  view: 'can_view', create: 'can_create', edit: 'can_edit', delete: 'can_delete',
};

/** The resolved answer for every module, in one round trip. */
export async function fetchMyPermissions(): Promise<PermissionMap> {
  const { data, error } = await supabase.rpc('my_permissions');
  if (error || !data) return {};

  const map: PermissionMap = {};
  (data as ({ module_key: ModuleKey } & ModuleAccess)[]).forEach(row => {
    map[row.module_key] = {
      can_view: row.can_view,
      can_create: row.can_create,
      can_edit: row.can_edit,
      can_delete: row.can_delete,
    };
  });
  return map;
}

export async function fetchMyTenant(tenantId?: string | null): Promise<TenantSummary | null> {
  if (!tenantId) return null;
  const { data } = await supabase
    .from('tenants')
    .select('id, name, name_ar, slug, status, plan')
    .eq('id', tenantId)
    .maybeSingle();
  return (data as TenantSummary) ?? null;
}

/** Whether one action on one module is allowed, from an already-loaded map. */
export function allows(map: PermissionMap, module: ModuleKey, action: ModuleAction = 'view'): boolean {
  return Boolean(map[module]?.[ACTION_FIELD[action]]);
}

/** The modules a user can open at all — what a navigation bar should show. */
export function visibleModules(map: PermissionMap): ModuleKey[] {
  return MODULE_KEYS.filter(key => allows(map, key, 'view'));
}
