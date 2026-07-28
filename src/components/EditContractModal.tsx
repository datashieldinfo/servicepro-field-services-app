import { useState } from 'react';
import { X, Loader2, FileText, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

export interface EditableContract {
  id: string;
  plan_type: string;
  visits_included: number;
  visits_used: number;
  price_jod: number;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  status: string;
}

interface Props {
  contract: EditableContract;
  onClose: () => void;
  onUpdated: () => void;
}

const PLAN_TYPES = ['monthly', 'quarterly', 'biannual', 'annual'];
const STATUSES = ['active', 'expired', 'cancelled', 'pending'];

export default function EditContractModal({ contract, onClose, onUpdated }: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [planType, setPlanType] = useState(contract.plan_type);
  const [visitsIncluded, setVisitsIncluded] = useState(contract.visits_included);
  const [visitsUsed, setVisitsUsed] = useState(contract.visits_used);
  const [priceJod, setPriceJod] = useState(contract.price_jod);
  const [startDate, setStartDate] = useState(contract.start_date);
  const [endDate, setEndDate] = useState(contract.end_date);
  const [autoRenew, setAutoRenew] = useState(contract.auto_renew);
  const [status, setStatus] = useState(contract.status);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('contracts').update({
      plan_type: planType,
      visits_included: visitsIncluded,
      visits_used: visitsUsed,
      price_jod: priceJod,
      start_date: startDate,
      end_date: endDate,
      auto_renew: autoRenew,
      status,
    }).eq('id', contract.id);
    setSaving(false);

    if (error) {
      showToast(error.message || t('toast.error'), 'error');
      return;
    }
    showToast(isAr ? 'تم تحديث العقد بنجاح' : 'Contract updated successfully', 'success');
    onUpdated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="font-bold text-slate-900 text-base">{isAr ? 'تعديل العقد' : 'Edit Contract'}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('manager.planType')}</label>
              <select value={planType} onChange={e => setPlanType(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm capitalize bg-white">
                {PLAN_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('common.status')}</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm capitalize bg-white">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'الزيارات المتضمنة' : 'Visits Included'}</label>
              <input type="number" min={0} value={visitsIncluded} onChange={e => setVisitsIncluded(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'الزيارات المستخدمة' : 'Visits Used'}</label>
              <input type="number" min={0} value={visitsUsed} onChange={e => setVisitsUsed(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('admin.dateFrom')}</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('admin.dateTo')}</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('invoice.amount')} ({t('invoice.jod')})</label>
            <input type="number" min={0} step="0.01" value={priceJod} onChange={e => setPriceJod(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={autoRenew} onChange={e => setAutoRenew(e.target.checked)} className="rounded" />
            {t('manager.autoRenew')}
          </label>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
