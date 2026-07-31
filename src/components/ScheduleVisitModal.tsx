import { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Calendar, Search, Cpu, AlertTriangle, CheckCircle2,
  MapPin, FileText, Wrench, Building2, UserRound, PhoneCall,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { useAuth } from '../contexts/AuthContext';
import CustomerSummary from './CustomerSummary';
import {
  CONFIRMATION_CHANNELS,
  VISIT_TYPES,
  emptyVisitForm,
  toAppointmentRow,
  validateVisit,
  visitTypeDef,
  type ConfirmationChannel,
  type VisitForm,
  type VisitType,
} from '../lib/visitFields';

interface CustomerOption {
  id: string;
  name: string;
  address: string;
  phone: string;
  customer_type?: string;
}

interface DeviceOption {
  id: string;
  device_brand: string;
  device_model: string | null;
  serial_number: string | null;
  location_in_premises: string | null;
  warranty_expires: string | null;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
  /** Pre-selects the customer and hides the picker. */
  presetCustomerId?: string;
  presetCustomerName?: string;
  presetVisitType?: VisitType;
  presetDate?: string;
  presetNotes?: string;
  /** When scheduling straight off a service request, it is marked scheduled. */
  serviceRequestId?: string | null;
}

/**
 * The one place a visit gets booked — office, manager, and the
 * "what's next?" step right after a customer is created.
 */
export default function ScheduleVisitModal({
  onClose,
  onSaved,
  presetCustomerId,
  presetCustomerName,
  presetVisitType,
  presetDate,
  presetNotes,
  serviceRequestId = null,
}: Props) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [form, setForm] = useState<VisitForm>(() => emptyVisitForm({
    customer_id: presetCustomerId ?? '',
    visit_type: presetVisitType ?? 'scheduled_visit',
    scheduled_at: presetDate ?? '',
    notes: presetNotes ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof VisitForm, string>>>({});
  const [saving, setSaving] = useState(false);

  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerQuery, setCustomerQuery] = useState(presetCustomerName ?? '');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [technicians, setTechnicians] = useState<{ id: string; full_name: string }[]>([]);
  const [conflict, setConflict] = useState<string | null>(null);
  const [addressTouched, setAddressTouched] = useState(false);

  const def = visitTypeDef(form.visit_type);
  const selectedCustomer = customers.find(c => c.id === form.customer_id);

  /* ── lookups ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    (async () => {
      const [custRes, techRes] = await Promise.all([
        supabase.from('customers')
          .select('id, name, address, phone, customer_type')
          .order('name'),
        supabase.from('profiles')
          .select('id, full_name')
          .eq('role', 'technician')
          .order('full_name'),
      ]);
      setCustomers((custRes.data ?? []) as CustomerOption[]);
      setTechnicians((techRes.data ?? []) as { id: string; full_name: string }[]);
    })();
  }, []);

  /* Devices + address follow the selected customer. */
  useEffect(() => {
    if (!form.customer_id) {
      setDevices([]);
      return;
    }
    setLoadingDevices(true);
    (async () => {
      const { data } = await supabase
        .from('customer_devices')
        .select('id, device_brand, device_model, serial_number, location_in_premises, warranty_expires')
        .eq('customer_id', form.customer_id)
        .order('installation_date', { ascending: false });
      setDevices((data ?? []) as DeviceOption[]);
      setLoadingDevices(false);
    })();
  }, [form.customer_id]);

  /*
    Choosing a customer pulls their address in. It keeps following the chosen
    customer until the operator types an address of their own — a visit at a
    different location is the exception, not the rule.
  */
  useEffect(() => {
    if (addressTouched) return;
    const customer = customers.find(c => c.id === form.customer_id);
    setForm(prev => ({ ...prev, address: customer?.address ?? '' }));
  }, [form.customer_id, customers, addressTouched]);

  /* A device that no longer belongs to the chosen customer must not linger. */
  useEffect(() => {
    if (form.device_id && !devices.some(d => d.id === form.device_id)) {
      setForm(prev => ({ ...prev, device_id: '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices]);

  /* ── technician double-booking check ─────────────────────────────────── */

  useEffect(() => {
    if (!form.technician_id || !form.scheduled_at) {
      setConflict(null);
      return;
    }
    const timer = setTimeout(async () => {
      const target = new Date(form.scheduled_at);
      const from = new Date(target.getTime() - 2 * 3600_000).toISOString();
      const to   = new Date(target.getTime() + 2 * 3600_000).toISOString();

      const { data } = await supabase
        .from('appointments')
        .select('id, scheduled_at')
        .eq('technician_id', form.technician_id)
        .neq('status', 'cancelled')
        .gte('scheduled_at', from)
        .lte('scheduled_at', to);

      setConflict(data && data.length ? t('visit.conflictWarning', { count: data.length }) : null);
    }, 400);

    return () => clearTimeout(timer);
  }, [form.technician_id, form.scheduled_at, t]);

  /* ── helpers ─────────────────────────────────────────────────────────── */

  function patch(changes: Partial<VisitForm>) {
    setForm(prev => ({ ...prev, ...changes }));
    setErrors(prev => {
      const next = { ...prev };
      (Object.keys(changes) as (keyof VisitForm)[]).forEach(k => delete next[k]);
      return next;
    });
  }

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(c => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q))
      .slice(0, 8);
  }, [customerQuery, customers]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const found = validateVisit(form);
    if (found.length) {
      const map: Partial<Record<keyof VisitForm, string>> = {};
      found.forEach(({ field, key }) => { map[field] = t(`visit.${key}`); });
      setErrors(map);
      showToast(t('customerForm.fixErrors'), 'warning');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('appointments')
      .insert(toAppointmentRow(form, profile?.id))
      .select('id')
      .single();

    if (error) {
      showToast(error.message, 'error');
      setSaving(false);
      return;
    }

    if (serviceRequestId && data?.id) {
      await supabase.from('service_requests')
        .update({ status: 'scheduled', linked_appointment_id: data.id })
        .eq('id', serviceRequestId);
    }

    showToast(t('visit.scheduled'), 'success');
    onSaved();
    onClose();
  }

  const inputClass = (field: keyof VisitForm) =>
    `w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${
      errors[field] ? 'border-red-300 bg-red-50/40' : 'border-slate-200'
    }`;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">{t('visit.scheduleTitle')}</h2>
              <p className="text-xs text-slate-500">{t('visit.scheduleSubtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">

          {/* ── Visit type ──────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              {t('visit.visitType')} <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {VISIT_TYPES.map(vt => (
                <button
                  key={vt.value}
                  type="button"
                  onClick={() => patch({ visit_type: vt.value, device_id: vt.registersDevice ? '' : form.device_id })}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition text-start ${
                    form.visit_type === vt.value
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${vt.dot}`} />
                  {t(`visit.type.${vt.value}`)}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-1.5">{t(`visit.typeHint.${form.visit_type}`)}</p>
          </div>

          {/* ── Customer ────────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {t('visit.customer')} <span className="text-red-500">*</span>
            </label>

            {presetCustomerId ? (
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50">
                {selectedCustomer?.customer_type === 'corporate'
                  ? <Building2 className="w-4 h-4 text-slate-400" />
                  : <UserRound className="w-4 h-4 text-slate-400" />}
                <span className="text-sm font-medium text-slate-800">
                  {selectedCustomer?.name ?? presetCustomerName ?? '—'}
                </span>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={customerQuery}
                  onChange={e => {
                    setCustomerQuery(e.target.value);
                    setShowCustomerList(true);
                    if (form.customer_id) patch({ customer_id: '', address: '' });
                  }}
                  onFocus={() => setShowCustomerList(true)}
                  placeholder={t('visit.searchCustomer')}
                  className={`${inputClass('customer_id')} ps-10 ${form.customer_id ? 'border-green-400 bg-green-50/40' : ''}`}
                />
                {showCustomerList && filteredCustomers.length > 0 && !form.customer_id && (
                  <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {filteredCustomers.map(c => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            patch({ customer_id: c.id, address: c.address ?? '' });
                            setCustomerQuery(c.name);
                            setShowCustomerList(false);
                          }}
                          className="w-full text-start px-3 py-2 hover:bg-slate-50 transition"
                        >
                          <span className="block text-sm text-slate-800">{c.name}</span>
                          <span className="block text-[11px] text-slate-400" dir="ltr">{c.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {errors.customer_id && (
              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {errors.customer_id}
              </p>
            )}

            {form.customer_id && (
              <div className="mt-3">
                <CustomerSummary customerId={form.customer_id} />
              </div>
            )}
          </div>

          {/* ── Device ──────────────────────────────────────────────────── */}
          {def.registersDevice ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 flex items-start gap-2">
              <Cpu className="w-4 h-4 shrink-0 mt-0.5" />
              {t('visit.deviceRegisteredOnVisit')}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {t('visit.device')} {def.needsDevice && <span className="text-slate-400 font-normal">({t('visit.recommended')})</span>}
              </label>
              <div className="relative">
                <Cpu className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={form.device_id}
                  onChange={e => patch({ device_id: e.target.value })}
                  disabled={!form.customer_id || loadingDevices}
                  className={`${inputClass('device_id')} ps-10 disabled:bg-slate-50 disabled:text-slate-400`}
                >
                  <option value="">
                    {!form.customer_id
                      ? t('visit.selectCustomerFirst')
                      : loadingDevices
                        ? t('common.loading')
                        : devices.length
                          ? t('visit.wholeSite')
                          : t('visit.noDevices')}
                  </option>
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>
                      {[d.device_brand, d.device_model, d.serial_number && `SN ${d.serial_number}`, d.location_in_premises]
                        .filter(Boolean).join(' — ')}
                    </option>
                  ))}
                </select>
              </div>
              {form.customer_id && !loadingDevices && devices.length === 0 && (
                <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {t('visit.noDevicesHint')}
                </p>
              )}
            </div>
          )}

          {/* ── When / who ──────────────────────────────────────────────── */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {t('visit.dateTime')} <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={e => patch({ scheduled_at: e.target.value })}
                className={inputClass('scheduled_at')}
              />
              {errors.scheduled_at && (
                <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {errors.scheduled_at}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('visit.technician')}</label>
              <div className="relative">
                <Wrench className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={form.technician_id}
                  onChange={e => patch({ technician_id: e.target.value })}
                  className={`${inputClass('technician_id')} ps-10`}
                >
                  <option value="">{t('status.unassigned')}</option>
                  {technicians.map(tech => (
                    <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {conflict && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {conflict}
            </p>
          )}

          {/* ── Address ─────────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('visit.address')}</label>
            <div className="relative">
              <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={form.address}
                onChange={e => { patch({ address: e.target.value }); setAddressTouched(true); }}
                placeholder={t('visit.addressPlaceholder')}
                className={`${inputClass('address')} ps-10`}
              />
            </div>
          </div>

          {/* ── Confirmation gate ───────────────────────────────────────── */}
          <div className={`rounded-xl border p-3 space-y-3 ${form.confirmed ? 'border-green-200 bg-green-50/50' : 'border-slate-200 bg-slate-50/60'}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.confirmed}
                onChange={e => patch({
                  confirmed: e.target.checked,
                  confirmation_channel: e.target.checked ? (form.confirmation_channel || 'phone') : '',
                })}
                className="w-4 h-4 mt-0.5 accent-green-600"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  {form.confirmed
                    ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                    : <PhoneCall className="w-4 h-4 text-slate-400" />}
                  {t('visit.customerConfirmed')}
                </span>
                <span className="block text-[11px] text-slate-500 mt-0.5">{t('visit.confirmedHint')}</span>
              </span>
            </label>

            {form.confirmed && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('visit.confirmationChannel')}</label>
                <select
                  value={form.confirmation_channel}
                  onChange={e => patch({ confirmation_channel: e.target.value as ConfirmationChannel })}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {CONFIRMATION_CHANNELS.map(ch => (
                    <option key={ch} value={ch}>{t(`visit.channel.${ch}`)}</option>
                  ))}
                </select>
                {errors.confirmation_channel && (
                  <p className="text-xs text-red-600 mt-1">{errors.confirmation_channel}</p>
                )}
              </div>
            )}
          </div>

          {/* ── Notes ───────────────────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              <FileText className="inline w-3.5 h-3.5 me-1 text-slate-400" />
              {t('visit.notes')}
            </label>
            <textarea
              value={form.notes}
              onChange={e => patch({ notes: e.target.value })}
              rows={2}
              placeholder={t('visit.notesPlaceholder')}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Actions */}
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
              className="flex-1 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              {t('visit.scheduleAction')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
