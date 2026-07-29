import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar, Clock, CheckCircle, Bell, Gift, AlertTriangle, Phone,
  MessageCircle, Home, CalendarDays, BellRing, Users, ChevronRight,
  Loader2, ShieldCheck, XCircle, Printer, FileText, Droplets,
  Send, AlertOctagon, MessageSquare, Wrench, X, Receipt, FileCheck,
  TrendingDown,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import PrintableInvoice, { type InvoiceData } from '../../components/PrintableInvoice';

type MobileTab = 'home' | 'appointments' | 'notifications' | 'contact';

interface NextAppointment {
  id: string;
  scheduled_at: string;
  service_type: string;
  confirmed: boolean;
  technician_name: string | null;
}

interface PendingApproval {
  id: string;
  service_type: string;
  scheduled_at: string;
  approval_notes: string;
  technician_name: string | null;
}

interface HistoryJob {
  id: string;
  scheduled_at: string;
  service_type: string;
  technician_name: string | null;
  invoice?: {
    invoice_number: string;
    total_amount: number;
    payment_status: string;
    invoiceData: InvoiceData;
  } | null;
}

interface FilterItem {
  id: string;
  location: string;
  filter_type: string;
  last_replaced: string | null;
  next_due: string | null;
  health_percent: number;
  days_remaining: number;
}

interface AppNotification {
  id: string;
  type: 'reminder' | 'offer' | 'alert';
  message: string;
  created_at: string;
  is_read: boolean;
}

interface CustomerDevice {
  id: string;
  device_brand: string;
  device_model: string | null;
  serial_number: string | null;
  installation_date: string | null;
  warranty_expires: string | null;
  location_in_premises: string | null;
}

interface TdsReading {
  date: string;
  tds_before: number | null;
  tds_after: number | null;
}

interface CustomerContract {
  id: string;
  plan_type: 'monthly' | 'quarterly' | 'biannual' | 'annual';
  visits_included: number;
  visits_used: number;
  price_jod: number;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  status: string;
}

interface ServiceReport {
  date: string;
  serviceType: string;
  technicianName: string | null;
  checklist: { title: string; completed: boolean }[];
  partsUsed: { part_name: string; quantity_used: number }[];
  readings: { tds_before: number | null; tds_after: number | null } | null;
  nextServiceDate: string;
}

export default function CustomerDashboard() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [activeTab, setActiveTab] = useState<MobileTab>('home');
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [nextAppt, setNextAppt] = useState<NextAppointment | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [history, setHistory] = useState<HistoryJob[]>([]);
  const [filters, setFilters] = useState<FilterItem[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [selectedReport, setSelectedReport] = useState<ServiceReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [devices, setDevices] = useState<CustomerDevice[]>([]);
  const [tdsHistory, setTdsHistory] = useState<TdsReading[]>([]);
  const [customerContract, setCustomerContract] = useState<CustomerContract | null>(null);

  type ModalType = null | 'request' | 'emergency' | 'complaint';
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [requestDesc, setRequestDesc] = useState('');
  const [requestServiceType, setRequestServiceType] = useState('type_customer_request');
  const [complaintType, setComplaintType] = useState('taste');
  const [complaintDesc, setComplaintDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [emergencySent, setEmergencySent] = useState(false);
  const [actionedAppts, setActionedAppts] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [rejectionModal, setRejectionModal] = useState<{ apptId: string; serviceType: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const loadData = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);

    try {
      const { data: customerData, error: customerErr } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (customerErr) throw new Error(`customers: ${customerErr.message}`);

      if (!customerData) {
        setLoading(false);
        return;
      }

      const cid = customerData.id as string;
      setCustomerId(cid);

      const [nextRes, approvalRes, historyRes, filterRes, notifRes] = await Promise.all([
        supabase
          .from('appointments')
          .select('id, scheduled_at, service_type, confirmed, technician:profiles!appointments_technician_id_fkey(full_name)')
          .eq('customer_id', cid)
          .gte('scheduled_at', new Date().toISOString())
          .not('status', 'in', '(cancelled,awaiting_approval)')
          .order('scheduled_at')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('appointments')
          .select('id, scheduled_at, service_type, approval_notes, technician:profiles!appointments_technician_id_fkey(full_name)')
          .eq('customer_id', cid)
          .eq('status', 'awaiting_approval')
          .order('scheduled_at'),
        supabase
          .from('appointments')
          .select('id, scheduled_at, service_type, technician:profiles!appointments_technician_id_fkey(full_name)')
          .eq('customer_id', cid)
          .eq('status', 'completed')
          .order('scheduled_at', { ascending: false })
          .limit(20),
        supabase
          .from('filter_status')
          .select('id, location, filter_type, last_replaced, next_due, health_percent')
          .eq('customer_id', cid)
          .order('location'),
        supabase
          .from('notifications')
          .select('id, type, message, created_at, is_read')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      // Surface any Supabase response errors
      const firstErr = nextRes.error ?? approvalRes.error ?? historyRes.error ?? filterRes.error ?? notifRes.error;
      if (firstErr) throw new Error(`appointments/filters: ${firstErr.message}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolveTech = (tech: any): string | null => {
        if (!tech) return null;
        if (Array.isArray(tech)) return tech[0]?.full_name ?? null;
        return tech?.full_name ?? null;
      };

      if (nextRes.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = nextRes.data as any;
        setNextAppt({
          id: d.id ?? '',
          scheduled_at: d.scheduled_at ?? '',
          service_type: d.service_type ?? '',
          confirmed: d.confirmed ?? false,
          technician_name: resolveTech(d.technician),
        });
      } else {
        setNextAppt(null);
      }

      setPendingApprovals(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((approvalRes.data ?? []) as any[]).map((d) => ({
          id: d.id ?? '',
          service_type: d.service_type ?? '',
          scheduled_at: d.scheduled_at ?? '',
          approval_notes: d.approval_notes ?? '',
          technician_name: resolveTech(d.technician),
        }))
      );

      const historyItems = ((historyRes.data ?? []) as Record<string, unknown>[]).map(j => ({
        id: j.id as string ?? '',
        scheduled_at: j.scheduled_at as string ?? '',
        service_type: j.service_type as string ?? '',
        technician_name: resolveTech(j.technician),
        invoice: null as HistoryJob['invoice'],
      }));

      // Fetch invoices for all history appointments
      const apptIds = historyItems.map(j => j.id).filter(Boolean);
      if (apptIds.length > 0) {
        const { data: invoicesData } = await supabase
          .from('invoices')
          .select('invoice_number, total_amount, payment_status, appointment_id, parts_used, labor_cost, payment_method, issued_at, technician_id')
          .in('appointment_id', apptIds);

        // Fetch customer data for invoice display
        const { data: custData } = await supabase
          .from('customers')
          .select('name, address, phone')
          .eq('id', cid)
          .maybeSingle();

        if (invoicesData) {
          const invoicesByAppt: Record<string, HistoryJob['invoice']> = {};
          for (const inv of invoicesData as Record<string, unknown>[]) {
            const parts = (Array.isArray(inv.parts_used) ? inv.parts_used : []) as { name: string; quantity: number; unit_price: number }[];
            const invoiceData: InvoiceData = {
              invoiceNumber: inv.invoice_number as string,
              issuedAt: inv.issued_at as string,
              customer: {
                name: custData?.name ?? '-',
                address: custData?.address ?? '-',
                phone: custData?.phone ?? '-',
              },
              technicianName: '-',
              serviceType: historyItems.find(j => j.id === inv.appointment_id)?.service_type ?? '',
              serviceDate: historyItems.find(j => j.id === inv.appointment_id)?.scheduled_at ?? '',
              parts: parts.map(p => ({ name: p.name, quantity: p.quantity, unitPrice: p.unit_price })),
              laborCost: inv.labor_cost as number ?? 0,
              totalAmount: inv.total_amount as number ?? 0,
              paymentMethod: inv.payment_method as string ?? 'cash',
              paymentStatus: inv.payment_status as string ?? 'pending',
            };
            invoicesByAppt[inv.appointment_id as string] = {
              invoice_number: inv.invoice_number as string,
              total_amount: inv.total_amount as number ?? 0,
              payment_status: inv.payment_status as string ?? 'pending',
              invoiceData,
            };
          }
          for (const item of historyItems) {
            if (invoicesByAppt[item.id]) item.invoice = invoicesByAppt[item.id];
          }
        }
      }

      setHistory(historyItems);

      // Fetch customer devices
      const { data: devicesData } = await supabase
        .from('customer_devices')
        .select('id, device_brand, device_model, serial_number, installation_date, warranty_expires, location_in_premises')
        .eq('customer_id', cid)
        .order('installation_date', { ascending: false });
      setDevices(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((devicesData ?? []) as any[]).map(d => ({
          id: d.id ?? '',
          device_brand: d.device_brand ?? 'BioFamily 4-Stage',
          device_model: d.device_model ?? null,
          serial_number: d.serial_number ?? null,
          installation_date: d.installation_date ?? null,
          warranty_expires: d.warranty_expires ?? null,
          location_in_premises: d.location_in_premises ?? null,
        }))
      );

      // Fetch TDS history from completed appointments
      const { data: tdsData } = await supabase
        .from('appointments')
        .select('scheduled_at, job_readings(tds_before, tds_after)')
        .eq('customer_id', cid)
        .eq('status', 'completed')
        .not('job_readings', 'is', null)
        .order('scheduled_at')
        .limit(12);
      if (tdsData) {
        const readings: TdsReading[] = [];
        for (const appt of tdsData as Record<string, unknown>[]) {
          const jr = Array.isArray(appt.job_readings)
            ? (appt.job_readings as Record<string, unknown>[])[0]
            : (appt.job_readings as Record<string, unknown> | null);
          if (jr && (jr.tds_before != null || jr.tds_after != null)) {
            readings.push({
              date: appt.scheduled_at as string,
              tds_before: jr.tds_before as number | null,
              tds_after: jr.tds_after as number | null,
            });
          }
        }
        setTdsHistory(readings);
      }

      // Fetch active contract
      const { data: contractData } = await supabase
        .from('contracts')
        .select('id, plan_type, visits_included, visits_used, price_jod, start_date, end_date, auto_renew, status')
        .eq('customer_id', cid)
        .eq('status', 'active')
        .order('end_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      setCustomerContract(contractData as CustomerContract | null);

      setFilters(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((filterRes.data ?? []) as any[]).map((f) => ({
          id: f.id ?? '',
          location: f.location ?? '',
          filter_type: f.filter_type ?? '',
          last_replaced: f.last_replaced ?? null,
          next_due: f.next_due ?? null,
          health_percent: typeof f.health_percent === 'number' ? f.health_percent : 100,
          days_remaining: f.next_due
            ? Math.max(0, Math.ceil((new Date(f.next_due).getTime() - Date.now()) / 86400000))
            : 0,
        }))
      );

      setNotifications(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((notifRes.data ?? []) as any[]).map((n) => ({
          id: n.id ?? '',
          type: (n.type === 'offer' || n.type === 'alert' ? n.type : 'reminder') as AppNotification['type'],
          message: n.message ?? '',
          created_at: n.created_at ?? new Date().toISOString(),
          is_read: n.is_read ?? false,
        }))
      );

      setLoading(false);
    } catch (err) {
      console.error('CustomerDashboard loadData error:', err);
      setLoadError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleConfirmAppointment() {
    if (!nextAppt) return;
    const { error } = await supabase.from('appointments').update({ confirmed: true }).eq('id', nextAppt.id);
    if (!error) {
      setNextAppt(prev => prev ? { ...prev, confirmed: true } : null);
      showToast(t('customer.appointmentConfirmed'), 'success');
    }
  }

  async function handleApproval(apptId: string) {
    const { error } = await supabase
      .from('appointments')
      .update({ status: 'in_progress', approval_granted: true })
      .eq('id', apptId);
    if (!error) {
      setActionedAppts(prev => ({ ...prev, [apptId]: 'approved' }));
      showToast(t('customer.approvalAccepted'), 'success');
      setTimeout(() => { setPendingApprovals(prev => prev.filter(a => a.id !== apptId)); loadData(); }, 2500);
    }
  }

  async function handleRejection() {
    if (!rejectionModal || !customerId) return;
    const { apptId } = rejectionModal;
    const reason = rejectionReason.trim() || (isAr ? 'لم يُحدَّد سبب' : 'No reason provided');
    await Promise.all([
      supabase.from('appointments').update({
        status: 'pending',
        approval_granted: false,
        notes: `Customer rejected: ${reason}`,
      }).eq('id', apptId),
      supabase.from('service_requests').insert({
        customer_id: customerId,
        trigger_type: 'followup',
        urgency: 'high',
        description: `Customer rejected work proposal - needs admin review. Reason: ${reason}`,
        triggered_by: 'customer',
        linked_appointment_id: apptId,
      }),
    ]);
    setActionedAppts(prev => ({ ...prev, [apptId]: 'rejected' }));
    setRejectionModal(null);
    setRejectionReason('');
    showToast(t('customer.approvalRejected'), 'warning');
    setTimeout(() => { setPendingApprovals(prev => prev.filter(a => a.id !== apptId)); loadData(); }, 2500);
  }

  async function loadServiceReport(job: HistoryJob) {
    if (!job?.id) return;
    setReportLoading(true);
    setSelectedReport(null);

    try {
      const [tasksRes, partsRes, readingsRes] = await Promise.all([
        supabase.from('job_tasks').select('title, completed').eq('appointment_id', job.id),
        supabase.from('job_parts').select('quantity_used, inventory(part_name)').eq('appointment_id', job.id),
        supabase.from('job_readings').select('tds_before, tds_after').eq('appointment_id', job.id).maybeSingle(),
      ]);

      const nextDate = new Date(job.scheduled_at || Date.now());
      nextDate.setMonth(nextDate.getMonth() + 6);

      setSelectedReport({
        date: job.scheduled_at || new Date().toISOString(),
        serviceType: job.service_type || '',
        technicianName: job.technician_name ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        checklist: ((tasksRes.data ?? []) as any[]).map((task) => ({
          title: task.title ?? '',
          completed: task.completed ?? false,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partsUsed: ((partsRes.data ?? []) as any[]).map((p) => ({
          part_name: Array.isArray(p.inventory)
            ? (p.inventory[0]?.part_name ?? '-')
            : (p.inventory?.part_name ?? '-'),
          quantity_used: p.quantity_used ?? 0,
        })),
        readings: readingsRes.data
          ? { tds_before: readingsRes.data.tds_before ?? null, tds_after: readingsRes.data.tds_after ?? null }
          : null,
        nextServiceDate: nextDate.toISOString(),
      });
    } catch (err) {
      console.error('loadServiceReport error:', err);
    }
    setReportLoading(false);
  }

  async function handleRequestService() {
    if (!customerId) return;
    setSubmitting(true);
    const { error } = await supabase.from('service_requests').insert({
      customer_id: customerId,
      trigger_type: 'customer_request',
      urgency: 'medium',
      description: requestDesc.trim() || t('serviceRequests.type_customer_request'),
      triggered_by: 'customer',
    });
    setSubmitting(false);
    if (!error) {
      setActiveModal(null);
      setRequestDesc('');
      setRequestServiceType('type_customer_request');
      showToast(t('serviceRequests.successMsg'), 'success');
    } else {
      showToast(t('toast.error'), 'error');
    }
  }

  async function handleEmergency() {
    if (!customerId) return;
    setSubmitting(true);
    const { error } = await supabase.from('service_requests').insert({
      customer_id: customerId,
      trigger_type: 'emergency',
      urgency: 'emergency',
      description: 'Emergency request from customer',
      triggered_by: 'customer',
    });
    setSubmitting(false);
    if (!error) {
      setEmergencySent(true);
      showToast(t('serviceRequests.emergencySuccess'), 'warning');
    } else {
      showToast(t('toast.error'), 'error');
    }
  }

  async function handleComplaint() {
    if (!customerId) return;
    setSubmitting(true);
    const typeLabel = t(`serviceRequests.complaint_${complaintType}`);
    const { error } = await supabase.from('service_requests').insert({
      customer_id: customerId,
      trigger_type: 'complaint',
      urgency: 'medium',
      description: `${typeLabel}${complaintDesc.trim() ? ': ' + complaintDesc.trim() : ''}`,
      triggered_by: 'customer',
    });
    setSubmitting(false);
    if (!error) {
      setActiveModal(null);
      setComplaintDesc('');
      setComplaintType('taste');
      showToast(t('serviceRequests.successMsg'), 'success');
    } else {
      showToast(t('toast.error'), 'error');
    }
  }

  function formatDateTime(iso: string | null | undefined) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString(isAr ? 'ar-SA' : 'en-US', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  function formatDate(iso: string | null | undefined) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return iso; }
  }

  function formatLocalDate(dateStr: string | null | undefined) {
    if (!dateStr) return '-';
    try {
      const parts = dateStr.split('-').map(Number);
      if (parts.length < 3) return dateStr;
      return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return dateStr; }
  }

  function formatTimeAgo(dateStr: string | null | undefined) {
    if (!dateStr) return '';
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      if (days > 0) return t('time.daysAgo', { count: days });
      if (hours > 0) return t('time.hoursAgo', { count: hours });
      return t('time.minutesAgo', { count: Math.max(1, Math.floor(diff / 60000)) });
    } catch { return ''; }
  }

  const getHealthColor = (percent: number) => {
    const p = typeof percent === 'number' ? percent : 100;
    if (p >= 70) return { bar: 'bg-green-500', text: 'text-green-700', bg: 'bg-green-50' };
    if (p >= 40) return { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' };
    return { bar: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50' };
  };

  const notifTypeConfig: Record<string, { icon: typeof Bell; label: string; color: string; bg: string }> = {
    reminder: { icon: Bell, label: t('customer.notifReminder'), color: 'text-blue-600', bg: 'bg-blue-50' },
    offer: { icon: Gift, label: t('customer.notifOffer'), color: 'text-teal-600', bg: 'bg-teal-50' },
    alert: { icon: AlertTriangle, label: t('customer.notifAlert'), color: 'text-red-600', bg: 'bg-red-50' },
  };

  const complaintTypes = ['taste', 'smell', 'pressure', 'leakage', 'other'] as const;

  const renderModals = () => {
    try {
      if (!activeModal) return null;

      const closeModal = () => {
        setActiveModal(null);
        setEmergencySent(false);
        setRequestDesc('');
        setComplaintDesc('');
      };

      const overlayClass = 'fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4';
      const cardClass = 'bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden';

      if (activeModal === 'request') {
        return (
          <div className={overlayClass} onClick={closeModal}>
            <div className={cardClass} onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-navy to-blue-700 px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Wrench className="w-5 h-5 text-white" />
                  <h2 className="text-white font-bold">{t('serviceRequests.scheduleTitle')}</h2>
                </div>
                <button onClick={closeModal} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t('serviceRequests.serviceTypeLabel')}
                  </label>
                  <select
                    value={requestServiceType}
                    onChange={e => setRequestServiceType(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    {(['type_schedule', 'type_part_due', 'type_followup', 'type_customer_request'] as const).map(key => (
                      <option key={key} value={key}>{t(`serviceRequests.${key}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t('admin.notes')}
                  </label>
                  <textarea
                    value={requestDesc}
                    onChange={e => setRequestDesc(e.target.value)}
                    placeholder={t('serviceRequests.descPlaceholder')}
                    rows={4}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                  />
                </div>
                <button
                  onClick={handleRequestService}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-navy hover:bg-blue-800 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold transition"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {t('serviceRequests.submit')}
                </button>
              </div>
            </div>
          </div>
        );
      }

      if (activeModal === 'emergency') {
        return (
          <div className={overlayClass} onClick={() => !emergencySent && closeModal()}>
            <div className={cardClass} onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertOctagon className="w-5 h-5 text-white" />
                  <h2 className="text-white font-bold">{t('serviceRequests.emergency')}</h2>
                </div>
                <button onClick={closeModal} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {emergencySent ? (
                  <div className="text-center space-y-4 py-2">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    </div>
                    <p className="font-semibold text-slate-800">{t('serviceRequests.emergencySuccess')}</p>
                    <a
                      href="https://wa.me/962778068705"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl text-sm font-bold transition"
                    >
                      <MessageCircle className="w-5 h-5" />
                      {t('serviceRequests.whatsappNow')}
                    </a>
                    <button onClick={closeModal} className="w-full text-sm text-slate-400 hover:text-slate-600 py-2 transition">
                      {t('serviceRequests.dismiss')}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
                      {t('serviceRequests.emergency')} — {t('customer.availableHours')}
                    </div>
                    <a
                      href="https://wa.me/962778068705"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white py-3.5 rounded-xl text-sm font-bold transition"
                    >
                      <MessageCircle className="w-5 h-5" />
                      {t('serviceRequests.whatsappNow')}
                    </a>
                    <button
                      onClick={handleEmergency}
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold transition"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {t('serviceRequests.submit')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      }

      if (activeModal === 'complaint') {
        return (
          <div className={overlayClass} onClick={closeModal}>
            <div className={cardClass} onClick={e => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-white" />
                  <h2 className="text-white font-bold">{t('serviceRequests.complaint')}</h2>
                </div>
                <button onClick={closeModal} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t('serviceRequests.complaintType')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {complaintTypes.map(type => (
                      <button
                        key={type}
                        onClick={() => setComplaintType(type)}
                        className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition text-start ${
                          complaintType === type
                            ? 'bg-amber-50 border-amber-400 text-amber-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {t(`serviceRequests.complaint_${type}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t('admin.notes')}
                  </label>
                  <textarea
                    value={complaintDesc}
                    onChange={e => setComplaintDesc(e.target.value)}
                    placeholder={t('serviceRequests.descPlaceholder')}
                    rows={3}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                  />
                </div>
                <button
                  onClick={handleComplaint}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white py-3 rounded-xl text-sm font-semibold transition"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {t('serviceRequests.submit')}
                </button>
              </div>
            </div>
          </div>
        );
      }

      return null;
    } catch (err) {
      console.error('renderModals error:', err);
      return null;
    }
  };

  const renderServiceReport = () => {
    try {
      if (!selectedReport && !reportLoading) return null;

      /*
        Into <body>: the print rule in index.css hides every child of body
        except this overlay, so nesting it inside #root printed a blank page.
      */
      return createPortal(
        <div
          id="print-report-overlay"
          data-print-overlay
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        >
          {reportLoading ? (
            <div className="bg-white rounded-2xl p-12 flex items-center gap-3">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <span className="text-slate-600">{t('common.loading')}</span>
            </div>
          ) : selectedReport ? (
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="bg-gradient-to-r from-navy to-blue-700 px-6 py-5 rounded-t-2xl no-print">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-white font-bold text-lg">{t('customer.serviceReport')}</h2>
                    <p className="text-blue-200 text-sm mt-0.5">{formatDate(selectedReport.date)}</p>
                  </div>
                  <button
                    onClick={() => setSelectedReport(null)}
                    className="no-print w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition"
                  >
                    <XCircle className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>

              <div id="print-report-content" className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-0.5">{t('customer.appointmentDate')}</p>
                    <p className="text-sm font-semibold text-slate-900">{formatDate(selectedReport.date)}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-0.5">{t('customer.technicianName')}</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedReport.technicianName ?? '-'}</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 col-span-2">
                    <p className="text-xs text-slate-400 mb-0.5">{t('technician.serviceType')}</p>
                    <p className="text-sm font-semibold text-slate-900">{selectedReport.serviceType ?? '-'}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    {t('customer.completedChecklist')}
                  </h3>
                  {(selectedReport.checklist ?? []).length === 0 ? (
                    <p className="text-sm text-slate-400">{t('common.noData')}</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(selectedReport.checklist ?? []).map((item, idx) => (
                        <div key={idx} className={`flex items-center gap-2.5 text-sm rounded-lg px-3 py-2 ${item.completed ? 'bg-green-50 text-green-800' : 'bg-slate-50 text-slate-400'}`}>
                          <CheckCircle className={`w-3.5 h-3.5 flex-shrink-0 ${item.completed ? 'text-green-500' : 'text-slate-300'}`} />
                          <span className={item.completed ? 'font-medium' : 'line-through'}>{item.title ?? ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    {t('customer.partsReplaced')}
                  </h3>
                  {(selectedReport.partsUsed ?? []).length === 0 ? (
                    <p className="text-sm text-slate-400">{t('customer.noPartsUsed')}</p>
                  ) : (
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      {(selectedReport.partsUsed ?? []).map((part, idx) => (
                        <div key={idx} className={`flex items-center justify-between px-4 py-2.5 text-sm ${idx > 0 ? 'border-t border-slate-50' : ''}`}>
                          <span className="text-slate-700 font-medium">{part.part_name ?? '-'}</span>
                          <span className="text-slate-500">×{part.quantity_used ?? 0}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <Droplets className="w-4 h-4 text-teal-600" />
                    {t('customer.tdsReadings')}
                  </h3>
                  {!selectedReport.readings ? (
                    <p className="text-sm text-slate-400">{t('customer.noReadings')}</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                        <p className="text-xs text-red-500 font-medium mb-1">{t('customer.tdsBefore')}</p>
                        <p className="text-2xl font-bold text-red-700">{selectedReport.readings.tds_before ?? '—'}</p>
                        <p className="text-xs text-red-400 mt-0.5">ppm</p>
                      </div>
                      <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                        <p className="text-xs text-green-500 font-medium mb-1">{t('customer.tdsAfter')}</p>
                        <p className="text-2xl font-bold text-green-700">{selectedReport.readings.tds_after ?? '—'}</p>
                        <p className="text-xs text-green-400 mt-0.5">ppm</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-blue-700">{t('customer.nextRecommended')}</p>
                    <p className="text-sm font-bold text-blue-900 mt-0.5">{formatDate(selectedReport.nextServiceDate)}</p>
                  </div>
                </div>
              </div>

              <div className="px-6 pb-6 no-print">
                <button
                  onClick={() => window.print()}
                  className="w-full flex items-center justify-center gap-2 bg-navy hover:bg-blue-800 text-white py-3 rounded-xl text-sm font-semibold transition"
                >
                  <Printer className="w-4 h-4" />
                  {t('customer.printReport')}
                </button>
              </div>
            </div>
          ) : null}
        </div>,
        document.body,
      );
    } catch (err) {
      console.error('renderServiceReport error:', err);
      return null;
    }
  };

  const renderHome = () => {
    try {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t('customer.welcome')}، {profile?.full_name?.split(' ')?.[0] ?? ''}
            </h1>
            <p className="text-slate-500 mt-1">{t('customer.manageServices')}</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (
            <>
              {(pendingApprovals ?? []).map(appt => {
                const action = actionedAppts[appt.id];
                if (action) {
                  return (
                    <div key={appt.id} className={`rounded-2xl p-5 border shadow-sm flex items-center gap-3 ${action === 'approved' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                      {action === 'approved'
                        ? <CheckCircle className="w-6 h-6 text-green-600 shrink-0" />
                        : <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />}
                      <div>
                        <p className={`font-bold text-sm ${action === 'approved' ? 'text-green-900' : 'text-amber-900'}`}>
                          {action === 'approved'
                            ? (isAr ? '✓ وافقت على هذه المهمة' : '✓ You approved this job')
                            : (isAr ? '✕ رفضت هذه المهمة — بانتظار مراجعة المكتب' : '✕ You rejected this job — awaiting admin review')}
                        </p>
                        <p className={`text-xs mt-0.5 ${action === 'approved' ? 'text-green-600' : 'text-amber-600'}`}>
                          {isAr ? 'جاري التحديث...' : 'Updating...'}
                        </p>
                      </div>
                    </div>
                  );
                }
                return (
                <div key={appt.id} className="bg-orange-50 border border-orange-300 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
                      <AlertTriangle className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-orange-900 text-sm">{t('customer.pendingApproval')}</p>
                      <p className="text-xs text-orange-600">{t('customer.approvalRequestFrom')}: {appt.technician_name ?? '-'}</p>
                    </div>
                  </div>
                  <div className="mb-3 text-sm text-orange-800">
                    <p className="font-medium mb-0.5">{appt.service_type ?? ''} — {formatDate(appt.scheduled_at)}</p>
                    {appt.approval_notes ? (
                      <p className="bg-orange-100 rounded-xl px-4 py-2.5 mt-2 text-sm text-orange-900 whitespace-pre-wrap">
                        {appt.approval_notes}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApproval(appt.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-xl text-sm font-semibold transition"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      {t('customer.acceptApproval')}
                    </button>
                    <button
                      onClick={() => { setRejectionModal({ apptId: appt.id, serviceType: appt.service_type }); setRejectionReason(''); }}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-sm font-semibold transition"
                    >
                      <XCircle className="w-4 h-4" />
                      {t('customer.rejectApproval')}
                    </button>
                  </div>
                </div>
                );
              })}

              {customerId ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h2 className="font-bold text-slate-900">{t('customer.quickActions')}</h2>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      onClick={() => setActiveModal('request')}
                      className="flex items-center gap-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl px-4 py-3.5 transition text-start"
                    >
                      <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Wrench className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-blue-900">{t('customer.scheduleService')}</p>
                        <p className="text-xs text-blue-600 mt-0.5">{t('serviceRequests.type_customer_request')}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => { setEmergencySent(false); setActiveModal('emergency'); }}
                      className="flex items-center gap-3 bg-red-50 hover:bg-red-100 border border-red-300 rounded-xl px-4 py-3.5 transition text-start"
                    >
                      <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <AlertOctagon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-red-900">{t('serviceRequests.emergency')}</p>
                        <p className="text-xs text-red-600 mt-0.5">{t('serviceRequests.urgency_emergency')}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setActiveModal('complaint')}
                      className="flex items-center gap-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl px-4 py-3.5 transition text-start"
                    >
                      <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-amber-900">{t('serviceRequests.complaint')}</p>
                        <p className="text-xs text-amber-600 mt-0.5">{t('serviceRequests.complaintType')}</p>
                      </div>
                    </button>
                  </div>
                </div>
              ) : null}

              {nextAppt ? (
                <div className={`rounded-2xl p-5 border shadow-sm ${nextAppt.confirmed ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${nextAppt.confirmed ? 'bg-green-600' : 'bg-blue-600'}`}>
                      <Calendar className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <h2 className={`font-bold text-lg ${nextAppt.confirmed ? 'text-green-900' : 'text-blue-900'}`}>
                        {t('customer.nextAppointment')}
                      </h2>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`font-medium ${nextAppt.confirmed ? 'text-green-700' : 'text-blue-700'}`}>{t('customer.appointmentDate')}:</span>
                          <span className={nextAppt.confirmed ? 'text-green-800' : 'text-blue-800'}>{formatDateTime(nextAppt.scheduled_at)}</span>
                        </div>
                        {nextAppt.technician_name ? (
                          <div className="flex items-center gap-2 text-sm">
                            <span className={`font-medium ${nextAppt.confirmed ? 'text-green-700' : 'text-blue-700'}`}>{t('customer.technicianName')}:</span>
                            <span className={nextAppt.confirmed ? 'text-green-800' : 'text-blue-800'}>{nextAppt.technician_name}</span>
                          </div>
                        ) : null}
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`font-medium ${nextAppt.confirmed ? 'text-green-700' : 'text-blue-700'}`}>{t('technician.serviceType')}:</span>
                          <span className={nextAppt.confirmed ? 'text-green-800' : 'text-blue-800'}>{nextAppt.service_type ?? ''}</span>
                        </div>
                      </div>
                      <div className="mt-4">
                        {nextAppt.confirmed ? (
                          <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                            <CheckCircle className="w-5 h-5" />
                            {t('customer.appointmentConfirmed')}
                          </div>
                        ) : (
                          <button
                            onClick={handleConfirmAppointment}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
                          >
                            {t('customer.confirmAppointment')}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (pendingApprovals ?? []).length === 0 ? (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center">
                  <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">{t('common.noData')}</p>
                </div>
              ) : null}

              {(filters ?? []).length > 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-bold text-slate-900">{t('customer.filterStatus')}</h2>
                    <span className="text-xs text-slate-400">{filters.length} {t('inventory.unit')}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {(filters ?? []).map(filter => {
                      const colors = getHealthColor(filter.health_percent ?? 100);
                      return (
                        <div key={filter.id} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{filter.location ?? ''}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{filter.filter_type ?? ''}</p>
                            </div>
                            <span className={`text-xs font-bold px-2 py-1 rounded-lg ${colors.bg} ${colors.text}`}>
                              {filter.health_percent ?? 100}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-2">
                              <div className={`h-2 rounded-full transition-all ${colors.bar}`} style={{ width: `${filter.health_percent ?? 100}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400">
                              {t('customer.lastReplaced')}: <span className="text-slate-600">{formatLocalDate(filter.last_replaced)}</span>
                            </span>
                            <span className={`font-medium ${colors.text}`}>
                              {t('customer.daysRemaining', { count: filter.days_remaining ?? 0 })}
                            </span>
                          </div>
                          {(filter.days_remaining ?? 0) <= 14 ? (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {t('customer.nextDue')}: {formatLocalDate(filter.next_due)}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {devices.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-bold text-slate-900">{isAr ? 'أجهزتي' : 'My Devices'}</h2>
                    <span className="text-xs text-slate-400">{devices.length} {isAr ? 'جهاز' : 'device(s)'}</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {devices.map(dev => {
                      const warrantyOk = dev.warranty_expires ? new Date(dev.warranty_expires) > new Date() : null;
                      return (
                        <div key={dev.id} className="px-5 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-semibold text-slate-900 text-sm">{dev.device_brand}</span>
                                {dev.device_model && <span className="text-xs text-slate-500">— {dev.device_model}</span>}
                              </div>
                              <div className="space-y-0.5 text-xs text-slate-500">
                                {dev.location_in_premises && <p>{isAr ? 'الموقع:' : 'Location:'} {dev.location_in_premises}</p>}
                                {dev.serial_number && <p>{isAr ? 'رقم التسلسل:' : 'S/N:'} <span className="font-mono">{dev.serial_number}</span></p>}
                                {dev.installation_date && <p>{isAr ? 'تاريخ التركيب:' : 'Installed:'} {formatLocalDate(dev.installation_date)}</p>}
                              </div>
                            </div>
                            {warrantyOk !== null && (
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg shrink-0 ${warrantyOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                {warrantyOk ? (isAr ? 'ضمان ساري' : 'In Warranty') : (isAr ? 'انتهى الضمان' : 'Expired')}
                              </span>
                            )}
                          </div>
                          {dev.warranty_expires && (
                            <p className="text-xs text-slate-400 mt-1.5">
                              {isAr ? 'انتهاء الضمان:' : 'Warranty expires:'} {formatLocalDate(dev.warranty_expires)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TDS History Chart */}
              {tdsHistory.length > 0 && (() => {
                const latest = tdsHistory[tdsHistory.length - 1];
                const improvePct = latest.tds_before && latest.tds_after && latest.tds_before > 0
                  ? Math.round((1 - latest.tds_after / latest.tds_before) * 100)
                  : null;
                const chartData = tdsHistory.map(r => ({
                  date: new Date(r.date).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', { month: 'short', day: 'numeric' }),
                  before: r.tds_before,
                  after: r.tds_after,
                }));
                return (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Droplets className="w-4 h-4 text-teal-600" />
                        <h2 className="font-bold text-slate-900">{isAr ? 'سجل TDS' : 'TDS History'}</h2>
                      </div>
                      {improvePct !== null && (
                        <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-lg">
                          <TrendingDown className="w-3 h-3" />
                          {isAr ? `تحسّن ${improvePct}%` : `${improvePct}% improved`}
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-400 inline-block rounded" />{isAr ? 'قبل' : 'Before'}</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-500 inline-block rounded" />{isAr ? 'بعد' : 'After'}</span>
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                          <Tooltip formatter={(v) => [`${v} ppm`]} />
                          <ReferenceLine y={500} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '500', position: 'right', fontSize: 9, fill: '#ef4444' }} />
                          <ReferenceLine y={150} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: '150', position: 'right', fontSize: 9, fill: '#f59e0b' }} />
                          <ReferenceLine y={50}  stroke="#22c55e" strokeDasharray="4 2" label={{ value: '50',  position: 'right', fontSize: 9, fill: '#22c55e' }} />
                          <Line type="monotone" dataKey="before" stroke="#f87171" strokeWidth={2} dot={{ r: 3 }} name={isAr ? 'قبل' : 'Before'} />
                          <Line type="monotone" dataKey="after"  stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name={isAr ? 'بعد'  : 'After'}  />
                        </LineChart>
                      </ResponsiveContainer>
                      <div className="flex gap-4 mt-3 text-xs text-slate-400 justify-center">
                        <span className="text-red-400">500 = {isAr ? 'حد WHO' : 'WHO limit'}</span>
                        <span className="text-amber-400">150 = {isAr ? 'تنبيه' : 'Alert'}</span>
                        <span className="text-green-500">50 = {isAr ? 'ممتاز' : 'Excellent'}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* My Contract Card */}
              {customerContract && (() => {
                const planLabel: Record<string, { ar: string; en: string }> = {
                  monthly:    { ar: 'شهري',    en: 'Monthly'    },
                  quarterly:  { ar: 'ربع سنوي', en: 'Quarterly'  },
                  biannual:   { ar: 'نصف سنوي', en: 'Bi-Annual'  },
                  annual:     { ar: 'سنوي',    en: 'Annual'     },
                };
                const plan = planLabel[customerContract.plan_type] ?? { ar: customerContract.plan_type, en: customerContract.plan_type };
                const daysLeft = Math.ceil((new Date(customerContract.end_date).getTime() - Date.now()) / 86400000);
                const visitsLeft = customerContract.visits_included - customerContract.visits_used;
                return (
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileCheck className="w-4 h-4 text-navy" />
                        <h2 className="font-bold text-slate-900">{isAr ? 'عقد الخدمة' : 'My Contract'}</h2>
                      </div>
                      <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2.5 py-1 rounded-lg">
                        {isAr ? plan.ar : plan.en}
                      </span>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-xl p-3 text-center">
                          <p className="text-2xl font-bold text-slate-900">{visitsLeft}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'زيارات متبقية' : 'Visits left'}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{isAr ? `من ${customerContract.visits_included}` : `of ${customerContract.visits_included}`}</p>
                        </div>
                        <div className={`rounded-xl p-3 text-center ${daysLeft <= 30 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                          <p className={`text-2xl font-bold ${daysLeft <= 30 ? 'text-amber-600' : 'text-slate-900'}`}>{Math.max(0, daysLeft)}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'يوم حتى التجديد' : 'Days to renewal'}</p>
                          {daysLeft <= 30 && <p className="text-[10px] text-amber-600 font-semibold mt-0.5">{isAr ? 'قريباً' : 'Due soon'}</p>}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>{isAr ? 'انتهاء:' : 'Expires:'} {formatLocalDate(customerContract.end_date)}</span>
                        <span className="text-navy font-semibold">{customerContract.price_jod.toFixed(2)} JOD</span>
                      </div>
                      {daysLeft <= 30 && (
                        <button
                          onClick={() => { setActiveModal('request'); setRequestServiceType('type_customer_request'); }}
                          className="w-full flex items-center justify-center gap-2 bg-navy hover:bg-blue-800 text-white py-2.5 rounded-xl text-sm font-semibold transition"
                        >
                          <Send className="w-4 h-4" />
                          {isAr ? 'طلب تجديد العقد' : 'Request Renewal'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="font-bold text-slate-900">{t('customer.serviceHistory')}</h2>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {t('customer.viewReport')}
                  </span>
                </div>
                {(history ?? []).length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-400">{t('common.noData')}</div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {(history ?? []).map(job => (
                      <div key={job.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50/50 transition">
                        <button
                          onClick={() => loadServiceReport(job)}
                          className="flex-1 min-w-0 text-start"
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDate(job.scheduled_at)}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 truncate">{job.service_type ?? ''}</p>
                          <p className="text-xs text-slate-500">{job.technician_name ?? '-'}</p>
                        </button>
                        {job.invoice ? (
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${job.invoice.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {job.invoice.total_amount.toFixed(2)} JOD
                            </span>
                            <button
                              onClick={() => setSelectedInvoice(job.invoice!.invoiceData)}
                              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              {t('invoice.viewInvoice')}
                            </button>
                          </div>
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" onClick={() => loadServiceReport(job)} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      );
    } catch (err) {
      console.error('renderHome error:', err);
      return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700 text-sm">
          {String(err)}
        </div>
      );
    }
  };

  const renderNotifications = () => {
    try {
      return (
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-slate-900">{t('customer.myNotifications')}</h2>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          ) : (notifications ?? []).length === 0 ? (
            <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
              <BellRing className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium">{t('common.noData')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(notifications ?? []).map(notif => {
                const cfg = notifTypeConfig[notif.type] ?? notifTypeConfig.reminder;
                const Icon = cfg?.icon ?? Bell;
                return (
                  <div
                    key={notif.id}
                    className={`bg-white rounded-2xl p-4 border shadow-sm transition ${notif.is_read ? 'border-slate-100 opacity-75' : 'border-slate-200'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg?.bg ?? 'bg-blue-50'}`}>
                        <Icon className={`w-5 h-5 ${cfg?.color ?? 'text-blue-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-semibold ${cfg?.color ?? 'text-blue-600'}`}>{cfg?.label ?? ''}</span>
                          {!notif.is_read ? <div className="w-2 h-2 bg-blue-500 rounded-full" /> : null}
                        </div>
                        <p className="text-sm text-slate-800 font-medium">{notif.message ?? ''}</p>
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(notif.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    } catch (err) {
      console.error('renderNotifications error:', err);
      return null;
    }
  };

  const renderContact = () => {
    try {
      return (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('customer.needHelp')}</h2>
            <p className="text-slate-500 mt-1">{isAr ? 'مؤسسة الأفضل لتكنولوجيا المياه — مركز خدمة BioFamily المعتمد' : 'Best Co. Water Technology — Authorized BioFamily Service Center'}</p>
          </div>

          {/* Company info card */}
          <div className="bg-navy text-white rounded-2xl p-5 space-y-3">
            <p className="font-bold text-lg">{isAr ? 'مؤسسة الأفضل لتكنولوجيا المياه' : 'Best Co. Water Technology'}</p>
            <div className="flex items-center gap-2 text-blue-200 text-sm">
              <Phone className="w-4 h-4 flex-shrink-0" />
              <span dir="ltr">+962 77 806 8705</span>
            </div>
            <div className="flex items-center gap-2 text-blue-200 text-sm">
              <MessageCircle className="w-4 h-4 flex-shrink-0" />
              <span>{isAr ? 'الهاشمي الشمالي، شارع البطحاء، عمان' : 'Al Hashmi Al Shamali, Al Batha St., Amman'}</span>
            </div>
            <div className="pt-2 border-t border-white/20 flex items-center gap-2 text-green-300 text-sm font-semibold">
              <CheckCircle className="w-4 h-4" />
              {isAr ? '6 فروع في عمّان — مفتوحون دائماً' : '6 branches in Amman — Always Open'}
            </div>
          </div>

          <div className="space-y-4">
            <a
              href="https://wa.me/962778068705"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 bg-green-50 border border-green-200 rounded-2xl p-5 hover:bg-green-100 transition group"
            >
              <div className="w-14 h-14 bg-green-600 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition">
                <MessageCircle className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-green-900 text-lg">{t('customer.whatsappContact')}</p>
                <p className="text-sm text-green-700 mt-0.5" dir="ltr">+962 77 806 8705</p>
                <p className="text-xs text-green-600 mt-0.5">{isAr ? 'رد فوري — متاحون على مدار الساعة' : 'Instant reply — available 24/7'}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-green-400 group-hover:text-green-600" />
            </a>
            <a
              href="tel:+962778068705"
              className="flex items-center gap-4 bg-blue-50 border border-blue-200 rounded-2xl p-5 hover:bg-blue-100 transition group"
            >
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition">
                <Phone className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-blue-900 text-lg">{t('customer.callUs')}</p>
                <p className="text-sm text-blue-700 mt-0.5" dir="ltr">+962 77 806 8705</p>
                <p className="text-xs text-blue-600 mt-0.5">{isAr ? '6 فروع في عمّان — مفتوحون دائماً' : '6 branches in Amman — Always Open'}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-blue-400 group-hover:text-blue-600" />
            </a>
          </div>
        </div>
      );
    } catch (err) {
      console.error('renderContact error:', err);
      return null;
    }
  };

  // If a render error was caught inline, show a fallback
  if (renderError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl border border-red-100 p-8 max-w-md w-full text-center">
          <p className="text-red-600 text-sm font-mono">{renderError}</p>
          <button
            onClick={() => { setRenderError(null); loadData(); }}
            className="mt-4 bg-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">{t('common.errorLoadingData')}</h2>
          <p className="text-xs text-slate-500 font-mono break-all mb-6">{loadError}</p>
          <button
            onClick={loadData}
            className="bg-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-800 transition"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  try {
    return (
      <div className="min-h-screen bg-slate-50 pb-20 sm:pb-8">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {(activeTab === 'home' || activeTab === 'appointments') && renderHome()}
          {activeTab === 'notifications' && renderNotifications()}
          {activeTab === 'contact' && renderContact()}
        </div>

        {(selectedReport || reportLoading) ? renderServiceReport() : null}
        {renderModals()}

        {/* ── Rejection Reason Modal ── */}
        {rejectionModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
              <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 flex items-center justify-between">
                <h2 className="text-white font-bold text-sm">{isAr ? 'سبب الرفض' : 'Reason for Rejection'}</h2>
                <button onClick={() => setRejectionModal(null)} className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition">
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-slate-600 font-medium">{rejectionModal.serviceType}</p>
                <div className="space-y-2">
                  {[
                    isAr ? 'القطع المقترحة غير مناسبة' : 'Parts not appropriate',
                    isAr ? 'التكلفة مرتفعة جداً' : 'Cost is too high',
                    isAr ? 'أحتاج مزيداً من الوقت للتفكير' : 'Need more time to decide',
                    isAr ? 'لديّ ملاحظات أخرى' : 'Other reason',
                  ].map(reason => (
                    <label key={reason} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${rejectionReason === reason ? 'bg-red-50 border-red-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                      <input type="radio" name="rejection-reason" value={reason} checked={rejectionReason === reason} onChange={() => setRejectionReason(reason)} className="w-4 h-4 text-red-500 border-slate-300 focus:ring-red-500" />
                      <span className={`text-sm font-medium ${rejectionReason === reason ? 'text-red-700' : 'text-slate-700'}`}>{reason}</span>
                    </label>
                  ))}
                  <textarea
                    value={rejectionReason && ![isAr ? 'القطع المقترحة غير مناسبة' : 'Parts not appropriate', isAr ? 'التكلفة مرتفعة جداً' : 'Cost is too high', isAr ? 'أحتاج مزيداً من الوقت للتفكير' : 'Need more time to decide', isAr ? 'لديّ ملاحظات أخرى' : 'Other reason'].includes(rejectionReason) ? rejectionReason : ''}
                    onChange={e => setRejectionReason(e.target.value)}
                    placeholder={isAr ? 'أو اكتب سبباً مخصصاً...' : 'Or write a custom reason...'}
                    rows={2}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:ring-2 focus:ring-red-300 outline-none mt-1"
                  />
                </div>
                <button
                  onClick={handleRejection}
                  disabled={!rejectionReason.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-semibold transition"
                >
                  <XCircle className="w-4 h-4" />
                  {isAr ? 'تأكيد الرفض' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedInvoice && (
          <PrintableInvoice invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
        )}

        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 sm:hidden z-40">
          <div className="flex items-center justify-around py-2">
            {([
              { id: 'home' as MobileTab, icon: Home, label: t('customer.mobileNav.home') },
              { id: 'appointments' as MobileTab, icon: CalendarDays, label: t('customer.mobileNav.myAppointments') },
              { id: 'notifications' as MobileTab, icon: BellRing, label: t('customer.mobileNav.myNotifications') },
              { id: 'contact' as MobileTab, icon: Users, label: t('customer.mobileNav.contactUs') },
            ]).map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition ${isActive ? 'text-blue-600' : 'text-slate-400'}`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium">{tab.label ?? ''}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  } catch (err) {
    console.error('CustomerDashboard render error:', err);
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl border border-red-100 p-8 max-w-md w-full text-center">
          <p className="text-red-600 text-sm font-mono">{String(err)}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-navy text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
