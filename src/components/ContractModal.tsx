import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, FileText, Save, Minus, Plus, AlertTriangle, CalendarRange,
  Building2, UserRound, RefreshCw, Printer, HardDrive, Info,
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
import { USAGE_TYPES, USAGE_TONE, type UsageType } from '../lib/deviceFields';
import PrintableContract, { type ContractDocument } from './PrintableContract';

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
  contract_number?: string | null;
  filter_category?: UsageType | null;
  notes?: string | null;
  customers?: { name: string; customer_type?: string } | null;
}

interface CustomerOption {
  id: string;
  name: string;
  customer_type?: string;
}

interface DeviceOption {
  id: string;
  device_brand: string;
  device_model: string | null;
  serial_number: string | null;
  location_in_premises: string | null;
  installation_date: string | null;
  usage_type: UsageType;
}

interface Props {
  /** Omit to create a new contract. */
  contract?: ContractRecord;
  /** Open straight into the printable copy — the reprint action on a row. */
  autoPrint?: boolean;
  customers: CustomerOption[];
  /** Pre-selects the customer when opened from their row. */
  presetCustomerId?: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Offered only where a customer already has contract history — see below. */
const STATUSES = ['new', 'active', 'pending', 'expired', 'cancelled'];

/**
 * Create and edit a maintenance contract. The same form for individuals and
 * companies — a yearly plan with four visits is the house default, and the
 * number of visits can be raised when the contract is agreed.
 *
 * Two things the office asked for and the paperwork depends on:
 * · the contract states which of the customer's devices it covers and the
 *   filter class fitted to each, so nobody has to guess on site;
 * · a first contract for a brand-new customer is 'new' and the status list is
 *   not even shown — it only appears once that customer has history.
 *
 * `visits_used` is never typed: the database counts completed visits inside the
 * contract period, so "visits remaining" can be trusted.
 */
export default function ContractModal({
  contract,
  autoPrint = false,
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
  const [status, setStatus] = useState(contract?.status ?? 'new');
  const [filterCategory, setFilterCategory] = useState<UsageType>(contract?.filter_category ?? 'home');
  const [endTouched, setEndTouched] = useState(editing);
  const [categoryTouched, setCategoryTouched] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedInPeriod, setCompletedInPeriod] = useState<number | null>(null);

  /* Devices this customer owns, and which of them this contract covers. */
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [covered, setCovered] = useState<Record<string, UsageType>>({});

  /* Whether this customer has contract history — decides if a status is asked. */
  const [priorContracts, setPriorContracts] = useState<number | null>(null);

  const [printDoc, setPrintDoc] = useState<ContractDocument | null>(null);

  const selectedCustomer = customers.find(c => c.id === customerId);
  const corporate = selectedCustomer?.customer_type === 'corporate';
  /* A brand-new customer's first contract is simply 'new'. */
  const asksForStatus = editing || (priorContracts ?? 0) > 0;

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

  /* The customer's registered devices, and their contract history. */
  useEffect(() => {
    if (!customerId) { setDevices([]); setCovered({}); setPriorContracts(null); return; }

    let cancelled = false;
    setDevicesLoading(true);

    (async () => {
      const [devRes, countRes, linkRes] = await Promise.all([
        supabase
          .from('customer_devices')
          .select('id, device_brand, device_model, serial_number, location_in_premises, installation_date, usage_type')
          .eq('customer_id', customerId)
          .order('installation_date', { ascending: false }),
        supabase
          .from('contracts')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', customerId),
        contract
          ? supabase.from('contract_devices').select('device_id, filter_category').eq('contract_id', contract.id)
          : Promise.resolve({ data: [] as { device_id: string; filter_category: UsageType }[] }),
      ]);

      if (cancelled) return;

      const rows = (devRes.data ?? []) as DeviceOption[];
      setDevices(rows);

      const linked = (linkRes.data ?? []) as { device_id: string; filter_category: UsageType }[];
      if (editing) {
        setCovered(Object.fromEntries(linked.map(l => [l.device_id, l.filter_category ?? 'home'])));
      } else {
        /* A new contract covers everything the customer owns, at the class each
           device was registered with — unticking is quicker than ticking. */
        setCovered(Object.fromEntries(rows.map(d => [d.id, (d.usage_type ?? 'home') as UsageType])));
      }

      /* Editing: this contract itself is in the count, so it never counts. */
      setPriorContracts(Math.max(0, (countRes.count ?? 0) - (editing ? 1 : 0)));
      setDevicesLoading(false);
    })();

    return () => { cancelled = true; };
  }, [customerId, contract, editing]);

  /* No history means no question: the first contract is 'new'. */
  useEffect(() => {
    if (editing || priorContracts === null) return;
    setStatus(priorContracts > 0 ? 'active' : 'new');
  }, [priorContracts, editing]);

  /* The contract's own class follows the devices it covers, until overridden. */
  const coveredList = useMemo(() => Object.entries(covered), [covered]);
  useEffect(() => {
    if (categoryTouched || coveredList.length === 0) return;
    setFilterCategory(coveredList.some(([, cls]) => cls === 'industrial') ? 'industrial' : 'home');
  }, [coveredList, categoryTouched]);

  const used = completedInPeriod ?? contract?.visits_used ?? 0;
  const remaining = Math.max(0, visitsIncluded - used);

  const health = useMemo(
    () => contractHealth({ status, visits_included: visitsIncluded, visits_used: used, end_date: endDate }),
    [status, visitsIncluded, used, endDate]
  );

  function toggleDevice(device: DeviceOption) {
    setCovered(prev => {
      const next = { ...prev };
      if (next[device.id]) delete next[device.id];
      else next[device.id] = (device.usage_type ?? 'home') as UsageType;
      return next;
    });
  }

  function setDeviceClass(deviceId: string, cls: UsageType) {
    setCovered(prev => (prev[deviceId] ? { ...prev, [deviceId]: cls } : prev));
  }

  /** Everything the printed copy needs, gathered after the row is saved. */
  const buildDocument = useCallback(
    async (contractId: string, contractNumber: string): Promise<ContractDocument | null> => {
      const { data: cust } = await supabase
        .from('customers')
        .select('name, address, phone, email, customer_type, company_name, tax_number')
        .eq('id', customerId)
        .maybeSingle();

      const { data: links } = await supabase
        .from('contract_devices')
        .select('filter_category, customer_devices(device_brand, device_model, serial_number, location_in_premises, installation_date)')
        .eq('contract_id', contractId);

      type LinkRow = {
        filter_category: UsageType;
        customer_devices:
          | { device_brand: string; device_model: string | null; serial_number: string | null; location_in_premises: string | null; installation_date: string | null }
          | { device_brand: string; device_model: string | null; serial_number: string | null; location_in_premises: string | null; installation_date: string | null }[]
          | null;
      };

      const deviceLines = ((links ?? []) as LinkRow[]).flatMap(link => {
        const device = Array.isArray(link.customer_devices) ? link.customer_devices[0] : link.customer_devices;
        if (!device) return [];
        return [{
          device_brand: device.device_brand,
          device_model: device.device_model,
          serial_number: device.serial_number,
          location_in_premises: device.location_in_premises,
          installation_date: device.installation_date,
          filter_category: link.filter_category ?? 'home',
        }];
      });

      return {
        contractNumber,
        planType,
        filterCategory,
        visitsIncluded,
        priceJod,
        startDate,
        endDate,
        autoRenew,
        status,
        notes: contract?.notes ?? null,
        customer: {
          name: cust?.name ?? selectedCustomer?.name ?? '',
          address: cust?.address ?? null,
          phone: cust?.phone ?? null,
          email: cust?.email ?? null,
          customer_type: cust?.customer_type ?? null,
          company_name: cust?.company_name ?? null,
          tax_number: cust?.tax_number ?? null,
        },
        devices: deviceLines,
      };
    },
    [customerId, planType, filterCategory, visitsIncluded, priceJod, startDate, endDate, autoRenew, status, contract, selectedCustomer]
  );

  /* Opened from the print action on a row: go straight to the document. */
  useEffect(() => {
    if (!autoPrint || !contract) return;
    let cancelled = false;
    (async () => {
      const doc = await buildDocument(contract.id, contract.contract_number || '—');
      if (!cancelled && doc) setPrintDoc(doc);
    })();
    return () => { cancelled = true; };
  }, [autoPrint, contract, buildDocument]);

  /** Replaces the contract's device links with what is ticked in the form. */
  async function syncDevices(contractId: string) {
    await supabase.from('contract_devices').delete().eq('contract_id', contractId);
    const rows = Object.entries(covered).map(([device_id, filter_category]) => ({
      contract_id: contractId,
      device_id,
      filter_category,
    }));
    if (rows.length) await supabase.from('contract_devices').insert(rows);
  }

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
      filter_category: filterCategory,
    };

    let contractId = contract?.id ?? '';
    let contractNumber = contract?.contract_number ?? '';

    if (editing) {
      const { error: saveError } = await supabase.from('contracts').update(row).eq('id', contract!.id);
      if (saveError) { setSaving(false); showToast(saveError.message, 'error'); return; }
    } else {
      /* Same shape as invoices and offers: CT-YYYY-NNN, sequential per year. */
      const { data: numberData } = await supabase.rpc('next_contract_number');
      contractNumber = (numberData as string) ?? '';

      const { data: inserted, error: saveError } = await supabase
        .from('contracts')
        .insert({ ...row, contract_number: contractNumber || null })
        .select('id, contract_number')
        .single();

      if (saveError || !inserted) {
        setSaving(false);
        showToast(saveError?.message ?? t('common.error'), 'error');
        return;
      }
      contractId = inserted.id;
      contractNumber = inserted.contract_number ?? contractNumber;
    }

    await syncDevices(contractId);

    const doc = await buildDocument(contractId, contractNumber || '—');
    setSaving(false);

    showToast(editing ? t('contract.updated') : t('contract.created'), 'success');
    onSaved();
    /* The signed copy is the point of the exercise — go straight to it. */
    if (doc) setPrintDoc(doc);
    else onClose();
  }

  /** Reprint an existing contract without changing anything. */
  async function handleReprint() {
    if (!contract) return;
    setSaving(true);
    const doc = await buildDocument(contract.id, contract.contract_number || '—');
    setSaving(false);
    if (doc) setPrintDoc(doc);
  }

  const field = 'w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-navy outline-none';

  if (printDoc) {
    return <PrintableContract contract={printDoc} onClose={() => { setPrintDoc(null); onClose(); }} />;
  }

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
                {contract?.contract_number
                  ? `${contract.contract_number} · ${selectedCustomer?.name ?? ''}`
                  : selectedCustomer?.name ?? t('contract.subtitle')}
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

          {/* Filter class fitted under this contract */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('contract.filterCategory')}</label>
            <div className="grid grid-cols-2 gap-2">
              {USAGE_TYPES.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => { setFilterCategory(u); setCategoryTouched(true); }}
                  className={`px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition ${
                    filterCategory === u
                      ? 'border-navy bg-navy/5 text-navy'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {t(`device.usage_${u}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t('contract.filterCategoryHint')}</p>
          </div>

          {/* Devices this contract covers */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {t('contract.coveredDevices')}
            </label>

            {!customerId ? (
              <p className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl p-3">
                {t('contract.pickCustomerFirst')}
              </p>
            ) : devicesLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 p-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('common.loading')}
              </div>
            ) : devices.length === 0 ? (
              <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                {t('contract.noDevicesRegistered')}
              </p>
            ) : (
              <div className="space-y-2">
                {devices.map(d => {
                  const ticked = Boolean(covered[d.id]);
                  return (
                    <div
                      key={d.id}
                      className={`rounded-xl border p-3 transition ${
                        ticked ? 'border-navy/30 bg-navy/5' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ticked}
                          onChange={() => toggleDevice(d)}
                          className="w-4 h-4 mt-0.5 accent-navy shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                            <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            {d.device_brand}
                            {d.device_model && <span className="font-normal text-slate-500">· {d.device_model}</span>}
                          </span>
                          <span className="block text-[11px] text-slate-500 mt-0.5">
                            {d.serial_number ? `S/N ${d.serial_number}` : t('install.serialPlaceholder')}
                            {d.location_in_premises ? ` · ${d.location_in_premises}` : ''}
                          </span>
                        </span>
                      </label>

                      {ticked && (
                        <div className="flex items-center gap-1.5 mt-2 ps-7">
                          {USAGE_TYPES.map(u => (
                            <button
                              key={u}
                              type="button"
                              onClick={() => setDeviceClass(d.id, u)}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition ${
                                covered[d.id] === u ? USAGE_TONE[u] : 'border-slate-200 text-slate-500 hover:border-slate-300'
                              }`}
                            >
                              {t(`device.usage_${u}`)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-400">{t('contract.coveredDevicesHint')}</p>
              </div>
            )}
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
              {asksForStatus ? (
                <select value={status} onChange={e => setStatus(e.target.value)} className={field}>
                  {STATUSES.map(s => <option key={s} value={s}>{t(`contract.status_${s}`)}</option>)}
                </select>
              ) : (
                <div className="border border-slate-200 bg-slate-50 rounded-xl px-4 py-2.5">
                  <p className="text-sm font-semibold text-slate-700">{t('contract.status_new')}</p>
                  <p className="text-[11px] text-slate-400">{t('contract.statusNewHint')}</p>
                </div>
              )}
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
            {editing ? (
              <button
                type="button"
                onClick={handleReprint}
                disabled={saving}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                {t('contract.print')}
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                {t('common.cancel')}
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-navy hover:bg-navy/90 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {editing ? t('common.save') : t('contract.createAndPrint')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
