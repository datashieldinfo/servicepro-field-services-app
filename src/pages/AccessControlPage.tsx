import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  Building2, Check, Eye, KeyRound, Loader2, Lock, Minus, Pencil, Plus, RotateCcw, Save,
  ShieldCheck, UserCog, X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import AddStaffModal from '../components/AddStaffModal';
import EditStaffModal, { type StaffPerson } from '../components/EditStaffModal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import { MODULE_ACTIONS, type ModuleAction } from '../lib/permissions';

interface ModuleRow { key: string; label_en: string; label_ar: string; core: boolean; sort: number }
interface SetRow {
  id: string; name: string; name_ar: string | null; description: string | null;
  is_system: boolean; base_role: string | null; own_records_only: boolean;
}
interface SetModuleRow {
  set_id: string; module_key: string;
  can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean;
}
interface PersonRow {
  id: string; full_name: string; role: string; permission_set_id: string | null; active: boolean;
}
interface OverrideRow {
  profile_id: string; module_key: string;
  can_view: boolean | null; can_create: boolean | null;
  can_edit: boolean | null; can_delete: boolean | null;
}
interface TenantOption { id: string; name: string; name_ar: string | null }

const FIELD: Record<ModuleAction, keyof Omit<SetModuleRow, 'set_id' | 'module_key'>> = {
  view: 'can_view', create: 'can_create', edit: 'can_edit', delete: 'can_delete',
};

/**
 * Who in a company may open what.
 *
 * Two halves, in the order the office thinks about them: the permission sets —
 * "what a technician may do" — and then the people, each on a set, with the
 * option of one exception for one person.
 *
 * Everything here only narrows what the platform already sold that tenant; a
 * module their plan does not include cannot be ticked back on from this screen.
 *
 * An owner sees their own company and has no choice to make. A superadmin picks
 * the company first — `?tenant=<id>`, which is where the platform screen links
 * to — because their access spans all of them and an unscoped list would be
 * every company's people in one pile.
 */
export default function AccessControlPage() {
  const { t, i18n } = useTranslation();
  const { can, tenant, isPlatformAdmin, viewAs } = useAuth();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [params, setParams] = useSearchParams();
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [tenantModules, setTenantModules] = useState<Set<string>>(new Set());
  const [sets, setSets] = useState<SetRow[]>([]);
  const [rights, setRights] = useState<SetModuleRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [activeSet, setActiveSet] = useState<string | null>(null);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StaffPerson | null>(null);

  const editable = can('team', 'edit');

  /* The company being edited: the picker's for a superadmin, your own otherwise. */
  const chosen = params.get('tenant');
  const scopeId = isPlatformAdmin ? (chosen ?? tenants[0]?.id ?? null) : tenant?.id ?? null;

  /* A superadmin needs the list of companies before anything else can load. */
  useEffect(() => {
    if (!isPlatformAdmin) return;
    supabase.from('tenants').select('id, name, name_ar').order('created_at')
      .then(({ data }) => setTenants((data ?? []) as TenantOption[]));
  }, [isPlatformAdmin]);

  const load = useCallback(async () => {
    if (!scopeId) { setLoading(false); return; }
    setLoading(true);

    /* Sets first: their ids scope the rights, and the people scope the
       exceptions. RLS would already do this for an owner — it is a superadmin,
       who legitimately sees every tenant, that needs the query itself scoped. */
    const [modRes, tenantModRes, setRes, peopleRes] = await Promise.all([
      supabase.from('modules').select('key, label_en, label_ar, core, sort').order('sort'),
      supabase.from('tenant_modules').select('module_key, enabled').eq('tenant_id', scopeId),
      supabase.from('permission_sets')
        .select('id, name, name_ar, description, is_system, base_role, own_records_only')
        .eq('tenant_id', scopeId).order('name'),
      supabase.from('profiles')
        .select('id, full_name, role, permission_set_id, active')
        .eq('tenant_id', scopeId).order('full_name'),
    ]);

    const setRows = (setRes.data ?? []) as SetRow[];
    const peopleRows = ((peopleRes.data ?? []) as PersonRow[]).filter(p => p.role !== 'customer');

    const [rightRes, overrideRes] = await Promise.all([
      setRows.length
        ? supabase.from('permission_set_modules').select('*').in('set_id', setRows.map(s => s.id))
        : Promise.resolve({ data: [] }),
      peopleRows.length
        ? supabase.from('profile_module_overrides').select('*').in('profile_id', peopleRows.map(p => p.id))
        : Promise.resolve({ data: [] }),
    ]);

    setModules((modRes.data ?? []) as ModuleRow[]);
    setTenantModules(new Set(
      ((tenantModRes.data ?? []) as { module_key: string; enabled: boolean }[])
        .filter(r => r.enabled).map(r => r.module_key)
    ));
    setSets(setRows);
    setPeople(peopleRows);
    setRights((rightRes.data ?? []) as SetModuleRow[]);
    setOverrides((overrideRes.data ?? []) as OverrideRow[]);
    setActiveSet(current =>
      current && setRows.some(s => s.id === current) ? current : setRows[0]?.id ?? null);
    setLoading(false);
  }, [scopeId]);

  useEffect(() => { load(); }, [load]);

  const rightFor = useCallback(
    (setId: string, moduleKey: string) =>
      rights.find(r => r.set_id === setId && r.module_key === moduleKey),
    [rights]
  );

  async function toggleRight(setId: string, moduleKey: string, action: ModuleAction) {
    if (!editable) return;
    const current = rightFor(setId, moduleKey);
    const field = FIELD[action];
    const next = !(current?.[field] ?? false);

    const row = {
      set_id: setId,
      module_key: moduleKey,
      can_view: current?.can_view ?? false,
      can_create: current?.can_create ?? false,
      can_edit: current?.can_edit ?? false,
      can_delete: current?.can_delete ?? false,
      [field]: next,
    };
    /* Nothing can be done to a module you cannot see. */
    if (field !== 'can_view' && next) row.can_view = true;
    if (field === 'can_view' && !next) { row.can_create = false; row.can_edit = false; row.can_delete = false; }

    const { error } = await supabase.from('permission_set_modules').upsert(row);
    if (error) { showToast(error.message, 'error'); return; }

    setRights(prev => {
      const rest = prev.filter(r => !(r.set_id === setId && r.module_key === moduleKey));
      return [...rest, row as SetModuleRow];
    });
  }

  async function assignSet(personId: string, setId: string) {
    const { error } = await supabase.from('profiles').update({ permission_set_id: setId }).eq('id', personId);
    if (error) { showToast(error.message, 'error'); return; }
    setPeople(prev => prev.map(p => (p.id === personId ? { ...p, permission_set_id: setId } : p)));
    showToast(t('access.assigned'), 'success');
  }

  /** One person, one module: yes, no, or "follow the set". */
  async function setOverride(personId: string, moduleKey: string, action: ModuleAction, value: boolean | null) {
    const existing = overrides.find(o => o.profile_id === personId && o.module_key === moduleKey);
    const row: OverrideRow = {
      profile_id: personId,
      module_key: moduleKey,
      can_view: existing?.can_view ?? null,
      can_create: existing?.can_create ?? null,
      can_edit: existing?.can_edit ?? null,
      can_delete: existing?.can_delete ?? null,
    };
    row[FIELD[action] as keyof OverrideRow] = value as never;

    const empty = row.can_view === null && row.can_create === null && row.can_edit === null && row.can_delete === null;

    const { error } = empty
      ? await supabase.from('profile_module_overrides').delete()
          .eq('profile_id', personId).eq('module_key', moduleKey)
      : await supabase.from('profile_module_overrides').upsert(row);

    if (error) { showToast(error.message, 'error'); return; }

    setOverrides(prev => {
      const rest = prev.filter(o => !(o.profile_id === personId && o.module_key === moduleKey));
      return empty ? rest : [...rest, row];
    });
  }

  /** Look at the app as this person sees it — read-only, and logged. */
  async function view(personId: string) {
    const error = await viewAs(personId, false, 'From the access screen');
    if (error) { showToast(error, 'error'); return; }
    showToast(t('impersonate.started'), 'success');
  }

  async function createSet(e: React.FormEvent) {
    e.preventDefault();
    if (!newSetName.trim() || !scopeId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from('permission_sets')
      .insert({ tenant_id: scopeId, name: newSetName.trim(), is_system: false })
      .select('id')
      .single();
    setSaving(false);
    if (error || !data) { showToast(error?.message ?? t('common.error'), 'error'); return; }
    setNewSetName('');
    showToast(t('access.setCreated'), 'success');
    load();
    setActiveSet(data.id);
  }

  const visibleModules = useMemo(
    () => modules.filter(m => tenantModules.has(m.key)),
    [modules, tenantModules]
  );

  if (!can('team')) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <p className="max-w-md mx-auto mt-20 text-center text-sm text-slate-500">{t('access.notAllowed')}</p>
      </div>
    );
  }

  const current = sets.find(s => s.id === activeSet) ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-navy" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900">{t('access.title')}</h1>
              <p className="text-xs text-slate-500">
                {tenant ? (isAr ? tenant.name_ar || tenant.name : tenant.name) : t('access.subtitle')}
              </p>
            </div>
          </div>

          {/* Whose company's access is on screen. Only a superadmin has a choice. */}
          {isPlatformAdmin && (
            <label className="flex items-center gap-2 text-xs text-slate-500">
              <Building2 className="w-3.5 h-3.5" />
              <select
                value={scopeId ?? ''}
                onChange={e => setParams({ tenant: e.target.value })}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white font-semibold text-slate-700"
              >
                {tenants.map(row => (
                  <option key={row.id} value={row.id}>{isAr ? row.name_ar || row.name : row.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-100 py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : (
          <>
            {/* ── permission sets ── */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <p className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-slate-400" /> {t('access.sets')}
                </p>
                {editable && (
                  <form onSubmit={createSet} className="flex items-center gap-2">
                    <input
                      value={newSetName}
                      onChange={e => setNewSetName(e.target.value)}
                      placeholder={t('access.newSetName')}
                      className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs w-40"
                    />
                    <button
                      type="submit"
                      disabled={saving || !newSetName.trim()}
                      className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                    >
                      <Plus className="w-3 h-3" /> {t('access.addSet')}
                    </button>
                  </form>
                )}
              </div>

              <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2">
                {sets.map(set => (
                  <button
                    key={set.id}
                    onClick={() => setActiveSet(set.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                      activeSet === set.id
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {isAr ? set.name_ar || set.name : set.name}
                    {set.is_system && <Lock className="w-2.5 h-2.5 inline ms-1.5 opacity-60" />}
                  </button>
                ))}
              </div>

              {current && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-start px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          {t('access.module')}
                        </th>
                        {MODULE_ACTIONS.map(action => (
                          <th key={action} className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 w-20">
                            {t(`access.action_${action}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleModules.map(mod => {
                        const right = rightFor(current.id, mod.key);
                        return (
                          <tr key={mod.key}>
                            <td className="px-5 py-2.5 font-medium text-slate-800">
                              {isAr ? mod.label_ar : mod.label_en}
                            </td>
                            {MODULE_ACTIONS.map(action => {
                              const on = Boolean(right?.[FIELD[action]]);
                              return (
                                <td key={action} className="px-3 py-2.5 text-center">
                                  <button
                                    onClick={() => toggleRight(current.id, mod.key, action)}
                                    disabled={!editable}
                                    className={`w-7 h-7 rounded-lg border flex items-center justify-center mx-auto transition ${
                                      on
                                        ? 'bg-green-50 border-green-300 text-green-700'
                                        : 'bg-white border-slate-200 text-slate-300'
                                    } ${editable ? 'hover:border-navy' : 'cursor-not-allowed opacity-70'}`}
                                  >
                                    {on ? <Check className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {current.own_records_only && (
                    <p className="px-5 py-3 text-[11px] text-amber-800 bg-amber-50 border-t border-amber-100">
                      {t('access.ownRecordsOnly')}
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* ── people ── */}
            <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <p className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <UserCog className="w-4 h-4 text-slate-400" /> {t('access.people')}
                </p>
                {editable && scopeId && (
                  <button
                    onClick={() => setAdding(true)}
                    className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                  >
                    <Plus className="w-3 h-3" /> {t('staff.add')}
                  </button>
                )}
              </div>

              <div className="divide-y divide-slate-100">
                {people.map(person => {
                  const mine = overrides.filter(o => o.profile_id === person.id);
                  const open = openPerson === person.id;
                  return (
                    <div key={person.id}>
                      <div className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 text-sm">{person.full_name || '—'}</p>
                          <p className="text-[11px] text-slate-500">
                            {t(`roles.${person.role}`, person.role)}
                            {!person.active && (
                              <span className="ms-2 text-amber-700 font-semibold">
                                {t('staff.isDisabled')}
                              </span>
                            )}
                            {mine.length > 0 && (
                              <span className="ms-2 text-amber-700 font-semibold">
                                {t('access.overrideCount', { count: mine.length })}
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={person.permission_set_id ?? ''}
                            onChange={e => assignSet(person.id, e.target.value)}
                            disabled={!editable}
                            className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white disabled:opacity-60"
                          >
                            <option value="">{t('access.noSet')}</option>
                            {sets.map(s => (
                              <option key={s.id} value={s.id}>{isAr ? s.name_ar || s.name : s.name}</option>
                            ))}
                          </select>
                          {editable && (
                            <button
                              onClick={() => setEditing(person)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-navy/5 text-navy hover:bg-navy/10 transition"
                            >
                              <Pencil className="w-3.5 h-3.5" /> {t('staff.manage')}
                            </button>
                          )}
                          <button
                            onClick={() => setOpenPerson(open ? null : person.id)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-navy/10 text-slate-600 hover:text-navy transition"
                          >
                            {open ? t('common.close') : t('access.exceptions')}
                          </button>
                          {/* Reading the matrix tells you what they may open;
                              this shows you what they actually get. */}
                          {isPlatformAdmin && (
                            <button
                              onClick={() => view(person.id)}
                              title={t('impersonate.viewAs')}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 transition"
                            >
                              <Eye className="w-3.5 h-3.5" /> {t('impersonate.viewAs')}
                            </button>
                          )}
                        </div>
                      </div>

                      {open && (
                        <div className="bg-slate-50/60 px-5 pb-4 overflow-x-auto">
                          <p className="text-[11px] text-slate-500 py-2">{t('access.exceptionsHint')}</p>
                          <table className="w-full text-sm min-w-[560px]">
                            <tbody className="divide-y divide-slate-200">
                              {visibleModules.map(mod => {
                                const ovr = mine.find(o => o.module_key === mod.key);
                                return (
                                  <tr key={mod.key}>
                                    <td className="py-2 pe-3 text-slate-700 text-xs">
                                      {isAr ? mod.label_ar : mod.label_en}
                                    </td>
                                    {MODULE_ACTIONS.map(action => {
                                      const value = ovr?.[FIELD[action] as keyof OverrideRow] as boolean | null | undefined;
                                      return (
                                        <td key={action} className="py-2 px-1 text-center">
                                          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                                            {[true, null, false].map((option, index) => (
                                              <button
                                                key={index}
                                                onClick={() => setOverride(person.id, mod.key, action, option)}
                                                disabled={!editable}
                                                title={t(`access.override_${option === null ? 'inherit' : option ? 'allow' : 'deny'}`)}
                                                className={`w-7 h-6 text-[10px] font-bold transition ${
                                                  (value ?? null) === option
                                                    ? option === true ? 'bg-green-100 text-green-700'
                                                      : option === false ? 'bg-red-100 text-red-700'
                                                      : 'bg-slate-200 text-slate-600'
                                                    : 'bg-white text-slate-300 hover:text-slate-500'
                                                }`}
                                              >
                                                {option === true ? <Check className="w-3 h-3 mx-auto" />
                                                  : option === false ? <X className="w-3 h-3 mx-auto" />
                                                  : <RotateCcw className="w-3 h-3 mx-auto" />}
                                              </button>
                                            ))}
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {!editable && (
              <p className="text-[11px] text-slate-400 flex items-center gap-1.5 px-1">
                <Lock className="w-3 h-3" /> {t('access.readOnly')}
              </p>
            )}
            <p className="text-[11px] text-slate-400 flex items-start gap-1.5 px-1">
              <Save className="w-3 h-3 mt-0.5 shrink-0" /> {t('access.savedImmediately')}
            </p>
          </>
        )}
      </main>

      {adding && scopeId && (
        <AddStaffModal
          tenantId={scopeId}
          onClose={() => setAdding(false)}
          onCreated={load}
        />
      )}

      {editing && (
        <EditStaffModal
          person={editing}
          sets={sets}
          onClose={() => setEditing(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
