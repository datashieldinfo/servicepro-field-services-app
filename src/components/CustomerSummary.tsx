import { useEffect, useState } from 'react';
import {
  Building2, UserRound, Phone, MapPin, Cpu, FileText, Clock,
  ShieldCheck, ShieldAlert, MessageSquare, Loader2, ExternalLink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { contractHealth } from '../lib/statusMeta';
import { fmtDate as fmt } from '../lib/format';

interface CustomerRow {
  id: string;
  name: string;
  customer_type: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  warranty_expires: string | null;
  last_service_date: string | null;
  next_appointment: string | null;
  contact_person_name: string | null;
  contact_person_phone: string | null;
}

interface ContractRow {
  plan_type: string;
  visits_included: number;
  visits_used: number;
  end_date: string;
  status: string;
}

export interface CustomerSnapshot {
  customer: CustomerRow;
  contract: ContractRow | null;
  deviceCount: number;
  openRequests: number;
}

interface Props {
  customerId: string;
  /** Bubbles the loaded record up so the parent can prefill its own fields. */
  onLoaded?: (snapshot: CustomerSnapshot) => void;
}

/**
 * Everything already known about a customer, pulled the moment one is chosen —
 * so booking a visit for an existing customer never means retyping what the
 * office already has on file.
 */
export default function CustomerSummary({ customerId, onLoaded }: Props) {
  const { t } = useTranslation();
  const [snapshot, setSnapshot] = useState<CustomerSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) { setSnapshot(null); return; }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const [custRes, contractRes, deviceRes, requestRes] = await Promise.all([
        supabase.from('customers')
          .select('id, name, customer_type, phone, email, address, city, area, latitude, longitude, notes, warranty_expires, last_service_date, next_appointment, contact_person_name, contact_person_phone')
          .eq('id', customerId)
          .maybeSingle(),
        supabase.from('contracts')
          .select('plan_type, visits_included, visits_used, end_date, status')
          .eq('customer_id', customerId)
          .eq('status', 'active')
          .order('end_date', { ascending: false })
          .limit(1),
        supabase.from('customer_devices')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', customerId),
        supabase.from('service_requests')
          .select('id', { count: 'exact', head: true })
          .eq('customer_id', customerId)
          .eq('status', 'pending'),
      ]);

      if (cancelled || !custRes.data) { setLoading(false); return; }

      const next: CustomerSnapshot = {
        customer: custRes.data as CustomerRow,
        contract: ((contractRes.data ?? [])[0] as ContractRow) ?? null,
        deviceCount: deviceRes.count ?? 0,
        openRequests: requestRes.count ?? 0,
      };

      setSnapshot(next);
      setLoading(false);
      onLoaded?.(next);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  if (!customerId) return null;

  if (loading && !snapshot) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t('customerSummary.loading')}
      </div>
    );
  }

  if (!snapshot) return null;

  const { customer, contract, deviceCount, openRequests } = snapshot;
  const corporate = customer.customer_type === 'corporate';
  const health = contract
    ? contractHealth({
        status: contract.status,
        visits_included: contract.visits_included,
        visits_used: contract.visits_used,
        end_date: contract.end_date,
      })
    : null;

  const warrantyDays = customer.warranty_expires
    ? Math.ceil((new Date(customer.warranty_expires).getTime() - Date.now()) / 86_400_000)
    : null;
  const underWarranty = warrantyDays !== null && warrantyDays >= 0;

  const mapHref = customer.latitude && customer.longitude
    ? `https://www.google.com/maps?q=${customer.latitude},${customer.longitude}`
    : null;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
      {/* Identity */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {corporate
            ? <Building2 className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            : <UserRound className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{customer.name}</p>
            <p className="text-[11px] text-slate-500">
              {t(`customerForm.${corporate ? 'corporate' : 'individual'}`, corporate ? 'Corporate' : 'Individual')}
              {corporate && customer.contact_person_name ? ` · ${customer.contact_person_name}` : ''}
            </p>
          </div>
        </div>
        {customer.phone && (
          <a
            href={`tel:${customer.phone}`}
            className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:border-slate-300 transition shrink-0"
            dir="ltr"
          >
            <Phone className="w-3 h-3" />
            {customer.phone}
          </a>
        )}
      </div>

      {/* Where */}
      {(customer.address || mapHref) && (
        <div className="flex items-start gap-2">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-600 min-w-0">
            {customer.address || `${customer.area ?? ''} ${customer.city ?? ''}`.trim()}
            {mapHref && (
              <a
                href={mapHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 ms-2 text-blue-600 hover:underline"
              >
                {t('customerSummary.openMap')}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </p>
        </div>
      )}

      {/* What is already on file */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-white border border-slate-200 rounded-lg px-2 py-1.5">
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <Cpu className="w-3 h-3" />{t('customerSummary.devices')}
          </p>
          <p className="text-sm font-bold text-slate-900">{deviceCount}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-2 py-1.5">
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />{t('customerSummary.lastVisit')}
          </p>
          <p className="text-[11px] font-semibold text-slate-900">{fmt(customer.last_service_date)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-2 py-1.5">
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            <FileText className="w-3 h-3" />{t('customerSummary.contract')}
          </p>
          {contract && health ? (
            <p className={`text-[11px] font-semibold ${health.remaining <= 1 ? 'text-amber-700' : 'text-slate-900'}`}>
              {t('contract.remainingCount', { count: health.remaining })}
            </p>
          ) : (
            <p className="text-[11px] font-semibold text-slate-400">{t('customerSummary.noContract')}</p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-2 py-1.5">
          <p className="text-[10px] text-slate-400 flex items-center gap-1">
            {underWarranty
              ? <ShieldCheck className="w-3 h-3" />
              : <ShieldAlert className="w-3 h-3" />}
            {t('customerSummary.warranty')}
          </p>
          <p className={`text-[11px] font-semibold ${
            underWarranty ? 'text-green-700' : customer.warranty_expires ? 'text-red-600' : 'text-slate-400'
          }`}>
            {customer.warranty_expires ? fmt(customer.warranty_expires) : t('customerSummary.none')}
          </p>
        </div>
      </div>

      {/* Things the office should know before booking */}
      {(openRequests > 0 || customer.next_appointment || customer.notes) && (
        <div className="space-y-1.5 pt-1 border-t border-slate-200">
          {openRequests > 0 && (
            <p className="text-[11px] text-purple-700 flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3 shrink-0" />
              {t('customerSummary.openRequests', { count: openRequests })}
            </p>
          )}
          {customer.next_appointment && (
            <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
              <Clock className="w-3 h-3 shrink-0" />
              {t('customerSummary.alreadyBooked', { date: fmt(customer.next_appointment) })}
            </p>
          )}
          {customer.notes && (
            <p className="text-[11px] text-slate-500 line-clamp-2">
              <span className="font-semibold">{t('admin.notes')}: </span>{customer.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
