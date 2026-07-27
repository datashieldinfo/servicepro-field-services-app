import { useState } from 'react';
import { X, Loader2, Droplets, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

export interface EditableFilterStatus {
  id: string;
  location: string;
  filter_type: string;
  health_percent: number;
  last_replaced: string | null;
  next_due: string | null;
}

interface Props {
  filter: EditableFilterStatus;
  onClose: () => void;
  onUpdated: () => void;
}

export default function EditFilterStatusModal({ filter, onClose, onUpdated }: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [location, setLocation] = useState(filter.location ?? '');
  const [filterType, setFilterType] = useState(filter.filter_type ?? '');
  const [healthPercent, setHealthPercent] = useState(filter.health_percent ?? 100);
  const [lastReplaced, setLastReplaced] = useState(filter.last_replaced ?? '');
  const [nextDue, setNextDue] = useState(filter.next_due ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('filter_status').update({
      location: location.trim(),
      filter_type: filterType.trim(),
      health_percent: Math.max(0, Math.min(100, healthPercent)),
      last_replaced: lastReplaced || null,
      next_due: nextDue || null,
    }).eq('id', filter.id);
    setSaving(false);

    if (error) {
      showToast(error.message || t('toast.error'), 'error');
      return;
    }
    showToast(isAr ? 'تم تحديث حالة الفلتر بنجاح' : 'Filter status updated successfully', 'success');
    onUpdated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Droplets className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="font-bold text-slate-900 text-base">{isAr ? 'تعديل حالة الفلتر' : 'Edit Filter Status'}</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'الموقع' : 'Location'}</label>
            <input value={location} onChange={e => setLocation(e.target.value)} required className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'نوع الفلتر' : 'Filter Type'}</label>
            <input value={filterType} onChange={e => setFilterType(e.target.value)} required className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'نسبة الكفاءة (%)' : 'Health (%)'}</label>
            <input type="number" min={0} max={100} value={healthPercent} onChange={e => setHealthPercent(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'آخر استبدال' : 'Last Replaced'}</label>
              <input type="date" value={lastReplaced} onChange={e => setLastReplaced(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customer.nextDue')}</label>
              <input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

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
