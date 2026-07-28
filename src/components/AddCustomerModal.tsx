import { useState } from 'react';
import { X, Loader2, User, CheckCircle, Building2, Upload, Copy, Check, CalendarPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from './Toast';
import CustomerFields from './CustomerFields';
import ScheduleVisitModal from './ScheduleVisitModal';
import {
  customerDisplayName,
  emptyCustomerForm,
  validateCustomer,
  type CustomerForm,
} from '../lib/customerFields';
import { createCustomer } from '../lib/customerService';

interface Props {
  onClose: () => void;
  onCreated: () => void;
  /** Optional — renders the "import instead" shortcut in the header. */
  onOpenImport?: () => void;
}

export default function AddCustomerModal({ onClose, onCreated, onOpenImport }: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [form, setForm]     = useState<CustomerForm>(emptyCustomerForm());
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState<{ tempPassword?: string; hasLogin: boolean; customerId?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const corporate = form.customer_type === 'corporate';

  function patch(changes: Partial<CustomerForm>) {
    setForm(prev => ({ ...prev, ...changes }));
    // Switching record type clears stale errors from the other layout.
    if (changes.customer_type) setErrors({});
    else setErrors(prev => {
      const next = { ...prev };
      (Object.keys(changes) as (keyof CustomerForm)[]).forEach(k => delete next[k]);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const found = validateCustomer(form);
    if (found.length) {
      const map: Partial<Record<keyof CustomerForm, string>> = {};
      found.forEach(({ field, key }) => { map[field] = t(`customerForm.${key}`); });
      setErrors(map);
      showToast(t('customerForm.fixErrors'), 'warning');
      return;
    }

    setSaving(true);
    const result = await createCustomer(form, 'manual', isAr);

    if (!result.ok) {
      showToast(result.error ?? t('toast.error'), 'error');
      setSaving(false);
      return;
    }

    setDone({ tempPassword: result.tempPassword, hasLogin: result.hasLogin, customerId: result.customerId });
    showToast(t('customerForm.created'), 'success');
    onCreated();
  }

  async function copyPassword() {
    if (!done?.tempPassword) return;
    try {
      await navigator.clipboard.writeText(done.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t('toast.error'), 'error');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              {corporate ? <Building2 className="w-5 h-5 text-blue-600" /> : <User className="w-5 h-5 text-blue-600" />}
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">{t('customerForm.title')}</h2>
              <p className="text-xs text-slate-500">{t('customerForm.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenImport && !done && (
              <button
                type="button"
                onClick={onOpenImport}
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition"
              >
                <Upload className="w-3.5 h-3.5" />
                {t('customerForm.importInstead')}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 gap-4 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="font-semibold text-slate-900 text-lg">{t('customerForm.createdTitle')}</p>

            {done.hasLogin && done.tempPassword ? (
              <div className="w-full max-w-sm bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-start">
                <p className="text-xs font-semibold text-amber-900">{t('customerForm.tempPasswordTitle')}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800" dir="ltr">
                    {done.tempPassword}
                  </code>
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="p-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition"
                    title={t('customerForm.copy')}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-amber-800">{t('customerForm.tempPasswordHint')}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500 max-w-sm">{t('customerForm.noLoginCreated')}</p>
            )}

            {done.customerId && (
              <div className="w-full max-w-sm border-t border-slate-100 pt-4 space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t('customerForm.whatNext')}</p>
                <button
                  type="button"
                  onClick={() => setScheduling(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-orange-200 bg-orange-50 hover:border-orange-400 transition text-start"
                >
                  <CalendarPlus className="w-5 h-5 text-orange-600 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold text-orange-900">{t('customerForm.scheduleInstallation')}</span>
                    <span className="block text-[11px] text-orange-700">{t('customerForm.scheduleInstallationDesc')}</span>
                  </span>
                </button>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setForm(emptyCustomerForm()); setDone(null); setSaving(false); }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                {t('customerForm.addAnother')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-5">

            <CustomerFields form={form} errors={errors} onChange={patch} showEmailHint />

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">{t('customerForm.whatHappens')}</p>
              <p>✓ {t('customerForm.whatHappensRecord')}</p>
              {form.email.trim() ? (
                <>
                  <p>✓ {t('customerForm.whatHappensLogin')}</p>
                  <p>✓ {t('customerForm.whatHappensPassword')}</p>
                </>
              ) : (
                <p>✓ {t('customerForm.whatHappensNoLogin')}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                {t('customerForm.create')}
              </button>
            </div>
          </form>
        )}
      </div>

      {scheduling && done?.customerId && (
        <ScheduleVisitModal
          presetCustomerId={done.customerId}
          presetCustomerName={customerDisplayName(form)}
          presetVisitType="installation"
          onClose={() => setScheduling(false)}
          onSaved={() => { setScheduling(false); onCreated(); onClose(); }}
        />
      )}
    </div>
  );
}
