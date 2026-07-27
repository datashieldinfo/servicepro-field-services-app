import { useState } from 'react';
import { X, Loader2, User, Phone, Mail, MapPin, FileText, ShieldCheck, Calendar, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

export interface EditableCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  contract_type: string | null;
  warranty_expires: string | null;
  device_install_date: string | null;
  last_service_date: string | null;
  next_appointment: string | null;
}

interface Props {
  customer: EditableCustomer;
  onClose: () => void;
  onUpdated: (updated: EditableCustomer) => void;
}

const CONTRACT_TYPES = ['monthly', 'quarterly', 'biannual', 'annual'] as const;
const CONTRACT_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  monthly: { ar: 'شهري', en: 'Monthly' },
  quarterly: { ar: 'ربع سنوي', en: 'Quarterly' },
  biannual: { ar: 'نصف سنوي', en: 'Biannual' },
  annual: { ar: 'سنوي', en: 'Annual' },
};

export default function EditCustomerModal({ customer, onClose, onUpdated }: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [name, setName] = useState(customer.name ?? '');
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [email, setEmail] = useState(customer.email ?? '');
  const [address, setAddress] = useState(customer.address ?? '');
  const [contractType, setContractType] = useState(customer.contract_type ?? 'quarterly');
  const [warrantyExpires, setWarrantyExpires] = useState(customer.warranty_expires ?? '');
  const [deviceInstallDate, setDeviceInstallDate] = useState(customer.device_install_date ?? '');
  const [lastServiceDate, setLastServiceDate] = useState(customer.last_service_date ?? '');
  const [nextAppointment, setNextAppointment] = useState(customer.next_appointment ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast(t('toast.warning'), 'warning');
      return;
    }

    setSaving(true);
    const updates = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      address: address.trim(),
      contract_type: contractType || null,
      warranty_expires: warrantyExpires || null,
      device_install_date: deviceInstallDate || null,
      last_service_date: lastServiceDate || null,
      next_appointment: nextAppointment || null,
    };

    const { error } = await supabase.from('customers').update(updates).eq('id', customer.id);
    setSaving(false);

    if (error) {
      showToast(error.message || t('toast.error'), 'error');
      return;
    }

    showToast(isAr ? 'تم تحديث بيانات العميل بنجاح' : 'Customer information updated successfully', 'success');
    onUpdated({ id: customer.id, ...updates });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">
                {isAr ? 'تعديل بيانات العميل' : 'Edit Customer'}
              </h2>
              <p className="text-xs text-slate-500">{customer.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* Full name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {isAr ? 'الاسم الكامل' : 'Full Name'} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {isAr ? 'رقم الهاتف' : 'Phone Number'} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                dir="ltr"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {isAr ? 'البريد الإلكتروني' : 'Email Address'}
            </label>
            <div className="relative">
              <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                dir="ltr"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {isAr ? 'العنوان' : 'Address'}
            </label>
            <div className="relative">
              <MapPin className="absolute start-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                className="w-full border border-slate-200 rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Contract type */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              <FileText className="inline w-3.5 h-3.5 me-1 text-slate-400" />
              {isAr ? 'نوع العقد' : 'Contract Type'}
            </label>
            <select
              value={contractType}
              onChange={e => setContractType(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              {CONTRACT_TYPES.map(ct => (
                <option key={ct} value={ct}>{isAr ? CONTRACT_TYPE_LABELS[ct].ar : CONTRACT_TYPE_LABELS[ct].en}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Warranty expires */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <ShieldCheck className="inline w-3.5 h-3.5 me-1 text-slate-400" />
                {isAr ? 'انتهاء الضمان' : 'Warranty Expires'}
              </label>
              <input
                type="date"
                value={warrantyExpires ?? ''}
                onChange={e => setWarrantyExpires(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Device install date */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <Calendar className="inline w-3.5 h-3.5 me-1 text-slate-400" />
                {isAr ? 'تاريخ التركيب' : 'Install Date'}
              </label>
              <input
                type="date"
                value={deviceInstallDate ?? ''}
                onChange={e => setDeviceInstallDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Last service date */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {isAr ? 'آخر صيانة' : 'Last Service'}
              </label>
              <input
                type="date"
                value={lastServiceDate ?? ''}
                onChange={e => setLastServiceDate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Next appointment */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                {isAr ? 'الزيارة القادمة' : 'Next Appointment'}
              </label>
              <input
                type="date"
                value={nextAppointment ?? ''}
                onChange={e => setNextAppointment(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
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
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isAr ? 'حفظ التعديلات' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
