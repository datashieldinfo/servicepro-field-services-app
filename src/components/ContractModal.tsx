import { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, FileText, Save, Minus, Plus, AlertTriangle, CalendarRange,
  Building2, UserRound, RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import {
  CONTRACT_PLANS,
  contractHealth,
  planDef,
  planEndDate,
} from '../lib/statusMeta';

export interface ContractRecord {
  id: string;
  customer_id: string;
  plan_type: string;
  visits_included: number;
  visits_used: number;
  price_jod: number;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  status: string;
  customers?: { name: string; customer_type?: string } | null;
}

interface CustomerOption {
  id: string;
  name: string;
  customer_type?: string;
}

interface Props {
  /** Omit to create a new contract. */
  contract?: ContractRecord;
  customers: CustomerOption[];
  /** Pre-selects the customer when opened from their row. */
  presetCustomerId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const STATUSES = ['active', 'pending', 'expired', 'cancelled'];

/**
 * Create and edit a maintenance contract. The same form for individuals and
 * companies — a yearly plan with four visits is the house default, and the
 * number of visits can be raised when the contract is agreed.
 *
 * `visits_used` is never typed: the database counts completed visits inside the
 * contract period, so "visits remaining" can be trusted.
 */
export default function ContractModal({
  contract,
  customers,
  presetCustomerId,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const editing = Boolean(contract);

  const [customerId, setCustomerId] = useState(contract?.customer_id ?? presetCustomerId ?? '');
  const [planType, setPlanType] = useState(contract?.plan_type ?? 'annual');
  const [visitsIncluded, setVisitsIncluded] = useState(contract?.visits_included ?? 4);
  const [priceJod, setPriceJod] = useState(contract?.price_jod ?? 0);
  const [startDate, setStartDate] = useState(
    contract?.start_date ?? new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(
    contract?.end_date ?? planEndDate(new Date().toISOString().split('T')[0], 'annual')
  );
  const [autoRenew, setAutoRenew] = useState(contract?.auto_renew ?? true);
  const [status, setStatus] = useState(contract?.status ?? 'active');
  const [endTouched, setEndTouched] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedInPeriod, setCompletedInPeriod] = useState<number | null>(null);

  const selectedCustomer = customers.find(c => c.id === customerId);
  const corporate = selectedCustomer?.customer_type === 'corporate';

  /* The end date follows the plan until the office overrides it by hand. */
  useEffect(() => {
    if (endTouched) return;
    setEndDate(planEndDate(startDate, planType));
  }, [startDate, planType, endTouched]);

  /* Changing the plan proposes that plan's usual number of visits. */
  useEffect(() => {
    if (editing) return;
    setVisitsIncluded(planDef(planType).defaultVisits);
  }, [planType, editing]);

  /* Show how many visits already fall inside the period being edited. */
  useEffect(() => {
    if (!customerId || !startDate || !endDate) { setCompletedInPeriod(null); return; }
    const timer = setTimeout(async () => {
      const { count } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customerId)
        .eq('status', 'completed')
        .gte('scheduled_at', `${startDate}T00:00:00`)
        .lte('scheduled_at', `${endDate}T23:59:59`);
      setCompletedInPeriod(count ?? 0);
    }, 350);
    return () => clearTimeout(timer);
  }, [customerId, startDate, endDate]);

  const used = completedInPeriod ?? contract?.visits_used ?? 0;
  const remaining = Math.max(0, visitsIncluded - used);

  const health = useMemo(
    () => contractHealth({ status, visits_included: visitsIncluded, visits_used: used, end_date: endDate }),
    [status, visitsIncluded, used, endDate]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!customerId) { setError(t('contract.errCustomer')); return; }
    if (!startDate || !endDate) { setError(t('contract.errDates')); return; }
    if (new Date(endDate) <= new Date(startDate)) { setError(t('contract.errOrder')); return; }
    if (visitsIncluded < 1) { setError(t('contract.errVisits')); return; }

    setSaving(true);
    const row = {
      customer_id: customerId,
      plan_type: planType,
      visits_included: visitsIncluded,
      price_jod: priceJod,
      start_date: startDate,
      end_date: endDate,
      auto_renew: autoRenew,
      status,
    };

    const { error: saveError } = editing
      ? await supabase.from('contracts').update(row).eq('id', contract!.id)
      : await supabase.from('contracts').insert(row);

    setSaving(false);

    if (saveError) { showToast(saveError.message, 'error'); return; }

    showToast(editing ? t('contract.updated') : t('contract.created'), 'success');
    onSaved();
    onClose();
  }

  const field = 'w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-navy outline-none';

  return (
    <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-navy/10 rounded-xl flex items-center justify-center">
              <FileText className="w-5 h-5 text-navy" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">
                {editing ? t('contract.editTitle') : t('contract.newTitle')}
              </h2>
              <p className="text-xs text-slate-500">
                {selectedCustomer?.name ?? t('contract.subtitle')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">

          {/* Customer */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {t('contract.customer')} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              {corporate
                ? <Building2 className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                : <UserRound className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />}
              <select
                value={customerId}
                onChange={e => { setCustomerId(e.target.value); setError(null); }}
                disabled={editing}
                className={`${field} ps-10 disabled:bg-slate-50 disabled:text-slate-500`}
              >
                <option value="">{t('contract.pickCustomer')}</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t('contract.sameForBoth')}</p>
          </div>

          {/* Plan */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('contract.plan')}</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CONTRACT_PLANS.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => { setPlanType(p.value); setEndTouched(false); }}
                  className={`px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition ${
                    planType === p.value
                      ? 'border-navy bg-navy/5 text-navy'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {t(`contract.plan_${p.value}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Visits included — the number that gets counted down */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{t('contract.visitsIncluded')}</p>
                <p className="text-[11px] text-slate-500">{t('contract.visitsHint')}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setVisitsIncluded(v => Math.max(1, v - 1))}
                  className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition"
                  aria-label={t('contract.fewerVisits')}
                >
                  <Minus className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={visitsIncluded}
                  onChange={e => setVisitsIncluded(Math.max(1, Number(e.target.value)))}
                  className="w-16 text-center border border-slate-200 rounded-lg px-2 py-2 text-sm font-bold text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setVisitsIncluded(v => v + 1)}
                  className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition"
                  aria-label={t('contract.moreVisits')}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-slate-900">{visitsIncluded}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{t('contract.included')}</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-center">
                <p className="text-lg font-bold text-slate-900">{used}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{t('contract.used')}</p>
              </div>
              <div className={`border rounded-lg px-3 py-2 text-center ${
                remaining <= 1 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'
              }`}>
                <p className={`text-lg font-bold ${remaining <= 1 ? 'text-amber-700' : 'text-slate-900'}`}>{remaining}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{t('contract.remaining')}</p>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 flex items-start gap-1.5">
              <RefreshCw className="w-3 h-3 mt-0.5 shrink-0" />
              {t('contract.countedAutomatically')}
            </p>
          </div>

          {/* Period */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('contract.startDate')}</label>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setError(null); }}
                className={field}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {t('contract.endDate')}
                {!endTouched && <span className="text-[11px] font-normal text-slate-400 ms-1.5">{t('contract.auto')}</span>}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setEndTouched(true); setError(null); }}
                className={field}
              />
            </div>
          </div>

          {/* Price + status */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('contract.price')}</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceJod}
                onChange={e => setPriceJod(Math.max(0, Number(e.target.value)))}
                className={field}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('common.status')}</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className={field}>
                {STATUSES.map(s => <option key={s} value={s}>{t(`contract.status_${s}`)}</option>)}
              </select>
            </div>
          </div>

          {/* Auto renew */}
          <label className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition ${
            autoRenew ? 'border-navy/30 bg-navy/5' : 'border-slate-200 bg-slate-50/60'
          }`}>
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={e => setAutoRenew(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-navy"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <CalendarRange className="w-4 h-4 text-slate-400" />
                {t('contract.autoRenew')}
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">{t('contract.autoRenewHint')}</span>
            </span>
          </label>

          {/* Live warning while editing */}
          {health.alert && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900">{t(`contract.state_${health.state}`)}</p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}

          <div className="flex gap-3">
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
              className="flex-1 py-3 rounded-xl bg-navy hover:bg-navy/90 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editing ? t('common.save') : t('contract.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
