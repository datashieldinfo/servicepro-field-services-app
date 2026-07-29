import { useState } from 'react';
import { KeyRound, Loader2, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import Logo from './Logo';

const MIN_LENGTH = 8;

/**
 * Blocks every dashboard until an account created by someone else — an office
 * invite, a technician set up by an admin — has chosen its own password. The
 * one-time login link is therefore never a lasting credential.
 */
export default function ChangePasswordGate() {
  const { t } = useTranslation();
  const { profile, refreshProfile } = useAuth();
  const { showToast } = useToast();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password.length < MIN_LENGTH) {
      setError(t('firstLogin.errTooShort', { count: MIN_LENGTH }));
      return;
    }
    if (password !== confirm) {
      setError(t('firstLogin.errMismatch'));
      return;
    }

    setSaving(true);
    const { error: authError } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });

    if (authError) {
      setError(authError.message);
      setSaving(false);
      return;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ must_change_password: false })
      .eq('id', profile?.id ?? '');

    setSaving(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    showToast(t('firstLogin.done'), 'success');
    await refreshProfile();
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo compact />
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
            <KeyRound className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">{t('firstLogin.title')}</h1>
            <p className="text-sm text-slate-500 mt-1">{t('firstLogin.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('firstLogin.newPassword')}</label>
            <div className="relative">
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(null); }}
                autoComplete="new-password"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 pe-11 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                dir="ltr"
              />
              <button
                type="button"
                onClick={() => setShow(v => !v)}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t('firstLogin.rule', { count: MIN_LENGTH })}</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('firstLogin.confirmPassword')}</label>
            <input
              type={show ? 'text' : 'password'}
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(null); }}
              autoComplete="new-password"
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              dir="ltr"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {t('firstLogin.save')}
          </button>
        </form>
      </div>
    </div>
  );
}
