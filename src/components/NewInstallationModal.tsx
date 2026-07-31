import { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Cpu, Plus, Trash2, Calendar, Wrench, MapPin, FileText,
  AlertTriangle, CheckCircle2, PhoneCall, PackagePlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { useAuth } from '../contexts/AuthContext';
import CustomerSummary from './CustomerSummary';
import {
  CONFIRMATION_CHANNELS,
  toAppointmentRow,
  emptyVisitForm,
  type ConfirmationChannel,
} from '../lib/visitFields';
import { DEVICE_BRANDS, WARRANTY_MONTHS } from '../lib/deviceFields';


interface DeviceDraft {
  key: string;
  device_brand: string;
  device_model: string;
  serial_number: string;
  location_in_premises: string;
  warranty_months: number;
  catalog_id: string;
}

interface CatalogItem {
  id: string;
  part_name: string;
  selling_price: number | null;
}

interface Props {
  customerId: string;
  customerName?: string;
  onClose: () => void;
  onSaved: () => void;
  /** Pre-fills the device list from an accepted offer. */
  presetDevices?: { device_brand: string; device_model?: string; catalog_id?: string }[];
  /** Marks the offer converted once the installation is booked. */
  quotationId?: string | null;
}

function newDeviceDraft(overrides: Partial<DeviceDraft> = {}): DeviceDraft {
  return {
    key: crypto.randomUUID(),
    device_brand: DEVICE_BRANDS[0],
    device_model: '',
    serial_number: '',
    location_in_premises: '',
    warranty_months: 12,
    catalog_id: '',
    ...overrides,
  };
}

/**
 * Booking an installation registers the devices *and* schedules the visit in a
 * single save, so a sold device never exists as a calendar entry with nothing
 * attached to it.
 */
export default function NewInstallationModal({
  customerId,
  customerName,
  onClose,
  onSaved,
  presetDevices,
  quotationId = null,
}: Props) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [devices, setDevices] = useState<DeviceDraft[]>(() =>
    presetDevices?.length
      ? presetDevices.map(d => newDeviceDraft({
          device_brand: DEVICE_BRANDS.includes(d.device_brand) ? d.device_brand : 'Other',
          device_model: d.device_model ?? (DEVICE_BRANDS.includes(d.device_brand) ? '' : d.device_brand),
          catalog_id: d.catalog_id ?? '',
        }))
      : [newDeviceDraft()]
  );
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string; full_name: string }[]>([]);
  const [address, setAddress] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [channel, setChannel] = useState<ConfirmationChannel>('phone');
  const [conflict, setConflict] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ date?: string; devices?: string }>({});

  /* ── lookups ─────────────────────────────────────────────────────────── */

  useEffect(() => {
    (async () => {
      const [custRes, techRes, catRes] = await Promise.all([
        supabase.from('customers').select('address').eq('id', customerId).maybeSingle(),
        supabase.from('profiles').select('id, full_name').eq('role', 'technician').order('full_name'),
        supabase.from('inventory').select('id, part_name, selling_price').eq('category', 'device').order('part_name'),
      ]);
      setAddress(custRes.data?.address ?? '');
      setTechnicians((techRes.data ?? []) as { id: string; full_name: string }[]);
      setCatalog((catRes.data ?? []) as CatalogItem[]);
    })();
  }, [customerId]);

  useEffect(() => {
    if (!technicianId || !scheduledAt) { setConflict(null); return; }
    const timer = setTimeout(async () => {
      const target = new Date(scheduledAt);
      const { data } = await supabase
        .from('appointments')
        .select('id')
        .eq('technician_id', technicianId)
        .neq('status', 'cancelled')
        .gte('scheduled_at', new Date(target.getTime() - 2 * 3600_000).toISOString())
        .lte('scheduled_at', new Date(target.getTime() + 2 * 3600_000).toISOString());
      setConflict(data && data.length ? t('visit.conflictWarning', { count: data.length }) : null);
    }, 400);
    return () => clearTimeout(timer);
  }, [technicianId, scheduledAt, t]);

  /* ── device rows ─────────────────────────────────────────────────────── */

  function patchDevice(key: string, changes: Partial<DeviceDraft>) {
    setDevices(prev => prev.map(d => (d.key === key ? { ...d, ...changes } : d)));
    setErrors(prev => ({ ...prev, devices: undefined }));
  }

  const total = useMemo(() => devices.reduce((sum, d) => {
    const item = catalog.find(c => c.id === d.catalog_id);
    return sum + Number(item?.selling_price ?? 0);
  }, 0), [devices, catalog]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const found: typeof errors = {};
    if (!scheduledAt) found.date = t('visit.errDate');
    if (!devices.length) found.devices = t('install.errNoDevices');
    if (Object.keys(found).length) {
      setErrors(found);
      showToast(t('customerForm.fixErrors'), 'warning');
      return;
    }

    setSaving(true);
    const installDate = scheduledAt.split('T')[0];

    /* 1. Register the devices under the customer. */
    const deviceRows = devices.map(d => {
      const warrantyEnd = new Date(installDate);
      warrantyEnd.setMonth(warrantyEnd.getMonth() + d.warranty_months);
      return {
        customer_id: customerId,
        device_brand: d.device_brand,
        device_model: d.device_model.trim() || null,
        serial_number: d.serial_number.trim() || null,
        installation_date: installDate,
        warranty_expires: warrantyEnd.toISOString().split('T')[0],
        location_in_premises: d.location_in_premises.trim() || null,
      };
    });

    const { data: savedDevices, error: deviceError } = await supabase
      .from('customer_devices')
      .insert(deviceRows)
      .select('id');

    if (deviceError) {
      showToast(deviceError.message, 'error');
      setSaving(false);
      return;
    }

    /* 2. Book the installation visit against the first device. */
    const visit = emptyVisitForm({
      customer_id: customerId,
      visit_type: 'installation',
      device_id: savedDevices?.[0]?.id ?? '',
      technician_id: technicianId,
      scheduled_at: scheduledAt,
      address,
      notes: notes.trim(),
      confirmed,
      confirmation_channel: confirmed ? channel : '',
    });

    const { data: appt, error: apptError } = await supabase
      .from('appointments')
      .insert(toAppointmentRow(visit, profile?.id))
      .select('id')
      .single();

    if (apptError) {
      showToast(apptError.message, 'error');
      setSaving(false);
      return;
    }

    /* 3. Keep the customer's headline install/warranty dates in step. */
    await supabase
      .from('customers')
      .update({
        device_install_date: installDate,
        warranty_expires: deviceRows[0].warranty_expires,
      })
      .eq('id', customerId);

    /* 4. An offer that led here is now converted. */
    if (quotationId && appt?.id) {
      await supabase
        .from('quotations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString(), converted_appointment_id: appt.id })
        .eq('id', quotationId);
    }

    showToast(t('install.saved', { count: deviceRows.length }), 'success');
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <PackagePlus className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">{t('install.title')}</h2>
              <p className="text-xs text-slate-500">{customerName ?? t('install.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">

          {/* What is already known about this customer */}
          <CustomerSummary customerId={customerId} />

          {/* ── Devices ─────────────────────────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('install.devices')}</h3>
              {total > 0 && (
                <span className="text-xs font-semibold text-slate-500">
                  {t('install.listPrice')}: {total.toFixed(2)} JOD
                </span>
              )}
            </div>

            {devices.map((d, index) => (
              <div key={d.key} className="border border-slate-200 rounded-xl p-3 space-y-3 bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                    <Cpu className="w-3.5 h-3.5" />
                    {t('install.device')} {index + 1}
                  </span>
                  {devices.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDevices(prev => prev.filter(x => x.key !== d.key))}
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t('install.brand')}</label>
                    <select
                      value={d.device_brand}
                      onChange={e => patchDevice(d.key, { device_brand: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {DEVICE_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t('install.catalogItem')}</label>
                    <select
                      value={d.catalog_id}
                      onChange={e => patchDevice(d.key, { catalog_id: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">{t('install.noCatalogItem')}</option>
                      {catalog.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.part_name}{c.selling_price ? ` — ${Number(c.selling_price).toFixed(2)} JOD` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t('install.model')}</label>
                    <input
                      value={d.device_model}
                      onChange={e => patchDevice(d.key, { device_model: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      {t('install.serial')} <span className="text-slate-400 font-normal">({t('install.optionalAtBooking')})</span>
                    </label>
                    <input
                      value={d.serial_number}
                      onChange={e => patchDevice(d.key, { serial_number: e.target.value })}
                      placeholder={t('install.serialPlaceholder')}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t('install.location')}</label>
                    <input
                      value={d.location_in_premises}
                      onChange={e => patchDevice(d.key, { location_in_premises: e.target.value })}
                      placeholder={t('install.locationPlaceholder')}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t('install.warranty')}</label>
                    <select
                      value={d.warranty_months}
                      onChange={e => patchDevice(d.key, { warranty_months: Number(e.target.value) })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {WARRANTY_MONTHS.map(m => (
                        <option key={m} value={m}>{t('install.months', { count: m })}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setDevices(prev => [...prev, newDeviceDraft()])}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-blue-300 hover:text-blue-600 transition"
            >
              <Plus className="w-4 h-4" />
              {t('install.addDevice')}
            </button>
            {errors.devices && <p className="text-xs text-red-600">{errors.devices}</p>}
          </section>

          {/* ── Visit ───────────────────────────────────────────────────── */}
          <section className="space-y-4 border-t border-slate-100 pt-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('install.visitSection')}</h3>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {t('visit.dateTime')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => { setScheduledAt(e.target.value); setErrors(prev => ({ ...prev, date: undefined })); }}
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${
                    errors.date ? 'border-red-300 bg-red-50/40' : 'border-slate-200'
                  }`}
                />
                {errors.date && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {errors.date}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('visit.technician')}</label>
                <div className="relative">
                  <Wrench className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <select
                    value={technicianId}
                    onChange={e => setTechnicianId(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">{t('status.unassigned')}</option>
                    {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
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

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('visit.address')}</label>
              <div className="relative">
                <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className={`rounded-xl border p-3 space-y-3 ${confirmed ? 'border-green-200 bg-green-50/50' : 'border-slate-200 bg-slate-50/60'}`}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-green-600"
                />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    {confirmed ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <PhoneCall className="w-4 h-4 text-slate-400" />}
                    {t('visit.customerConfirmed')}
                  </span>
                  <span className="block text-[11px] text-slate-500 mt-0.5">{t('visit.confirmedHint')}</span>
                </span>
              </label>

              {confirmed && (
                <select
                  value={channel}
                  onChange={e => setChannel(e.target.value as ConfirmationChannel)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {CONFIRMATION_CHANNELS.map(ch => (
                    <option key={ch} value={ch}>{t(`visit.channel.${ch}`)}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <FileText className="inline w-3.5 h-3.5 me-1 text-slate-400" />
                {t('visit.notes')}
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder={t('install.notesPlaceholder')}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </section>

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
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
              {t('install.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
