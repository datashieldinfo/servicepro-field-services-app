import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2, Check, Loader2, Plus, Save, ShieldCheck, ToggleLeft, ToggleRight, Users, X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import { fmtDate } from '../lib/format';

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
  const { isPlatformAdmin } = useAuth();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [enabled, setEnabled] = useState<Record<string, Set<string>>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', name_ar: '', slug: '', contact_email: '', contact_phone: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [tenantRes, moduleRes, linkRes, peopleRes] = await Promise.all([
      supabase.from('tenants').select('*').order('created_at'),
      supabase.from('modules').select('key, label_en, label_ar, core, sort').order('sort'),
      supabase.from('tenant_modules').select('tenant_id, module_key, enabled'),
      supabase.from('profiles').select('tenant_id'),
    ]);

    setTenants((tenantRes.data ?? []) as TenantRow[]);
    setModules((moduleRes.data ?? []) as ModuleRow[]);

    const map: Record<string, Set<string>> = {};
    ((linkRes.data ?? []) as { tenant_id: string; module_key: string; enabled: boolean }[])
      .forEach(row => {
        if (!map[row.tenant_id]) map[row.tenant_id] = new Set();
        if (row.enabled) map[row.tenant_id].add(row.module_key);
      });
    setEnabled(map);

    const people: Record<string, number> = {};
    ((peopleRes.data ?? []) as { tenant_id: string | null }[]).forEach(row => {
      if (row.tenant_id) people[row.tenant_id] = (people[row.tenant_id] ?? 0) + 1;
    });
    setCounts(people);
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

    setSaving(false);
    setCreating(false);
    setForm({ name: '', name_ar: '', slug: '', contact_email: '', contact_phone: '' });
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
            </div>
          </section>
        ))}

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
