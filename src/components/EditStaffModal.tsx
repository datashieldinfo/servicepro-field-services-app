import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle, Ban, Check, KeyRound, Loader2, Save, Trash2, UserCheck, X,
} from 'lucide-react';
import { UserRole } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { generatePassword } from '../lib/customerService';
import {
  deleteStaff, resetStaffPassword, setStaffActive, updateStaff,
} from '../lib/staffAdmin';

interface SetOption { id: string; name: string; name_ar: string | null; base_role: string | null }

export interface StaffPerson {
  id: string;
  full_name: string;
  role: string;
  permission_set_id: string | null;
  active: boolean;
}

interface Props {
  person: StaffPerson;
  sets: SetOption[];
  onClose: () => void;
  onChanged: () => void;
}

/**
 * One person, everything an owner needs to do to them.
 *
 * Disable and delete sit at the bottom, apart from the fields, because they are
 * not edits — one stops somebody working today, the other removes them. Delete
 * refuses an account with visits or invoices against its name and says why:
 * that history would otherwise lose its author, and disabling is what was
 * actually meant in almost every such case.
 */
export default function EditStaffModal({ person, sets, onClose, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const { profile, isPlatformAdmin } = useAuth();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [fullName, setFullName] = useState(person.full_name ?? '');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>(person.role as UserRole);
  const [setId, setSetId] = useState(person.permission_set_id ?? '');
  const [active, setActive] = useState(person.active);
  const [busy, setBusy] = useState<null | 'save' | 'active' | 'password' | 'delete'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [blocked, setBlocked] = useState<{ visits: number; invoices: number; customer: number } | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const isSelf = person.id === profile?.id;

  /* Only roles at or below the caller's own — the function refuses the rest. */
  const rank: Record<string, number> = { owner: 4, manager: 3, admin: 2, technician: 1, customer: 0 };
  const mine = isPlatformAdmin ? 4 : rank[profile?.role ?? ''] ?? 0;
  const roles: UserRole[] = (['owner', 'manager', 'admin', 'technician'] as UserRole[])
    .filter(r => rank[r] <= mine);

  async function save() {
    setBusy('save');
    const res = await updateStaff(person.id, {
      full_name: fullName.trim(),
      phone: phone.trim() || undefined,
      role,
      permission_set_id: setId || null,
    });
    setBusy(null);
    if (!res.ok) { showToast(res.error ?? t('common.error'), 'error'); return; }
    showToast(t('staff.saved'), 'success');
    onChanged();
    onClose();
  }

  async function toggleActive() {
    setBusy('active');
    const res = await setStaffActive(person.id, !active);
    setBusy(null);
    if (!res.ok) { showToast(res.error ?? t('common.error'), 'error'); return; }
    setActive(!active);
    showToast(!active ? t('staff.enabled') : t('staff.disabled'), 'success');
    onChanged();
  }

  async function resetPassword() {
    const pw = newPassword.trim() || generatePassword(12);
    setBusy('password');
    const res = await resetStaffPassword(person.id, pw);
    setBusy(null);
    if (!res.ok) { showToast(res.error ?? t('common.error'), 'error'); return; }
    setNewPassword(pw);
    showToast(t('staff.passwordReset'), 'success');
  }

  async function remove() {
    setBusy('delete');
    const res = await deleteStaff(person.id);
    setBusy(null);
    if (res.error === 'has_history') { setBlocked(res.history ?? null); setConfirmDelete(false); return; }
    if (!res.ok) { showToast(res.error ?? t('common.error'), 'error'); return; }
    showToast(t('staff.deleted'), 'success');
    onChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 text-base truncate">{person.full_name || '—'}</h2>
            <p className="text-xs text-slate-500">
              {t(`roles.${person.role}`, person.role)}
              {!active && <span className="ms-2 text-amber-700 font-semibold">{t('staff.isDisabled')}</span>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('staff.name')}</label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-navy/40 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('staff.phone')}</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              dir="ltr"
              placeholder="077XXXXXXX"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-navy/40 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('staff.role')}</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as UserRole)}
                disabled={isSelf}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white disabled:opacity-60"
              >
                {roles.map(r => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
              </select>
              {isSelf && <p className="text-[11px] text-slate-400 mt-1">{t('staff.notOwnRole')}</p>}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('staff.set')}</label>
              <select
                value={setId}
                onChange={e => setSetId(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
              >
                <option value="">{t('access.noSet')}</option>
                {sets.map(s => <option key={s.id} value={s.id}>{isAr ? s.name_ar || s.name : s.name}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={save}
            disabled={busy !== null}
            className="w-full py-3 rounded-xl bg-navy hover:bg-navy/90 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition"
          >
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('common.save')}
          </button>

          {/* ── password ── */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-400" /> {t('staff.newPassword')}
            </p>
            <div className="flex gap-2">
              <input
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder={t('staff.autoPassword')}
                dir="ltr"
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-mono"
              />
              <button
                onClick={resetPassword}
                disabled={busy !== null}
                className="px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                {busy === 'password' ? <Loader2 className="w-4 h-4 animate-spin" /> : t('staff.reset')}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">{t('staff.resetHint')}</p>
          </div>

          {/* ── disable / delete: not edits, kept apart ── */}
          {!isSelf && (
            <div className="border-t border-slate-100 pt-4 space-y-2.5">
              <button
                onClick={toggleActive}
                disabled={busy !== null}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition disabled:opacity-60 ${
                  active
                    ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    : 'bg-green-50 text-green-700 hover:bg-green-100'
                }`}
              >
                {busy === 'active'
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : active ? <Ban className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                {active ? t('staff.disable') : t('staff.enable')}
              </button>
              <p className="text-[11px] text-slate-500">{t('staff.disableHint')}</p>

              {blocked ? (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {t('staff.cannotDelete')}
                  </p>
                  <p>{t('staff.cannotDeleteWhy', {
                    visits: blocked.visits, invoices: blocked.invoices,
                  })}</p>
                </div>
              ) : confirmDelete ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={remove}
                    disabled={busy !== null}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {t('staff.confirmDelete')}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="w-full py-2.5 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-sm font-semibold flex items-center justify-center gap-2 transition"
                >
                  <Trash2 className="w-4 h-4" /> {t('staff.delete')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
