import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check, Copy, KeyRound, Loader2, Mail, Phone, ShieldCheck, UserPlus, X,
} from 'lucide-react';
import { supabase, UserRole } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { generatePassword } from '../lib/customerService';
import { shareOnWhatsApp } from '../lib/format';

interface Props {
  onClose: () => void;
  onCreated: () => void;
  /** Which company the person joins. A superadmin picks it; everyone else's own. */
  tenantId?: string | null;
}

interface SetOption { id: string; name: string; name_ar: string | null; base_role: string | null }

/**
 * Adding somebody to a company.
 *
 * This replaces the technician-only form, because a company needs office staff
 * as well as field staff, and because the two things that actually matter were
 * missing from it: which company the account belongs to, and which permission
 * set it starts on. Without the first the new account signs in to an empty app;
 * without the second it can open nothing.
 *
 * What a person may create is limited by what they are — an office admin cannot
 * mint an owner, which would be a promotion rather than a hire. The database
 * enforces the same rule; this only hides what would be refused.
 */
export default function AddStaffModal({ onClose, onCreated, tenantId }: Props) {
  const { t, i18n } = useTranslation();
  const { profile, isPlatformAdmin, tenant } = useAuth();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const company = tenantId ?? tenant?.id ?? profile?.tenant_id ?? null;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('technician');
  const [setId, setSetId] = useState('');
  const [password, setPassword] = useState(() => generatePassword(12));
  const [sets, setSets] = useState<SetOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ email: string; password: string; link?: string } | null>(null);

  /* Only roles this account is allowed to create. */
  const allowed: UserRole[] = isPlatformAdmin
    ? ['owner', 'manager', 'admin', 'technician']
    : profile?.role === 'owner'
      ? ['owner', 'manager', 'admin', 'technician']
      : ['technician'];

  const load = useCallback(async () => {
    if (!company) return;
    const { data } = await supabase
      .from('permission_sets')
      .select('id, name, name_ar, base_role')
      .eq('tenant_id', company)
      .order('name');
    setSets((data ?? []) as SetOption[]);
  }, [company]);

  useEffect(() => { load(); }, [load]);

  /* Follow the role until someone chooses a set by hand. */
  useEffect(() => {
    const match = sets.find(s => s.base_role === role);
    if (match) setSetId(current => (current && sets.some(s => s.id === current && s.base_role !== role) ? current : match.id));
  }, [role, sets]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) { showToast(t('toast.warning'), 'warning'); return; }
    if (!company) { showToast(t('staff.noCompany'), 'error'); return; }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          type: role,
          tenant_id: company,
          permission_set_id: setId || undefined,
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim(),
          must_change_password: true,
        }),
      });

      const json = await res.json();
      setSaving(false);
      if (!res.ok || json.error) { showToast(json.error ?? t('toast.error'), 'error'); return; }

      setDone({ email: email.trim(), password, link: json.login_link ?? undefined });
      showToast(t('staff.created'), 'success');
      onCreated();
    } catch (err) {
      setSaving(false);
      showToast(String(err), 'error');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-navy/10 rounded-xl flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-navy" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">{t('staff.title')}</h2>
              <p className="text-xs text-slate-500">
                {tenant ? (isAr ? tenant.name_ar || tenant.name : tenant.name) : t('staff.subtitle')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {done ? (
          /* Shown once — the password is hashed the moment it is set. */
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-green-700">
              <Check className="w-5 h-5" />
              <p className="font-semibold text-sm">{t('staff.created')}</p>
            </div>

            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              <div className="px-3.5 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('staff.email')}</p>
                <p className="text-sm font-mono text-slate-900 break-all" dir="ltr">{done.email}</p>
              </div>
              <div className="px-3.5 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{t('staff.password')}</p>
                <p className="text-sm font-mono text-slate-900 break-all" dir="ltr">{done.password}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/login\n${done.email}\n${done.password}`);
                  showToast(t('staff.copied'), 'success');
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-navy/5 text-navy hover:bg-navy/10 transition"
              >
                <Copy className="w-3.5 h-3.5" /> {t('staff.copy')}
              </button>
              <button
                onClick={() => shareOnWhatsApp(`${window.location.origin}/login\n${done.email}\n${done.password}`)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition"
              >
                {t('staff.send')}
              </button>
            </div>

            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {t('staff.mustChange')}
            </p>

            <button onClick={onClose} className="w-full py-3 rounded-xl bg-navy text-white text-sm font-semibold">
              {t('common.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {t('staff.name')} <span className="text-red-500">*</span>
              </label>
              <input
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-navy/40 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {t('staff.email')} <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} required dir="ltr"
                  className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-navy/40 outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('staff.phone')}</label>
              <div className="relative">
                <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="tel" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" placeholder="077XXXXXXX"
                  className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-navy/40 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('staff.role')}</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as UserRole)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                >
                  {allowed.map(r => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('staff.set')}</label>
                <select
                  value={setId}
                  onChange={e => setSetId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                >
                  {sets.map(s => (
                    <option key={s.id} value={s.id}>{isAr ? s.name_ar || s.name : s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('staff.password')}</label>
              <div className="relative">
                <KeyRound className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={password} onChange={e => setPassword(e.target.value)} required minLength={6} dir="ltr"
                  className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-navy/40 outline-none"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">{t('staff.passwordHint')}</p>
            </div>

            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" />
              {t('staff.explain')}
            </p>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-navy hover:bg-navy/90 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                {t('staff.create')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
