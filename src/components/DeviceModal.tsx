import { useState } from 'react';
import { X, Loader2, Cpu, Save, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { DEVICE_BRANDS, USAGE_TYPES, USAGE_TONE, type DeviceRecord, type UsageType } from '../lib/deviceFields';

export type EditableDevice = DeviceRecord;

interface Props {
  /** Editing an existing device; omit to register a new one. */
  device?: DeviceRecord | null;
  /** Customers to choose from when registering — omit when the owner is known. */
  customers?: { id: string; name: string }[];
  /** Pre-selected owner for a new device. */
  customerId?: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * One form for registering a device and for editing one. They were two
 * components with the same six fields, the same brand list and the same write —
 * only the verb differed.
 */
export default function DeviceModal({
  device = null,
  customers,
  customerId,
  onClose,
  onSaved,
}: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const editing = !!device;

  const [owner, setOwner] = useState(device?.customer_id ?? customerId ?? '');
  const [brand, setBrand] = useState(device?.device_brand ?? DEVICE_BRANDS[0]);
  const [model, setModel] = useState(device?.device_model ?? '');
  const [serial, setSerial] = useState(device?.serial_number ?? '');
  const [installDate, setInstallDate] = useState(device?.installation_date ?? '');
  const [warrantyExpires, setWarrantyExpires] = useState(device?.warranty_expires ?? '');
  const [location, setLocation] = useState(device?.location_in_premises ?? '');
  const [usageType, setUsageType] = useState<UsageType>(device?.usage_type ?? 'home');
  const [saving, setSaving] = useState(false);

  const needsOwnerPicker = !editing && !customerId && !!customers?.length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!editing && !owner) {
      showToast(t('toast.warning'), 'warning');
      return;
    }

    setSaving(true);

    const row = {
      device_brand: brand,
      device_model: model.trim() || null,
      serial_number: serial.trim() || null,
      installation_date: installDate || null,
      warranty_expires: warrantyExpires || null,
      location_in_premises: location.trim() || null,
      usage_type: usageType,
    };

    const { error } = editing
      ? await supabase.from('customer_devices').update(row).eq('id', device!.id)
      : await supabase.from('customer_devices').insert({ ...row, customer_id: owner });

    setSaving(false);

    if (error) {
      showToast(error.message || t('toast.error'), 'error');
      return;
    }

    showToast(
      editing
        ? (isAr ? 'تم تحديث بيانات الجهاز بنجاح' : 'Device updated successfully')
        : (isAr ? 'تمت إضافة الجهاز بنجاح' : 'Device added successfully'),
      'success',
    );
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Cpu className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="font-bold text-slate-900 text-base">
              {editing
                ? (isAr ? 'تعديل بيانات الجهاز' : 'Edit Device')
                : t('manager.newDevice')}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {needsOwnerPicker && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('admin.customer')}</label>
              <select
                value={owner}
                onChange={e => setOwner(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"
              >
                <option value="">{t('admin.selectCustomer')}</option>
                {customers!.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customer360.devices')}</label>
            <select value={brand} onChange={e => setBrand(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">
              {DEVICE_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Home or industrial — it decides the filters fitted and the interval */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('device.usageType')}</label>
            <div className="grid grid-cols-2 gap-2">
              {USAGE_TYPES.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUsageType(u)}
                  className={`px-3 py-2.5 rounded-xl border-2 text-xs font-semibold transition ${
                    usageType === u ? `${USAGE_TONE[u]} border-current` : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {t(`device.usage_${u}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder={t('manager.deviceModel')}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
            />
            <input
              value={serial}
              onChange={e => setSerial(e.target.value)}
              placeholder={t('manager.serialNumber')}
              dir="ltr"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customer360.installDate')}</label>
              <input type="date" value={installDate} onChange={e => setInstallDate(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customer360.warrantyExpires')}</label>
              <input type="date" value={warrantyExpires} onChange={e => setWarrantyExpires(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder={t('manager.locationInPremises')}
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
          />

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" />
                : editing ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
