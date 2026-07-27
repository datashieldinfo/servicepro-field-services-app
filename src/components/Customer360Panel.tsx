import { useEffect, useState } from 'react';
import {
  X, Phone, Mail, MapPin, Calendar, ShieldCheck, Cpu, FileText, Receipt,
  Droplets, MessageSquare, Bell, ChevronDown, ChevronUp, User, Wrench, Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

interface Props {
  customerId: string;
  onClose: () => void;
}

interface CustomerMaster {
  id: string; name: string; phone: string; email: string; address: string;
  user_id: string | null; contract_type: string | null;
  warranty_expires: string | null; device_install_date: string | null;
  last_service_date: string | null; next_appointment: string | null;
  created_at: string;
  linkedProfile?: { full_name: string; phone: string; created_at: string } | null;
}

interface DeviceRow {
  id: string; device_brand: string; device_model: string | null; serial_number: string | null;
  installation_date: string | null; warranty_expires: string | null; location_in_premises: string | null;
}

interface ContractRow {
  id: string; plan_type: string; visits_included: number; visits_used: number;
  price_jod: number; start_date: string; end_date: string; auto_renew: boolean; status: string;
}

interface ApptRow {
  id: string; service_type: string; scheduled_at: string; status: string;
  technician: { full_name: string } | null;
  tds_before: number | null; tds_after: number | null;
  followup_recommended: boolean | null;
}

interface ApptDrill {
  tasks: { id: string; title: string; completed: boolean }[];
  parts: { id: string; quantity_used: number; inventory: { part_name: string } | null }[];
  photosCount: number;
}

interface InvoiceRow {
  id: string; invoice_number: string; total_amount: number; payment_status: string;
  payment_method: string; issued_at: string;
}

interface RequestRow {
  id: string; trigger_type: string; urgency: string; status: string; description: string; created_at: string;
}

interface FilterRow {
  id: string; location: string; filter_type: string; health_percent: number;
  last_replaced: string | null; next_due: string | null;
}

interface NotificationRow {
  id: string; type: string; message: string; is_read: boolean; created_at: string;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB');
}

export default function Customer360Panel({ customerId, onClose }: Props) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<CustomerMaster | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [appointments, setAppointments] = useState<ApptRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const [expandedAppt, setExpandedAppt] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<Record<string, ApptDrill>>({});
  const [drillLoading, setDrillLoading] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, [customerId]);

  async function loadAll() {
    setLoading(true);
    const custRes = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
    const cust = custRes.data as CustomerMaster | null;
    let linkedProfile = null;
    if (cust?.user_id) {
      const { data: prof } = await supabase
        .from('profiles').select('full_name, phone, created_at').eq('id', cust.user_id).maybeSingle();
      linkedProfile = prof ?? null;
    }
    setCustomer(cust ? { ...cust, linkedProfile } : null);

    const [devRes, conRes, apptRes, invRes, reqRes, filtRes] = await Promise.all([
      supabase.from('customer_devices').select('id, device_brand, device_model, serial_number, installation_date, warranty_expires, location_in_premises')
        .eq('customer_id', customerId).order('installation_date', { ascending: false }),
      supabase.from('contracts').select('id, plan_type, visits_included, visits_used, price_jod, start_date, end_date, auto_renew, status')
        .eq('customer_id', customerId).order('start_date', { ascending: false }),
      supabase.from('appointments').select('id, service_type, scheduled_at, status, tds_before, tds_after, followup_recommended, technician:profiles!appointments_technician_id_fkey(full_name)')
        .eq('customer_id', customerId).order('scheduled_at', { ascending: false }).limit(50),
      supabase.from('invoices').select('id, invoice_number, total_amount, payment_status, payment_method, issued_at')
        .eq('customer_id', customerId).order('issued_at', { ascending: false }).limit(50),
      supabase.from('service_requests').select('id, trigger_type, urgency, status, description, created_at')
        .eq('customer_id', customerId).order('created_at', { ascending: false }).limit(30),
      supabase.from('filter_status').select('id, location, filter_type, health_percent, last_replaced, next_due')
        .eq('customer_id', customerId).order('location'),
    ]);

    setDevices((devRes.data ?? []) as DeviceRow[]);
    setContracts((conRes.data ?? []) as ContractRow[]);
    setAppointments(((apptRes.data ?? []) as Record<string, unknown>[]).map(r => ({
      ...(r as unknown as ApptRow),
      technician: Array.isArray(r.technician) ? (r.technician as { full_name: string }[])[0] ?? null : r.technician as { full_name: string } | null,
    })));
    setInvoices((invRes.data ?? []) as InvoiceRow[]);
    setRequests((reqRes.data ?? []) as RequestRow[]);
    setFilters((filtRes.data ?? []) as FilterRow[]);

    if (cust?.user_id) {
      const { data: notifData } = await supabase
        .from('notifications').select('id, type, message, is_read, created_at')
        .eq('user_id', cust.user_id).order('created_at', { ascending: false }).limit(20);
      setNotifications((notifData ?? []) as NotificationRow[]);
    } else {
      setNotifications([]);
    }

    setLoading(false);
  }

  async function toggleApptDrill(apptId: string) {
    if (expandedAppt === apptId) { setExpandedAppt(null); return; }
    setExpandedAppt(apptId);
    if (drillData[apptId]) return;
    setDrillLoading(apptId);
    const [tasksRes, partsRes, photosRes] = await Promise.all([
      supabase.from('job_tasks').select('id, title, completed').eq('appointment_id', apptId),
      supabase.from('job_parts').select('id, quantity_used, inventory(part_name)').eq('appointment_id', apptId),
      supabase.from('job_photos').select('id', { count: 'exact', head: true }).eq('appointment_id', apptId),
    ]);
    setDrillData(prev => ({
      ...prev,
      [apptId]: {
        tasks: (tasksRes.data ?? []) as { id: string; title: string; completed: boolean }[],
        parts: ((partsRes.data ?? []) as Record<string, unknown>[]).map(p => ({
          id: p.id as string,
          quantity_used: p.quantity_used as number,
          inventory: Array.isArray(p.inventory) ? (p.inventory as { part_name: string }[])[0] ?? null : p.inventory as { part_name: string } | null,
        })),
        photosCount: photosRes.count ?? 0,
      },
    }));
    setDrillLoading(null);
  }

  const statusColor: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-blue-100 text-blue-700',
    awaiting_approval: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    active: 'bg-green-100 text-green-700',
    expired: 'bg-slate-100 text-slate-600',
    scheduled: 'bg-blue-100 text-blue-700',
    dismissed: 'bg-slate-100 text-slate-500',
    paid: 'bg-green-100 text-green-700',
    partial: 'bg-amber-100 text-amber-700',
  };

  const urgencyColor: Record<string, string> = {
    emergency: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-slate-100 text-slate-600',
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[90] flex items-stretch sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-50 w-full sm:max-w-4xl sm:rounded-2xl sm:max-h-[92vh] h-full sm:h-auto overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-navy/10 rounded-xl flex items-center justify-center text-navy font-bold shrink-0">
              {customer?.name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-900 text-base truncate">{customer?.name ?? '—'}</h2>
              <p className="text-xs text-slate-500">{t('customer360.title')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition shrink-0">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        ) : !customer ? (
          <p className="text-center text-slate-400 py-24 text-sm">{t('common.noData')}</p>
        ) : (
          <div className="p-5 space-y-6">

            {/* ═══ MASTER DATA ═══ */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">{t('customer360.masterData')}</h3>

              {/* Profile card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-slate-700"><Phone className="w-4 h-4 text-slate-400 shrink-0" /><span dir="ltr">{customer.phone || '—'}</span></div>
                  <div className="flex items-center gap-2 text-slate-700"><Mail className="w-4 h-4 text-slate-400 shrink-0" /><span className="truncate">{customer.email || '—'}</span></div>
                  <div className="flex items-center gap-2 text-slate-700 sm:col-span-2"><MapPin className="w-4 h-4 text-slate-400 shrink-0" /><span>{customer.address || '—'}</span></div>
                  <div className="flex items-center gap-2 text-slate-700"><FileText className="w-4 h-4 text-slate-400 shrink-0" /><span>{t('customer360.contractType')}: {customer.contract_type ?? '—'}</span></div>
                  <div className="flex items-center gap-2 text-slate-700"><ShieldCheck className="w-4 h-4 text-slate-400 shrink-0" /><span>{t('customer360.warrantyExpires')}: {fmtDate(customer.warranty_expires)}</span></div>
                  <div className="flex items-center gap-2 text-slate-700"><Calendar className="w-4 h-4 text-slate-400 shrink-0" /><span>{t('customer360.installDate')}: {fmtDate(customer.device_install_date)}</span></div>
                  <div className="flex items-center gap-2 text-slate-700"><Calendar className="w-4 h-4 text-slate-400 shrink-0" /><span>{t('customer360.memberSince')}: {fmtDate(customer.created_at)}</span></div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  {customer.linkedProfile ? (
                    <span className="text-slate-700">{t('customer360.linkedAccount')}: <strong>{customer.linkedProfile.full_name}</strong></span>
                  ) : (
                    <span className="text-slate-400 italic">{t('customer360.noLinkedAccount')}</span>
                  )}
                </div>
              </div>

              {/* Devices */}
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><Cpu className="w-4 h-4 text-slate-400" /> {t('customer360.devices')} ({devices.length})</p>
                {devices.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-white rounded-xl border border-slate-100 px-4 py-3">{t('common.noData')}</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {devices.map(d => (
                      <div key={d.id} className="bg-white rounded-xl border border-slate-100 p-3 text-xs space-y-1">
                        <p className="font-semibold text-slate-900">{d.device_brand}{d.device_model ? ` — ${d.device_model}` : ''}</p>
                        {d.serial_number && <p className="text-slate-500" dir="ltr">S/N: {d.serial_number}</p>}
                        <p className="text-slate-500">{t('customer360.installDate')}: {fmtDate(d.installation_date)}</p>
                        <p className="text-slate-500">{t('customer360.warrantyExpires')}: {fmtDate(d.warranty_expires)}</p>
                        {d.location_in_premises && <p className="text-slate-500">{d.location_in_premises}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contracts */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><FileText className="w-4 h-4 text-slate-400" /> {t('customer360.contracts')} ({contracts.length})</p>
                {contracts.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-white rounded-xl border border-slate-100 px-4 py-3">{t('common.noData')}</p>
                ) : (
                  <div className="space-y-2">
                    {contracts.map(c => (
                      <div key={c.id} className="bg-white rounded-xl border border-slate-100 p-3 flex items-center justify-between flex-wrap gap-2 text-xs">
                        <div>
                          <p className="font-semibold text-slate-900 capitalize">{c.plan_type}</p>
                          <p className="text-slate-500">{fmtDate(c.start_date)} → {fmtDate(c.end_date)} · {c.visits_used}/{c.visits_included} {t('customer360.visits')} · {c.price_jod} {t('invoice.jod')}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-lg font-semibold ${statusColor[c.status] ?? 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ═══ TRANSACTIONAL DATA ═══ */}
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">{t('customer360.transactionalData')}</h3>

              {/* Appointments */}
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><Wrench className="w-4 h-4 text-slate-400" /> {t('customer360.appointments')} ({appointments.length})</p>
                {appointments.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-white rounded-xl border border-slate-100 px-4 py-3">{t('common.noData')}</p>
                ) : (
                  <div className="space-y-2">
                    {appointments.map(a => {
                      const isOpen = expandedAppt === a.id;
                      const drill = drillData[a.id];
                      return (
                        <div key={a.id} className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                          <button onClick={() => toggleApptDrill(a.id)} className="w-full text-start px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition">
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 text-xs truncate">{a.service_type}</p>
                              <p className="text-[11px] text-slate-500">
                                {new Date(a.scheduled_at).toLocaleDateString('en-GB')} · {a.technician?.full_name ?? t('customer360.unassigned')}
                                {(a.tds_before != null || a.tds_after != null) && ` · TDS ${a.tds_before ?? '—'}→${a.tds_after ?? '—'}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${statusColor[a.status] ?? 'bg-slate-100 text-slate-600'}`}>{a.status}</span>
                              {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 text-xs space-y-2">
                              {drillLoading === a.id ? (
                                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                              ) : drill ? (
                                <>
                                  <p className="text-slate-600">
                                    <strong>{t('technician.checklist')}:</strong>{' '}
                                    {drill.tasks.length === 0 ? '—' : drill.tasks.map(tsk => `${tsk.completed ? '✓' : '○'} ${tsk.title}`).join(', ')}
                                  </p>
                                  <p className="text-slate-600">
                                    <strong>{t('technician.partsUsed')}:</strong>{' '}
                                    {drill.parts.length === 0 ? t('customer360.noPartsUsed') : drill.parts.map(p => `${p.inventory?.part_name ?? '—'} ×${p.quantity_used}`).join(', ')}
                                  </p>
                                  <p className="text-slate-600"><strong>{t('customer360.photos')}:</strong> {drill.photosCount}</p>
                                  {a.followup_recommended && (
                                    <p className="text-amber-700 font-medium">{t('customer360.followupRecommended')}</p>
                                  )}
                                </>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Invoices */}
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><Receipt className="w-4 h-4 text-slate-400" /> {t('customer360.invoices')} ({invoices.length})</p>
                {invoices.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-white rounded-xl border border-slate-100 px-4 py-3">{t('common.noData')}</p>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-100 divide-y divide-slate-100">
                    {invoices.map(inv => (
                      <div key={inv.id} className="px-4 py-3 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-semibold text-slate-900" dir="ltr">{inv.invoice_number}</p>
                          <p className="text-slate-500">{fmtDate(inv.issued_at)}</p>
                        </div>
                        <div className="text-end">
                          <p className="font-semibold text-slate-900">{inv.total_amount.toFixed(2)} {t('invoice.jod')}</p>
                          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold ${statusColor[inv.payment_status] ?? 'bg-slate-100 text-slate-600'}`}>{inv.payment_status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Service requests */}
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><MessageSquare className="w-4 h-4 text-slate-400" /> {t('customer360.serviceRequests')} ({requests.length})</p>
                {requests.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-white rounded-xl border border-slate-100 px-4 py-3">{t('common.noData')}</p>
                ) : (
                  <div className="space-y-2">
                    {requests.map(r => (
                      <div key={r.id} className="bg-white rounded-xl border border-slate-100 px-4 py-3 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{t(`serviceRequests.type_${r.trigger_type}`, r.trigger_type)}</p>
                          <p className="text-slate-500 truncate">{r.description || fmtDate(r.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`px-2 py-0.5 rounded-lg font-semibold ${urgencyColor[r.urgency] ?? 'bg-slate-100 text-slate-600'}`}>{r.urgency}</span>
                          <span className={`px-2 py-0.5 rounded-lg font-semibold ${statusColor[r.status] ?? 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Filter status */}
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><Droplets className="w-4 h-4 text-slate-400" /> {t('customer.filterStatus')} ({filters.length})</p>
                {filters.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-white rounded-xl border border-slate-100 px-4 py-3">{t('common.noData')}</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {filters.map(f => (
                      <div key={f.id} className="bg-white rounded-xl border border-slate-100 p-3 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-slate-900">{f.location}</p>
                          <span className={`font-bold ${f.health_percent < 25 ? 'text-red-600' : f.health_percent < 60 ? 'text-amber-600' : 'text-green-600'}`}>{f.health_percent}%</span>
                        </div>
                        <p className="text-slate-500">{f.filter_type}</p>
                        <p className="text-slate-500">{t('customer.nextDue')}: {fmtDate(f.next_due)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notifications */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2"><Bell className="w-4 h-4 text-slate-400" /> {t('customer360.notificationsSent')} ({notifications.length})</p>
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-white rounded-xl border border-slate-100 px-4 py-3">{t('common.noData')}</p>
                ) : (
                  <div className="bg-white rounded-xl border border-slate-100 divide-y divide-slate-100">
                    {notifications.map(n => (
                      <div key={n.id} className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
                        <span className={`text-slate-700 ${!n.is_read ? 'font-semibold' : ''}`}>{n.message}</span>
                        <span className="text-slate-400 shrink-0">{fmtDate(n.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
