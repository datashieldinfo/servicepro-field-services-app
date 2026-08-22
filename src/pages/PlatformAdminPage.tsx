import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Check, Eye, History, KeyRound, Loader2, Plus, Save, ShieldCheck,
  ToggleLeft, ToggleRight, Users, X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import { fmtDate, fmtDateTime } from '../lib/format';
import {
  fetchDirectory, fetchImpersonationHistory,
  type DirectoryPerson, type ImpersonationEntry,
} from '../lib/impersonation';
import { createTenantOwner, defaultOwnerCredentials } from '../lib/tenantOwner';
import { shareOnWhatsApp } from '../lib/format';

interface TenantRow {
  id: string;
  name: string;
  name_ar: string | null;
  slug: string;
  status: string;
  plan: string;
  contact_email: string | null;
  contact_phone: string | null;
  created_at: string;
}

interface ModuleRow { key: string; label_en: string; label_ar: string; core: boolean; sort: number }

const STATUSES = ['trial', 'active', 'suspended', 'closed'];

/**
 * The platform's own screen: the companies on this deployment, and which parts
 * of the app each of them has.
 *
 * Only a platform admin reaches it — the tenant owners below manage their own
 * people, but not what their company bought.
 */
export default function PlatformAdminPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { isPlatformAdmin, viewAs } = useAuth();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [enabled, setEnabled] = useState<Record<string, Set<string>>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [directory, setDirectory] = useState<DirectoryPerson[]>([]);
  const [history, setHistory] = useState<ImpersonationEntry[]>([]);
  const [openPeople, setOpenPeople] = useState<string | null>(null);
  const [allowChanges, setAllowChanges] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', name_ar: '', slug: '', contact_email: '', contact_phone: '' });
  /* Typed by hand only if the derived defaults are not wanted. */
  const [ownerLogin, setOwnerLogin] = useState({ email: '', password: '', touched: false });
  /* Shown once, after the company exists — this is the hand-over. */
  const [handover, setHandover] = useState<
    { company: string; email: string; password: string; link?: string } | null
  >(null);

  /* The defaults follow the slug until someone types over them. */
  const derived = defaultOwnerCredentials(form.slug, form.contact_email);
  const ownerEmail = ownerLogin.touched ? ownerLogin.email : derived.email;
  const ownerPassword = ownerLogin.touched ? ownerLogin.password : derived.password;

  const load = useCallback(async () => {
    setLoading(true);
    const [tenantRes, moduleRes, linkRes, people, log] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at'),
      supabase.from('modules').select('key, label_en, label_ar, core, sort').order('sort'),
      supabase.from('tenant_modules').select('tenant_id, module_key, enabled'),
      /* Through a function, because the email lives in auth.users and is not
         readable from the client any other way. */
      fetchDirectory(),
      fetchImpersonationHistory(25),
    ]);

    setTenants((tenantRes.data ?? []) as TenantRow[]);
    setModules((moduleRes.data ?? []) as ModuleRow[]);
    setDirectory(people);
    setHistory(log);

    const map: Record<string, Set<string>> = {};
    ((linkRes.data ?? []) as { tenant_id: string; module_key: string; enabled: boolean }[])
      .forEach(row => {
        if (!map[row.tenant_id]) map[row.tenant_id] = new Set();
        if (row.enabled) map[row.tenant_id].add(row.module_key);
      });
    setEnabled(map);

    const tally: Record<string, number> = {};
    people.forEach(row => {
      if (row.tenant_id) tally[row.tenant_id] = (tally[row.tenant_id] ?? 0) + 1;
    });
    setCounts(tally);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleModule(tenantId: string, moduleKey: string, on: boolean) {
    const { error } = await supabase
      .from('tenant_modules')
      .upsert({ tenant_id: tenantId, module_key: moduleKey, enabled: on });
    if (error) { showToast(error.message, 'error'); return; }

    setEnabled(prev => {
      const next = { ...prev, [tenantId]: new Set(prev[tenantId] ?? []) };
      if (on) next[tenantId].add(moduleKey); else next[tenantId].delete(moduleKey);
      return next;
    });
  }

  async function setStatus(tenant: TenantRow, status: string) {
    const { error } = await supabase.from('tenants').update({ status }).eq('id', tenant.id);
    if (error) { showToast(error.message, 'error'); return; }
    setTenants(prev => prev.map(row => (row.id === tenant.id ? { ...row, status } : row)));
    showToast(t('platform.statusChanged', { name: tenant.name }), 'success');
  }

  /**
   * Move somebody into a company — or into a different one.
   *
   * The permission set goes with them: a set belongs to one company, so keeping
   * the old one would leave them pointing at a set their new colleagues cannot
   * see. They land on the standard set for their role, which the owner can then
   * change on the access screen.
   */
  async function moveToCompany(person: DirectoryPerson, target: string) {
    const { data: set } = await supabase
      .from('permission_sets')
      .select('id')
      .eq('tenant_id', target)
      .eq('base_role', person.role)
      .eq('is_system', true)
      .maybeSingle();

    const { error } = await supabase
      .from('profiles')
      .update({ tenant_id: target, permission_set_id: set?.id ?? null })
      .eq('id', person.id);

    if (error) { showToast(error.message, 'error'); return; }

    showToast(t('platform.moved', {
      name: person.full_name || '—',
      company: tenants.find(x => x.id === target)?.name ?? '',
    }), 'success');
    load();
  }

  /**
   * Open the app as this person — with their access, their company and nothing
   * else. Root then routes to whichever dashboard their role belongs to.
   */
  async function view(person: DirectoryPerson) {
    const error = await viewAs(person.id, allowChanges, 'From the platform screen');
    if (error) { showToast(error, 'error'); return; }
    showToast(t('impersonate.started'), 'success');
    navigate('/');
  }

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.slug.trim()) { showToast(t('platform.errName'), 'warning'); return; }

    setSaving(true);
    const { data, error } = await supabase
      .from('tenants')
      .insert({
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        slug: form.slug.trim().toLowerCase().replace(/\s+/g, '-'),
        contact_email: form.contact_email.trim(),
        contact_phone: form.contact_phone.trim(),
        status: 'trial',
      })
      .select('id')
      .single();

    if (error || !data) { setSaving(false); showToast(error?.message ?? t('common.error'), 'error'); return; }

    /* A new company starts with every module and the five standard sets, so its
       owner has something to work with on day one. */
    await supabase.from('tenant_modules').insert(
      modules.map(m => ({ tenant_id: data.id, module_key: m.key, enabled: true }))
    );
    await supabase.rpc('seed_tenant_defaults', { target: data.id });

    /* And the account that can actually open it. Without this the company
       exists and nobody can sign in to it. */
    const owner = await createTenantOwner(
      data.id,
      form.name.trim(),
      { email: ownerEmail, password: ownerPassword },
      form.contact_phone.trim()
    );

    setSaving(false);

    if (!owner.ok) {
      /* The company is real; only its login failed. Say so precisely — the
         alternative is a silent company nobody can enter. */
      showToast(t('platform.ownerFailed', { error: owner.error ?? '' }), 'error');
      load();
      return;
    }

    setCreating(false);
    setHandover({
      company: form.name.trim(),
      email: owner.email ?? ownerEmail,
      password: owner.password ?? ownerPassword,
      link: owner.loginLink,
    });
    setForm({ name: '', name_ar: '', slug: '', contact_email: '', contact_phone: '' });
    setOwnerLogin({ email: '', password: '', touched: false });
    showToast(t('platform.created'), 'success');
    load();
  }

  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <p className="max-w-md mx-auto mt-20 text-center text-sm text-slate-500">
          {t('platform.notAllowed')}
        </p>
      </div>
    );
  }

  const statusTone: Record<string, string> = {
    active: 'bg-green-50 text-green-700 border-green-200',
    trial: 'bg-blue-50 text-blue-700 border-blue-200',
    suspended: 'bg-amber-50 text-amber-800 border-amber-200',
    closed: 'bg-slate-100 text-slate-500 border-slate-200',
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-navy/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-navy" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900">{t('platform.title')}</h1>
              <p className="text-xs text-slate-500">{t('platform.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => setCreating(v => !v)}
            className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" /> {t('platform.newTenant')}
          </button>
        </div>

        {creating && (
          <form onSubmit={createTenant} className="bg-white rounded-2xl border border-navy/20 shadow-sm p-5 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: f.slug || e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                placeholder={t('platform.nameEn')}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
              <input
                value={form.name_ar}
                onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
                placeholder={t('platform.nameAr')}
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
              <input
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder={t('platform.slug')}
                dir="ltr"
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono"
              />
              <input
                value={form.contact_phone}
                onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                placeholder={t('admin.phone')}
                dir="ltr"
                className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            {/* The company's first login, created with it. Editable, because a
                company with a real mailbox should use it. */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <KeyRound className="w-3 h-3" /> {t('platform.ownerLogin')}
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  value={ownerEmail}
                  onChange={e => setOwnerLogin({ email: e.target.value, password: ownerPassword, touched: true })}
                  placeholder={t('platform.ownerEmail')}
                  dir="ltr"
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                />
                <input
                  value={ownerPassword}
                  onChange={e => setOwnerLogin({ email: ownerEmail, password: e.target.value, touched: true })}
                  placeholder={t('platform.ownerPassword')}
                  dir="ltr"
                  className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500">{t('platform.ownerHint')}</p>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={() => setCreating(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-navy text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('platform.createTenant')}
              </button>
            </div>
          </form>
        )}

        {/* Shown once, right after the company is created: the credentials to
            hand over. They are not readable again — the password is hashed the
            moment it is set. */}
        {handover && (
          <section className="bg-white rounded-2xl border-2 border-green-200 shadow-sm p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <p className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <Check className="w-4 h-4 text-green-600" />
                {t('platform.handoverTitle', { name: handover.company })}
              </p>
              <button onClick={() => setHandover(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('platform.ownerEmail')}</p>
                <p className="text-sm font-mono text-slate-900 break-all" dir="ltr">{handover.email}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('platform.ownerPassword')}</p>
                <p className="text-sm font-mono text-slate-900 break-all" dir="ltr">{handover.password}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/login\n${handover.email}\n${handover.password}`
                  );
                  showToast(t('platform.copied'), 'success');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-navy/5 text-navy hover:bg-navy/10 transition"
              >
                <Save className="w-3.5 h-3.5" /> {t('platform.copyLogin')}
              </button>
              <button
                onClick={() => shareOnWhatsApp(
                  `${handover.company}\n${window.location.origin}/login\n${handover.email}\n${handover.password}`
                )}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition"
              >
                {t('platform.sendLogin')}
              </button>
            </div>

            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {t('platform.handoverWarning')}
            </p>
          </section>
        )}

        {/* Anyone belonging to no company at all. They see an empty app until
            they are adopted, so they are shown first rather than buried. */}
        {!loading && directory.some(p => !p.tenant_id) && (
          <section className="bg-white rounded-2xl shadow-sm border-2 border-amber-200 overflow-hidden">
            <p className="px-5 py-3.5 border-b border-amber-100 bg-amber-50 font-bold text-amber-900 text-sm">
              {t('platform.orphans')}
            </p>
            <div className="divide-y divide-slate-100">
              {directory.filter(p => !p.tenant_id).map(person => (
                <div key={person.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{person.full_name || '—'}</p>
                    <p className="text-[11px] text-slate-500">
                      {t(`roles.${person.role}`, person.role)}
                      {person.email && <span dir="ltr"> · {person.email}</span>}
                    </p>
                  </div>
                  <select
                    defaultValue=""
                    onChange={e => e.target.value && moveToCompany(person, e.target.value)}
                    className="border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-amber-900 font-semibold"
                  >
                    <option value="">{t('platform.moveTo')}</option>
                    {tenants.map(row => (
                      <option key={row.id} value={row.id}>{isAr ? row.name_ar || row.name : row.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-100 py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
          </div>
        ) : tenants.map(tenant => (
          <section key={tenant.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-slate-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 text-sm truncate">
                    {isAr ? tenant.name_ar || tenant.name : tenant.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    <span dir="ltr">{tenant.slug}</span> · {t('platform.since')} {fmtDate(tenant.created_at)}
                    {' · '}
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3 h-3" />{counts[tenant.id] ?? 0}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {STATUSES.map(status => (
                  <button
                    key={status}
                    onClick={() => setStatus(tenant, status)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition ${
                      tenant.status === status ? statusTone[status] : 'border-slate-200 text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {t(`platform.status_${status}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">{t('platform.modules')}</p>
              <div className="flex flex-wrap gap-2">
                {modules.map(mod => {
                  const on = enabled[tenant.id]?.has(mod.key) ?? false;
                  return (
                    <button
                      key={mod.key}
                      onClick={() => toggleModule(tenant.id, mod.key, !on)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                        on ? 'bg-navy/5 border-navy/30 text-navy' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {on ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      {isAr ? mod.label_ar : mod.label_en}
                      {mod.core && <span className="text-[9px] opacity-60">{t('platform.core')}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-3 flex items-start gap-1.5">
                <Check className="w-3 h-3 mt-0.5 shrink-0" />
                {t('platform.moduleHint')}
              </p>

              {/* The two things to do with a company once it exists: set who
                  inside it may open what, and check that it worked. */}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 flex-wrap">
                <button
                  onClick={() => navigate(`/access?tenant=${tenant.id}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-navy/5 text-navy hover:bg-navy/10 transition"
                >
                  <KeyRound className="w-3.5 h-3.5" /> {t('platform.manageAccess')}
                </button>
                <button
                  onClick={() => setOpenPeople(openPeople === tenant.id ? null : tenant.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                >
                  <Users className="w-3.5 h-3.5" />
                  {openPeople === tenant.id ? t('common.close') : t('platform.people')}
                </button>
              </div>

              {openPeople === tenant.id && (
                <div className="mt-3 rounded-xl border border-slate-100 overflow-hidden">
                  <div className="divide-y divide-slate-100">
                    {directory.filter(p => p.tenant_id === tenant.id).map(person => (
                      <div key={person.id} className="px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {person.full_name || '—'}
                            {!person.active && (
                              <span className="ms-2 text-[10px] font-bold text-slate-400">
                                {t('platform.inactive')}
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {t(`roles.${person.role}`, person.role)}
                            {person.email && <span dir="ltr"> · {person.email}</span>}
                          </p>
                        </div>
                        {person.is_platform_admin ? (
                          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" /> {t('platform.platformAdmin')}
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Moving somebody between companies is a superadmin's
                                job — nobody inside a company can see another one. */}
                            <select
                              value={person.tenant_id ?? ''}
                              onChange={e => moveToCompany(person, e.target.value)}
                              title={t('platform.moveTo')}
                              className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-600"
                            >
                              {tenants.map(row => (
                                <option key={row.id} value={row.id}>
                                  {isAr ? row.name_ar || row.name : row.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => view(person)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 hover:bg-amber-100 transition"
                            >
                              <Eye className="w-3.5 h-3.5" /> {t('impersonate.viewAs')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {directory.filter(p => p.tenant_id === tenant.id).length === 0 && (
                      <p className="px-4 py-6 text-center text-xs text-slate-400">{t('common.noData')}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        ))}

        {/* How a "view as" session behaves, and every one that has happened. */}
        {!loading && tenants.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
              <p className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <History className="w-4 h-4 text-slate-400" /> {t('impersonate.log')}
              </p>
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowChanges}
                  onChange={e => setAllowChanges(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                {t('impersonate.allowChanges')}
              </label>
            </div>

            <p className="px-5 py-2.5 text-[11px] text-slate-500 bg-slate-50 border-b border-slate-100">
              {allowChanges ? t('impersonate.allowChangesOn') : t('impersonate.allowChangesOff')}
            </p>

            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
              {history.map(entry => (
                <div key={entry.id} className="px-5 py-2.5 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-slate-700 min-w-0">
                    <span className="font-semibold">{entry.actor_name || '—'}</span>
                    {' → '}
                    <span className="font-semibold">{entry.target_name || '—'}</span>
                    {entry.tenant_name && <span className="text-slate-400"> · {entry.tenant_name}</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded font-bold ${
                      entry.read_only ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {entry.read_only ? t('impersonate.readOnly') : t('impersonate.canChange')}
                    </span>
                    <span dir="ltr">{fmtDateTime(entry.started_at)}</span>
                    {!entry.ended_at && (
                      <span className="text-green-700 font-bold">{t('impersonate.open')}</span>
                    )}
                  </p>
                </div>
              ))}
              {history.length === 0 && (
                <p className="px-5 py-8 text-center text-xs text-slate-400">{t('impersonate.noneYet')}</p>
              )}
            </div>
          </section>
        )}

        {!loading && tenants.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 py-12 text-center text-sm text-slate-400">
            <X className="w-5 h-5 mx-auto mb-2 text-slate-300" />
            {t('common.noData')}
          </div>
        )}
      </main>
    </div>
  );
}
