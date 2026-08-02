import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown, Cpu, Loader2, Pencil, Plus, Search, ShieldCheck, User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { fmtDate } from '../lib/format';
import { USAGE_TYPES, USAGE_TONE, type DeviceRecord, type UsageType } from '../lib/deviceFields';

interface InstalledDevice extends DeviceRecord {
  customer_id: string;
  usage_type: UsageType;
  customers?: { name: string; phone: string | null } | null;
}

interface CatalogueModel {
  part_name: string;
  usage_type: UsageType;
  selling_price: number | null;
}

interface ModelGroup {
  key: string;
  brand: string;
  model: string;
  usage: UsageType;
  units: InstalledDevice[];
  customers: number;
  /** Priced in the catalogue even when nothing is installed yet. */
  listPrice: number | null;
}

interface Props {
  /** Opens the device editor for one installed unit. */
  onEdit?: (device: InstalledDevice) => void;
  /** Register a new device. */
  onAdd?: () => void;
  /** Opens a customer's record from the expanded list. */
  onOpenCustomer?: (customerId: string) => void;
  /** Bump to reload after a device is saved elsewhere. */
  reloadToken?: number;
}

/**
 * The devices we have, as a catalogue rather than a flat list.
 *
 * Grouped by what they are for — home use or industrial use — and then by
 * model, because "how many 7-Stage units are out there and who has them" is the
 * question the office actually asks. Models that are priced in the catalogue
 * but not installed anywhere are listed too, so the product line is complete.
 */
export default function DeviceCatalogue({ onEdit, onAdd, onOpenCustomer, reloadToken = 0 }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [devices, setDevices] = useState<InstalledDevice[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [usageFilter, setUsageFilter] = useState<UsageType | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const [devRes, catRes] = await Promise.all([
        supabase
          .from('customer_devices')
          .select('id, customer_id, device_brand, device_model, serial_number, installation_date, warranty_expires, location_in_premises, usage_type, customers(name, phone)')
          .order('installation_date', { ascending: false }),
        supabase
          .from('inventory')
          .select('part_name, usage_type, selling_price')
          .eq('category', 'device')
          .order('part_name'),
      ]);

      if (cancelled) return;

      type Row = Omit<InstalledDevice, 'customers'> & {
        customers: { name: string; phone: string | null } | { name: string; phone: string | null }[] | null;
      };

      setDevices(
        ((devRes.data ?? []) as unknown as Row[]).map(row => ({
          ...row,
          usage_type: (row.usage_type ?? 'home') as UsageType,
          customers: Array.isArray(row.customers) ? row.customers[0] ?? null : row.customers,
        }))
      );
      setCatalogue(
        ((catRes.data ?? []) as CatalogueModel[]).map(c => ({ ...c, usage_type: c.usage_type ?? 'home' }))
      );
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [reloadToken]);

  /* One entry per model, with its installed units hanging off it. */
  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byKey = new Map<string, ModelGroup>();

    devices.forEach(device => {
      const brand = device.device_brand ?? '—';
      const model = device.device_model ?? '';
      const usage = (device.usage_type ?? 'home') as UsageType;
      const key = `${usage}::${brand}::${model}`;

      if (!byKey.has(key)) {
        byKey.set(key, { key, brand, model, usage, units: [], customers: 0, listPrice: null });
      }
      byKey.get(key)!.units.push(device);
    });

    /* Models we sell but have not installed anywhere yet still belong here. */
    catalogue.forEach(item => {
      const usage = (item.usage_type ?? 'home') as UsageType;
      const existing = [...byKey.values()].find(
        g => g.usage === usage && `${g.brand} ${g.model}`.trim().toLowerCase() === item.part_name.trim().toLowerCase()
      );
      if (existing) { existing.listPrice = item.selling_price; return; }

      const key = `${usage}::${item.part_name}::`;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key, brand: item.part_name, model: '', usage,
          units: [], customers: 0, listPrice: item.selling_price,
        });
      }
    });

    const list = [...byKey.values()].map(group => ({
      ...group,
      customers: new Set(group.units.map(u => u.customer_id)).size,
    }));

    return list
      .filter(group => usageFilter === 'all' || group.usage === usageFilter)
      .filter(group => {
        if (!term) return true;
        if (`${group.brand} ${group.model}`.toLowerCase().includes(term)) return true;
        return group.units.some(u =>
          (u.customers?.name ?? '').toLowerCase().includes(term) ||
          (u.serial_number ?? '').toLowerCase().includes(term)
        );
      })
      .sort((a, b) => b.units.length - a.units.length || a.brand.localeCompare(b.brand));
  }, [devices, catalogue, search, usageFilter]);

  const totals = useMemo(() => ({
    home: devices.filter(d => (d.usage_type ?? 'home') === 'home').length,
    industrial: devices.filter(d => d.usage_type === 'industrial').length,
  }), [devices]);

  const sections: { usage: UsageType; groups: ModelGroup[] }[] = USAGE_TYPES
    .map(usage => ({ usage, groups: groups.filter(g => g.usage === usage) }))
    .filter(section => section.groups.length > 0);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('device.searchPlaceholder')}
            className="w-full ps-10 pe-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:ring-2 focus:ring-navy outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(['all', ...USAGE_TYPES] as const).map(value => (
            <button
              key={value}
              onClick={() => setUsageFilter(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                usageFilter === value
                  ? 'bg-navy text-white border-navy'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {value === 'all' ? t('common.all') : t(`device.usage_${value}`)}
              {value !== 'all' && (
                <span className="ms-1.5 opacity-70">{totals[value]}</span>
              )}
            </button>
          ))}
        </div>

        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition"
          >
            <Plus className="w-3.5 h-3.5" /> {t('manager.newDevice')}
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-12 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
        </div>
      ) : sections.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 py-12 text-center text-sm text-slate-400">
          {t('common.noData')}
        </div>
      ) : (
        sections.map(section => (
          <div key={section.usage} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg border text-xs font-bold ${USAGE_TONE[section.usage]}`}>
                  {t(`device.usage_${section.usage}`)}
                </span>
                <span className="text-xs text-slate-500">{t(`device.usageHint_${section.usage}`)}</span>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {t('device.unitsInstalled', { count: totals[section.usage] })}
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {section.groups.map(group => {
                const open = expanded === group.key;
                return (
                  <div key={group.key}>
                    <button
                      onClick={() => setExpanded(open ? null : group.key)}
                      className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-start hover:bg-slate-50 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                          <Cpu className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 text-sm truncate">
                            {group.brand}
                            {group.model && <span className="text-slate-400 font-normal"> · {group.model}</span>}
                          </p>
                          <p className="text-xs text-slate-500">
                            {t('device.unitsInstalled', { count: group.units.length })}
                            {group.customers > 0 && ` · ${t('device.customersWith', { count: group.customers })}`}
                            {group.listPrice != null && ` · ${group.listPrice} ${t('invoice.jod')}`}
                          </p>
                        </div>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
                    </button>

                    {open && (
                      <div className="bg-slate-50/60 px-5 pb-4">
                        {group.units.length === 0 ? (
                          <p className="text-xs text-slate-400 py-3">{t('device.noneInstalled')}</p>
                        ) : (
                          <div className="divide-y divide-slate-200">
                            {group.units.map(unit => (
                              <div key={unit.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                  <button
                                    onClick={() => onOpenCustomer?.(unit.customer_id)}
                                    disabled={!onOpenCustomer}
                                    className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 hover:text-navy disabled:hover:text-slate-800 transition"
                                  >
                                    <User className="w-3.5 h-3.5 text-slate-400" />
                                    {unit.customers?.name ?? '—'}
                                  </button>
                                  <p className="text-[11px] text-slate-500 mt-0.5">
                                    {unit.serial_number ? `S/N ${unit.serial_number} · ` : ''}
                                    {t('customer360.installDate')}: {fmtDate(unit.installation_date)}
                                    {unit.location_in_premises ? ` · ${unit.location_in_premises}` : ''}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {unit.warranty_expires && (
                                    <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md ${
                                      new Date(unit.warranty_expires) > new Date()
                                        ? 'bg-green-50 text-green-700'
                                        : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      <ShieldCheck className="w-3 h-3" />
                                      {fmtDate(unit.warranty_expires)}
                                    </span>
                                  )}
                                  {onEdit && (
                                    <button
                                      onClick={() => onEdit(unit)}
                                      title={t('common.edit')}
                                      className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-navy/10 flex items-center justify-center text-slate-500 hover:text-navy transition"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <p className="text-[11px] text-slate-400 px-1">
        {isAr
          ? 'الأجهزة مصنّفة حسب نوع الاستخدام المسجّل لكل جهاز — عدّل الجهاز لتغيير تصنيفه.'
          : 'Devices are grouped by the usage type recorded on each unit — edit a device to change how it is classified.'}
      </p>
    </div>
  );
}
