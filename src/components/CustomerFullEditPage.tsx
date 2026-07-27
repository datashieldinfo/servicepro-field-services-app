import { useEffect, useState } from 'react';
import { X, Loader2, User, Phone, Mail, MapPin, FileText, ShieldCheck, Calendar, Save, Cpu, Droplets } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

interface Props {
  customerId: string;
  onClose: () => void;
  onSaved: () => void;
}

interface ProfileState {
  name: string;
  phone: string;
  email: string;
  address: string;
  contract_type: string;
  warranty_expires: string;
  device_install_date: string;
  last_service_date: string;
  next_appointment: string;
}

interface DeviceState {
  id: string;
  device_brand: string;
  device_model: string;
  serial_number: string;
  installation_date: string;
  warranty_expires: string;
  location_in_premises: string;
}

interface ContractState {
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

interface FilterState {
  id: string;
  location: string;
  filter_type: string;
  health_percent: number;
  last_replaced: string;
  next_due: string;
}

const DEVICE_BRANDS = ['BioFamily 4-Stage', 'BioFamily 7-Stage', 'Ruhens Cooler', 'Family Cooler', 'Other'];
const PLAN_TYPES = ['monthly', 'quarterly', 'biannual', 'annual'];
const CONTRACT_STATUSES = ['active', 'expired', 'cancelled', 'pending'];

export default function CustomerFullEditPage({ customerId, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [profile, setProfile] = useState<ProfileState>({
    name: '', phone: '', email: '', address: '', contract_type: 'quarterly',
    warranty_expires: '', device_install_date: '', last_service_date: '', next_appointment: '',
  });
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const [contracts, setContracts] = useState<ContractState[]>([]);
  const [filters, setFilters] = useState<FilterState[]>([]);

  useEffect(() => { loadAll(); }, [customerId]);

  async function loadAll() {
    setLoading(true);
    const [custRes, devRes, conRes, filtRes] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).maybeSingle(),
      supabase.from('customer_devices').select('id, device_brand, device_model, serial_number, installation_date, warranty_expires, location_in_premises')
        .eq('customer_id', customerId).order('installation_date', { ascending: false }),
      supabase.from('contracts').select('id, plan_type, visits_included, visits_used, price_jod, start_date, end_date, auto_renew, status')
        .eq('customer_id', customerId).order('start_date', { ascending: false }),
      supabase.from('filter_status').select('id, location, filter_type, health_percent, last_replaced, next_due')
        .eq('customer_id', customerId).order('location'),
    ]);

    const cust = custRes.data as Record<string, unknown> | null;
    if (cust) {
      setCustomerName(cust.name as string);
      setProfile({
        name: (cust.name as string) ?? '',
        phone: (cust.phone as string) ?? '',
        email: (cust.email as string) ?? '',
        address: (cust.address as string) ?? '',
        contract_type: (cust.contract_type as string) ?? 'quarterly',
        warranty_expires: (cust.warranty_expires as string) ?? '',
        device_install_date: (cust.device_install_date as string) ?? '',
        last_service_date: (cust.last_service_date as string) ?? '',
        next_appointment: (cust.next_appointment as string) ?? '',
      });
    }

    setDevices(((devRes.data ?? []) as Record<string, unknown>[]).map(d => ({
      id: d.id as string,
      device_brand: (d.device_brand as string) ?? DEVICE_BRANDS[0],
      device_model: (d.device_model as string) ?? '',
      serial_number: (d.serial_number as string) ?? '',
      installation_date: (d.installation_date as string) ?? '',
      warranty_expires: (d.warranty_expires as string) ?? '',
      location_in_premises: (d.location_in_premises as string) ?? '',
    })));

    setContracts(((conRes.data ?? []) as Record<string, unknown>[]).map(c => ({
      id: c.id as string,
      plan_type: c.plan_type as string,
      visits_included: c.visits_included as number,
      visits_used: c.visits_used as number,
      price_jod: c.price_jod as number,
      start_date: c.start_date as string,
      end_date: c.end_date as string,
      auto_renew: c.auto_renew as boolean,
      status: c.status as string,
    })));

    setFilters(((filtRes.data ?? []) as Record<string, unknown>[]).map(f => ({
      id: f.id as string,
      location: f.location as string,
      filter_type: f.filter_type as string,
      health_percent: f.health_percent as number,
      last_replaced: (f.last_replaced as string) ?? '',
      next_due: (f.next_due as string) ?? '',
    })));

    setLoading(false);
  }

  function updateDevice(id: string, patch: Partial<DeviceState>) {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, ...patch } : d));
  }
  function updateContract(id: string, patch: Partial<ContractState>) {
    setContracts(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  }
  function updateFilter(id: string, patch: Partial<FilterState>) {
    setFilters(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  async function handleSaveAll() {
    if (!profile.name.trim() || !profile.phone.trim()) {
      showToast(t('toast.warning'), 'warning');
      return;
    }
    setSaving(true);

    const results = await Promise.all([
      supabase.from('customers').update({
        name: profile.name.trim(),
        phone: profile.phone.trim(),
        email: profile.email.trim() || null,
        address: profile.address.trim(),
        contract_type: profile.contract_type || null,
        warranty_expires: profile.warranty_expires || null,
        device_install_date: profile.device_install_date || null,
        last_service_date: profile.last_service_date || null,
        next_appointment: profile.next_appointment || null,
      }).eq('id', customerId),
      ...devices.map(d => supabase.from('customer_devices').update({
        device_brand: d.device_brand,
        device_model: d.device_model.trim() || null,
        serial_number: d.serial_number.trim() || null,
        installation_date: d.installation_date || null,
        warranty_expires: d.warranty_expires || null,
        location_in_premises: d.location_in_premises.trim() || null,
      }).eq('id', d.id)),
      ...contracts.map(c => supabase.from('contracts').update({
        plan_type: c.plan_type,
        visits_included: c.visits_included,
        visits_used: c.visits_used,
        price_jod: c.price_jod,
        start_date: c.start_date,
        end_date: c.end_date,
        auto_renew: c.auto_renew,
        status: c.status,
      }).eq('id', c.id)),
      ...filters.map(f => supabase.from('filter_status').update({
        location: f.location.trim(),
        filter_type: f.filter_type.trim(),
        health_percent: Math.max(0, Math.min(100, f.health_percent)),
        last_replaced: f.last_replaced || null,
        next_due: f.next_due || null,
      }).eq('id', f.id)),
    ]);

    setSaving(false);
    const failed = results.filter(r => r.error);

    if (failed.length > 0) {
      showToast(
        isAr ? `فشل حفظ ${failed.length} من ${results.length} تعديلات` : `${failed.length} of ${results.length} updates failed`,
        'error'
      );
      return;
    }

    showToast(isAr ? 'تم حفظ جميع التعديلات بنجاح' : 'All changes saved successfully', 'success');
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-stretch sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-50 w-full sm:max-w-3xl sm:rounded-2xl sm:max-h-[92vh] h-full sm:h-auto overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-slate-900 text-base">{isAr ? 'التعديل الكامل للعميل' : 'Full Customer Edit'}</h2>
            <p className="text-xs text-slate-500">{customerName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : (
          <div className="p-5 space-y-6 pb-28">

            {/* ═══ PROFILE ═══ */}
            <section>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">{t('customer360.masterData')}</h3>
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'الاسم الكامل' : 'Full Name'} <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} required className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'رقم الهاتف' : 'Phone'} <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} required dir="ltr" className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
                    <div className="relative">
                      <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} dir="ltr" className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'العنوان' : 'Address'}</label>
                  <div className="relative">
                    <MapPin className="absolute start-3 top-3 w-4 h-4 text-slate-400" />
                    <input value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5"><FileText className="inline w-3.5 h-3.5 me-1 text-slate-400" />{isAr ? 'نوع العقد' : 'Contract Type'}</label>
                  <select value={profile.contract_type} onChange={e => setProfile(p => ({ ...p, contract_type: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white capitalize">
                    {PLAN_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5"><ShieldCheck className="inline w-3.5 h-3.5 me-1 text-slate-400" />{t('customer360.warrantyExpires')}</label>
                    <input type="date" value={profile.warranty_expires} onChange={e => setProfile(p => ({ ...p, warranty_expires: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5"><Calendar className="inline w-3.5 h-3.5 me-1 text-slate-400" />{t('customer360.installDate')}</label>
                    <input type="date" value={profile.device_install_date} onChange={e => setProfile(p => ({ ...p, device_install_date: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'آخر صيانة' : 'Last Service'}</label>
                    <input type="date" value={profile.last_service_date} onChange={e => setProfile(p => ({ ...p, last_service_date: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{isAr ? 'الزيارة القادمة' : 'Next Appointment'}</label>
                    <input type="date" value={profile.next_appointment} onChange={e => setProfile(p => ({ ...p, next_appointment: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                  </div>
                </div>
              </div>
            </section>

            {/* ═══ DEVICES ═══ */}
            <section>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2"><Cpu className="w-3.5 h-3.5" /> {t('customer360.devices')} ({devices.length})</h3>
              {devices.length === 0 ? (
                <p className="text-xs text-slate-400 bg-white rounded-xl border border-slate-100 px-4 py-3">{t('common.noData')}</p>
              ) : (
                <div className="space-y-3">
                  {devices.map(d => (
                    <div key={d.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <select value={d.device_brand} onChange={e => updateDevice(d.id, { device_brand: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
                          {DEVICE_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <input value={d.device_model} onChange={e => updateDevice(d.id, { device_model: e.target.value })} placeholder={t('manager.deviceModel')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <input value={d.serial_number} onChange={e => updateDevice(d.id, { serial_number: e.target.value })} placeholder={t('manager.serialNumber')} dir="ltr" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                        <input value={d.location_in_premises} onChange={e => updateDevice(d.id, { location_in_premises: e.target.value })} placeholder={t('manager.locationInPremises')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{t('customer360.installDate')}</label>
                          <input type="date" value={d.installation_date} onChange={e => updateDevice(d.id, { installation_date: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{t('customer360.warrantyExpires')}</label>
                          <input type="date" value={d.warranty_expires} onChange={e => updateDevice(d.id, { warranty_expires: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ═══ CONTRACTS ═══ */}
            <section>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> {t('customer360.contracts')} ({contracts.length})</h3>
              {contracts.length === 0 ? (
                <p className="text-xs text-slate-400 bg-white rounded-xl border border-slate-100 px-4 py-3">{t('common.noData')}</p>
              ) : (
                <div className="space-y-3">
                  {contracts.map(c => (
                    <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <select value={c.plan_type} onChange={e => updateContract(c.id, { plan_type: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white capitalize">
                          {PLAN_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select value={c.status} onChange={e => updateContract(c.id, { status: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white capitalize">
                          {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{isAr ? 'الزيارات المتضمنة' : 'Visits Included'}</label>
                          <input type="number" min={0} value={c.visits_included} onChange={e => updateContract(c.id, { visits_included: Number(e.target.value) })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{isAr ? 'الزيارات المستخدمة' : 'Visits Used'}</label>
                          <input type="number" min={0} value={c.visits_used} onChange={e => updateContract(c.id, { visits_used: Number(e.target.value) })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{t('admin.dateFrom')}</label>
                          <input type="date" value={c.start_date} onChange={e => updateContract(c.id, { start_date: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{t('admin.dateTo')}</label>
                          <input type="date" value={c.end_date} onChange={e => updateContract(c.id, { end_date: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 items-end">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{t('invoice.amount')} ({t('invoice.jod')})</label>
                          <input type="number" min={0} step="0.01" value={c.price_jod} onChange={e => updateContract(c.id, { price_jod: Number(e.target.value) })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-700 pb-2.5">
                          <input type="checkbox" checked={c.auto_renew} onChange={e => updateContract(c.id, { auto_renew: e.target.checked })} className="rounded" />
                          {t('manager.autoRenew')}
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ═══ FILTER STATUS ═══ */}
            <section>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2"><Droplets className="w-3.5 h-3.5" /> {t('customer.filterStatus')} ({filters.length})</h3>
              {filters.length === 0 ? (
                <p className="text-xs text-slate-400 bg-white rounded-xl border border-slate-100 px-4 py-3">{t('common.noData')}</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {filters.map(f => (
                    <div key={f.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-3">
                      <input value={f.location} onChange={e => updateFilter(f.id, { location: e.target.value })} placeholder={isAr ? 'الموقع' : 'Location'} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                      <input value={f.filter_type} onChange={e => updateFilter(f.id, { filter_type: e.target.value })} placeholder={isAr ? 'نوع الفلتر' : 'Filter Type'} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">{isAr ? 'نسبة الكفاءة (%)' : 'Health (%)'}</label>
                        <input type="number" min={0} max={100} value={f.health_percent} onChange={e => updateFilter(f.id, { health_percent: Number(e.target.value) })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{isAr ? 'آخر استبدال' : 'Last Replaced'}</label>
                          <input type="date" value={f.last_replaced} onChange={e => updateFilter(f.id, { last_replaced: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 mb-1">{t('customer.nextDue')}</label>
                          <input type="date" value={f.next_due} onChange={e => updateFilter(f.id, { next_due: e.target.value })} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {!loading && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4 flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              {t('common.cancel')}
            </button>
            <button onClick={handleSaveAll} disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isAr ? 'حفظ كل التعديلات' : 'Save All Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
