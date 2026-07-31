import { useState, useEffect, useCallback } from 'react';
import {
  MapPin, Navigation, Phone, Calendar, Clock, CheckCircle, Package,
  Camera, FileText, ChevronRight, Home, ClipboardList, History,
  Settings, X, Send, WifiOff, Loader2, AlertTriangle,
  Hourglass, ToggleLeft, ToggleRight, CalendarPlus, Receipt, Cpu,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import { fmtLongDate } from '../../lib/format';
import PrintableInvoice, { type InvoiceData } from '../../components/PrintableInvoice';
import VisitTypeBadge from '../../components/VisitTypeBadge';

const DEFAULT_CHECKLIST_AR = [
  'التحقق من ضغط المياه عند المدخل',
  'التحقق من تشغيل وإيقاف مضخة التعزيز',
  'قياس TDS قبل التصفية (ppm)',
  'قياس TDS بعد التصفية (ppm)',
  'استبدال 3 فلاتر أولية',
  'تنظيف الأغلفة قبل تركيب الفلاتر الجديدة',
  'فحص الحلقات المطاطية وتطبيق الشحم الغذائي إذا لزم',
  'إعادة التجميع والتحقق من عدم وجود تسرب',
  'تصريف الفلاتر الجديدة قبل الاستخدام',
];

type JobStatus = 'pending' | 'in_progress' | 'awaiting_approval' | 'completed' | 'cancelled';
type MobileTab = 'home' | 'tasks' | 'history' | 'settings';

interface Job {
  id: string;
  scheduled_at: string;
  service_type: string;
  visit_type: string;
  device_id: string | null;
  device?: {
    device_brand: string;
    device_model: string | null;
    serial_number: string | null;
    location_in_premises: string | null;
  } | null;
  status: JobStatus;
  address: string;
  notes: string;
  confirmed: boolean;
  approval_notes: string;
  approval_granted: boolean;
  customer_id: string;
  customers: { name: string; phone: string; address: string } | null;
}

interface ChecklistItem {
  id: string;
  title: string;
  completed: boolean;
}

interface InventoryPart {
  id: string;
  part_name: string;
  quantity: number;
  unit: string;
  selling_price: number | null;
}

interface HistoryJob {
  id: string;
  scheduled_at: string;
  service_type: string;
  visit_type: string;
  status: JobStatus;
  customers: { name: string } | null;
}

interface FollowupState {
  enabled: boolean;
  days: number;
  reason: string;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getDateKey(iso: string): string {
  return iso.split('T')[0];
}

function getDayLabel(iso: string, isAr: boolean): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const date = new Date(iso);
  date.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return isAr ? 'اليوم' : 'Today';
  if (diff === 1) return isAr ? 'غداً' : 'Tomorrow';
  if (diff <= 7) return date.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { weekday: 'long' });
  return date.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { month: 'long', day: 'numeric' });
}

// ────────────────────────────────────────────────────────────────────────────

export default function TechnicianDashboard() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [jobs, setJobs] = useState<Job[]>([]);
  const [historyJobs, setHistoryJobs] = useState<HistoryJob[]>([]);
  const [inventoryParts, setInventoryParts] = useState<InventoryPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [checklistMap, setChecklistMap] = useState<Record<string, ChecklistItem[]>>({});

  const [activeTab, setActiveTab] = useState<MobileTab>('home');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const [proposedPartsMap, setProposedPartsMap] = useState<Record<string, string[]>>({});
  const [partsMap, setPartsMap] = useState<Record<string, string[]>>({});
  const [tdsMap, setTdsMap] = useState<Record<string, { before: string; after: string }>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [followupMap, setFollowupMap] = useState<Record<string, FollowupState>>({});
  const [nextVisitMap, setNextVisitMap] = useState<Record<string, string>>({});

  const [showSuccess, setShowSuccess] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  interface InvoiceFormData {
    job: Job;
    partsWithPrices: { name: string; quantity: number; unitPrice: string }[];
    laborCost: string;
    paymentMethod: 'cash' | 'bank_transfer' | 'cliq' | 'other';
    paymentStatus: 'paid' | 'pending';
  }
  const [invoiceForm, setInvoiceForm] = useState<InvoiceFormData | null>(null);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [savedInvoiceData, setSavedInvoiceData] = useState<InvoiceData | null>(null);

  const [feedbackModal, setFeedbackModal] = useState({
    open: false,
    feedbackType: 'issue' as 'issue' | 'need_parts' | 'no_access' | 'reschedule',
    description: '',
    urgency: 'normal' as 'normal' | 'high' | 'emergency',
  });
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [returnModal, setReturnModal] = useState({ open: false, reason: '' });
  const [submittingReturn, setSubmittingReturn] = useState(false);

  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function normalise(raw: Record<string, unknown>): any {
    const customers = Array.isArray(raw.customers)
      ? ((raw.customers as Record<string, unknown>[])[0] ?? null)
      : (raw.customers as Record<string, unknown> | null);
    return { ...raw, customers };
  }

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const todayISO = (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); })();

    const [upcomingRes, historyRes, partsRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, scheduled_at, service_type, visit_type, device_id, status, address, notes, confirmed, approval_notes, approval_granted, customer_id, customers(name, phone, address), device:customer_devices(device_brand, device_model, serial_number, location_in_premises)')
        .eq('technician_id', profile.id)
        // Show all non-completed, non-cancelled jobs: includes today/future pending AND
        // any in_progress or awaiting_approval jobs from previous days that weren't finished.
        .not('status', 'in', '("completed","cancelled")')
        .order('scheduled_at'),
      supabase
        .from('appointments')
        .select('id, scheduled_at, service_type, visit_type, status, customers(name)')
        .eq('technician_id', profile.id)
        .lt('scheduled_at', todayISO)
        .eq('status', 'completed')
        .order('scheduled_at', { ascending: false })
        .limit(20),
      supabase.from('inventory').select('id, part_name, quantity, unit, selling_price').order('part_name'),
    ]);

    const normalisedJobs = (upcomingRes.data ?? []).map(normalise) as Job[];
    setJobs(normalisedJobs);
    setHistoryJobs((historyRes.data ?? []).map(normalise) as HistoryJob[]);
    setInventoryParts(partsRes.data ?? []);

    const apptIds = normalisedJobs.map(j => j.id);
    if (apptIds.length > 0) {
      const { data: tasksData } = await supabase
        .from('job_tasks')
        .select('id, appointment_id, title, completed')
        .in('appointment_id', apptIds)
        .order('created_at');
      if (tasksData && tasksData.length > 0) {
        const map: Record<string, ChecklistItem[]> = {};
        for (const task of tasksData) {
          if (!map[task.appointment_id]) map[task.appointment_id] = [];
          map[task.appointment_id].push({ id: task.id, title: task.title, completed: task.completed });
        }
        setChecklistMap(prev => ({ ...prev, ...map }));
      }
    }

    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Realtime subscription: re-fetch when any of this technician's appointments change
  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`tech-appts-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `technician_id=eq.${profile.id}` },
        () => { loadData(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, loadData]);

  async function openJobDetail(job: Job) {
    setSelectedJob(job);
    const { data: tasks, error } = await supabase
      .from('job_tasks')
      .select('id, appointment_id, title, completed')
      .eq('appointment_id', job.id)
      .order('created_at');
    if (error) console.error('Failed to load job tasks:', error.message);
    if (tasks && tasks.length > 0) {
      setChecklistMap(prev => ({
        ...prev,
        [job.id]: tasks.map(t => ({ id: t.id, title: t.title, completed: t.completed })),
      }));
    } else {
      const { data: inserted } = await supabase
        .from('job_tasks')
        .insert(DEFAULT_CHECKLIST_AR.map(title => ({ appointment_id: job.id, title, completed: false })))
        .select('id, appointment_id, title, completed');
      if (inserted) {
        setChecklistMap(prev => ({
          ...prev,
          [job.id]: inserted.map(t => ({ id: t.id, title: t.title, completed: t.completed })),
        }));
      }
    }
  }

  async function refreshSelectedJob() {
    if (!selectedJob) return;
    const { data } = await supabase
      .from('appointments')
      .select('id, scheduled_at, service_type, visit_type, device_id, status, address, notes, confirmed, approval_notes, approval_granted, customer_id, customers(name, phone, address), device:customer_devices(device_brand, device_model, serial_number, location_in_premises)')
      .eq('id', selectedJob.id)
      .single();
    if (data) {
      const updated = normalise(data as Record<string, unknown>) as Job;
      setSelectedJob(updated);
      setJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
    }
  }

  async function updateJobStatus(jobId: string, newStatus: JobStatus) {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j));
    await supabase.from('appointments').update({ status: newStatus }).eq('id', jobId);
    if (newStatus === 'in_progress') {
      const { data: tasks } = await supabase
        .from('job_tasks')
        .select('id, appointment_id, title, completed')
        .eq('appointment_id', jobId)
        .order('created_at');
      if (tasks) {
        setChecklistMap(prev => ({ ...prev, [jobId]: tasks.map(t => ({ id: t.id, title: t.title, completed: t.completed })) }));
      }
    }
  }

  async function toggleChecklistItem(jobId: string, itemId: string) {
    const item = (checklistMap[jobId] ?? []).find(i => i.id === itemId);
    if (!item) return;
    const next = !item.completed;
    setChecklistMap(prev => ({ ...prev, [jobId]: prev[jobId].map(i => i.id === itemId ? { ...i, completed: next } : i) }));
    await supabase.from('job_tasks').update({ completed: next, completed_at: next ? new Date().toISOString() : null }).eq('id', itemId);
  }

  async function handleRequestApproval() {
    if (!selectedJob || !profile?.id) return;
    setSubmitting(true);
    const proposed = proposedPartsMap[selectedJob.id] ?? [];
    const manual = notesMap[selectedJob.id] ?? '';
    const partsLine = proposed.length > 0 ? `القطع المطلوبة: ${proposed.join('، ')}\n` : '';
    const fullNotes = `${partsLine}${manual}`.trim();

    await Promise.all([
      supabase.from('appointments')
        .update({ status: 'awaiting_approval', approval_notes: fullNotes })
        .eq('id', selectedJob.id),
      supabase.from('service_requests').insert({
        customer_id: selectedJob.customer_id,
        trigger_type: 'followup',
        urgency: 'medium',
        description: fullNotes || (isAr ? 'طلب موافقة على تنفيذ الأعمال' : 'Approval requested for work execution'),
        triggered_by: 'technician',
        linked_appointment_id: selectedJob.id,
      }),
    ]);

    setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, status: 'awaiting_approval', approval_notes: fullNotes } : j));
    setSelectedJob(null);
    showToast(t('technician.approvalRequested'), 'success');
    setSubmitting(false);
  }

  async function handleSubmitJob() {
    if (!selectedJob || !profile?.id) return;
    setSubmitting(true);

    const tds = tdsMap[selectedJob.id] ?? { before: '', after: '' };
    const tdsBefore = tds.before ? parseInt(tds.before) : null;
    const tdsAfter = tds.after ? parseInt(tds.after) : null;
    const followup = followupMap[selectedJob.id];
    const nextVisit = nextVisitMap[selectedJob.id] ?? '';

    await supabase.from('appointments').update({
      status: 'completed',
      tds_before: tdsBefore,
      tds_after: tdsAfter,
      followup_recommended: followup?.enabled ?? false,
      followup_days: followup?.enabled ? followup.days : null,
      followup_reason: followup?.enabled ? followup.reason : '',
    }).eq('id', selectedJob.id);

    if (tdsBefore !== null || tdsAfter !== null) {
      await supabase.from('job_readings').insert({ appointment_id: selectedJob.id, tds_before: tdsBefore, tds_after: tdsAfter });
    }

    const parts = partsMap[selectedJob.id] ?? [];
    for (const partName of parts) {
      const part = inventoryParts.find(p => p.part_name === partName);
      if (part) {
        await supabase.from('job_parts').insert({ appointment_id: selectedJob.id, inventory_id: part.id, quantity_used: 1, notes: notesMap[selectedJob.id] ?? '' });
        await supabase.from('inventory').update({ quantity: Math.max(0, part.quantity - 1) }).eq('id', part.id);
      }
    }

    if (tdsAfter !== null && tdsAfter > 150) {
      await supabase.from('service_requests').insert({
        customer_id: selectedJob.customer_id,
        trigger_type: 'test_fail',
        urgency: 'high',
        description: `قياس TDS بعد الصيانة ${tdsAfter} ppm — يتجاوز الحد المقبول`,
        triggered_by: 'technician',
        linked_appointment_id: selectedJob.id,
      });
      showToast(t('technician.tdsHighAlert'), 'warning');
    }

    if (followup?.enabled && selectedJob.customer_id) {
      const suggestedDate = new Date();
      suggestedDate.setDate(suggestedDate.getDate() + followup.days);
      await supabase.from('service_requests').insert({
        customer_id: selectedJob.customer_id,
        trigger_type: 'followup',
        urgency: 'medium',
        description: followup.reason || `زيارة متابعة بعد ${followup.days} يوم`,
        triggered_by: 'technician',
        linked_appointment_id: selectedJob.id,
        suggested_date: suggestedDate.toISOString().split('T')[0],
      });
    }

    if (nextVisit && selectedJob.customer_id) {
      await supabase.from('appointments').insert({
        customer_id: selectedJob.customer_id,
        technician_id: profile.id,
        service_type: 'BioFamily 4-Stage Maintenance / صيانة فلتر 4 مراحل',
        scheduled_at: new Date(nextVisit + 'T09:00:00').toISOString(),
        status: 'pending',
        address: selectedJob.address,
        notes: followup?.reason ? `متابعة: ${followup.reason}` : '',
      });
      const { error: nextApptError } = await supabase
        .from('customers')
        .update({ next_appointment: nextVisit })
        .eq('id', selectedJob.customer_id);
      if (nextApptError) {
        console.error('[TechnicianDashboard] failed to update customer next_appointment:', nextApptError.message);
        showToast(t('toast.error'), 'error');
      } else {
        showToast(t('technician.nextVisitCreated'), 'success');
      }
    }

    await supabase.from('activity_log').insert({
      action: 'appointment_completed',
      description: `تم إكمال ${selectedJob.service_type} — ${selectedJob.customers?.name ?? ''}`,
      user_id: profile.id,
    });

    const completedJob = { ...selectedJob };
    const jobParts = partsMap[selectedJob.id] ?? [];
    setJobs(prev => prev.map(j => j.id === completedJob.id ? { ...j, status: 'completed' } : j));
    setSelectedJob(null);
    setSubmitting(false);
    loadData();

    setInvoiceForm({
      job: completedJob,
      partsWithPrices: jobParts.map(name => ({ name, quantity: 1, unitPrice: '' })),
      laborCost: '',
      paymentMethod: 'cash',
      paymentStatus: 'paid',
    });
  }

  async function generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', `INV-${year}-%`)
      .order('invoice_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    let seq = 1;
    if (data?.invoice_number) {
      const parts = (data.invoice_number as string).split('-');
      seq = parseInt(parts[2] ?? '0', 10) + 1;
    }
    return `INV-${year}-${String(seq).padStart(4, '0')}`;
  }

  async function handleSaveInvoice() {
    if (!invoiceForm || !profile?.id) return;
    setSavingInvoice(true);

    const parts = invoiceForm.partsWithPrices.map(p => ({
      name: p.name,
      quantity: p.quantity,
      unit_price: parseFloat(p.unitPrice) || 0,
    }));
    const partsCost = parts.reduce((s, p) => s + p.unit_price * p.quantity, 0);
    const laborCost = parseFloat(invoiceForm.laborCost) || 0;
    const totalAmount = partsCost + laborCost;

    const { data: custRecord } = await supabase
      .from('customers')
      .select('id')
      .eq('id', invoiceForm.job.customer_id)
      .maybeSingle();

    if (!custRecord) {
      showToast(t('toast.error'), 'error');
      setSavingInvoice(false);
      return;
    }

    const invoiceNumber = await generateInvoiceNumber();

    const { error } = await supabase.from('invoices').insert({
      invoice_number: invoiceNumber,
      appointment_id: invoiceForm.job.id,
      customer_id: invoiceForm.job.customer_id,
      technician_id: profile.id,
      service_type: invoiceForm.job.service_type,
      parts_used: parts,
      labor_cost: laborCost,
      parts_cost: partsCost,
      total_amount: totalAmount,
      payment_method: invoiceForm.paymentMethod,
      payment_status: invoiceForm.paymentStatus,
      issued_at: new Date().toISOString(),
      paid_at: invoiceForm.paymentStatus === 'paid' ? new Date().toISOString() : null,
      created_by: profile.id,
    });

    if (error) {
      showToast(t('toast.error'), 'error');
      setSavingInvoice(false);
      return;
    }

    showToast(t('invoice.savedSuccess'), 'success');
    setSavingInvoice(false);

    const invoiceData: InvoiceData = {
      invoiceNumber,
      issuedAt: new Date().toISOString(),
      customer: {
        name: invoiceForm.job.customers?.name ?? '-',
        address: invoiceForm.job.customers?.address ?? invoiceForm.job.address ?? '-',
        phone: invoiceForm.job.customers?.phone ?? '-',
      },
      technicianName: profile.full_name ?? '-',
      serviceType: invoiceForm.job.service_type,
      serviceDate: invoiceForm.job.scheduled_at,
      parts: invoiceForm.partsWithPrices.map(p => ({
        name: p.name,
        quantity: p.quantity,
        unitPrice: parseFloat(p.unitPrice) || 0,
      })),
      laborCost,
      totalAmount,
      paymentMethod: invoiceForm.paymentMethod,
      paymentStatus: invoiceForm.paymentStatus,
    };

    setInvoiceForm(null);
    setSavedInvoiceData(invoiceData);
  }

  function skipInvoice() {
    setInvoiceForm(null);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
    showToast(t('technician.jobCompleteSuccess'), 'success');
  }

  async function handleSendFeedback() {
    if (!selectedJob || !profile?.id) return;
    setSubmittingFeedback(true);
    const typeLabel: Record<string, string> = {
      issue: isAr ? 'مشكلة مكتشفة' : 'Issue Found',
      need_parts: isAr ? 'يحتاج قطع غيار' : 'Need Parts',
      no_access: isAr ? 'تعذّر الوصول' : 'Cannot Access',
      reschedule: isAr ? 'إعادة جدولة' : 'Reschedule',
    };
    const urgencyMap: Record<string, string> = { normal: 'medium', high: 'high', emergency: 'emergency' };
    const description = `[${typeLabel[feedbackModal.feedbackType]}] ${feedbackModal.description}`;

    await Promise.all([
      supabase.from('service_requests').insert({
        customer_id: selectedJob.customer_id,
        trigger_type: 'followup',
        urgency: urgencyMap[feedbackModal.urgency],
        description,
        triggered_by: 'technician',
        linked_appointment_id: selectedJob.id,
      }),
      supabase.from('appointments').update({
        notes: selectedJob.notes ? `${selectedJob.notes}\n${description}` : description,
      }).eq('id', selectedJob.id),
    ]);

    setFeedbackModal({ open: false, feedbackType: 'issue', description: '', urgency: 'normal' });
    setSubmittingFeedback(false);
    showToast(isAr ? 'تم إرسال الملاحظة للمكتب' : 'Feedback sent to back office', 'success');
  }

  async function handleReturnToAdmin() {
    if (!selectedJob || !profile?.id) return;
    setSubmittingReturn(true);
    const desc = `${isAr ? 'أُعيد للمكتب' : 'Returned to admin'}: ${returnModal.reason}`;

    await Promise.all([
      supabase.from('appointments').update({ status: 'pending' }).eq('id', selectedJob.id),
      supabase.from('activity_log').insert({
        action: 'appointment_returned',
        description: `${isAr ? 'تعذّر إكمال المهمة' : 'Job returned'}: ${returnModal.reason}`,
        user_id: profile.id,
      }),
      supabase.from('service_requests').insert({
        customer_id: selectedJob.customer_id,
        trigger_type: 'followup',
        urgency: 'high',
        description: desc,
        triggered_by: 'technician',
        linked_appointment_id: selectedJob.id,
      }),
    ]);

    setJobs(prev => prev.map(j => j.id === selectedJob.id ? { ...j, status: 'pending' } : j));
    setReturnModal({ open: false, reason: '' });
    setSubmittingReturn(false);
    setSelectedJob(null);
    showToast(isAr ? 'تمت إعادة المهمة للمكتب' : 'Job returned to admin', 'warning');
  }

  // ── Derived stats ────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const todayJobs = jobs.filter(j => getDateKey(j.scheduled_at) === todayStr);
  const completedToday = todayJobs.filter(j => j.status === 'completed').length;
  const totalPartsUsed = Object.values(partsMap).flat().length;

  // ── Date-grouped jobs ────────────────────────────────────────────────────
  const groupedJobs: { label: string; jobs: Job[] }[] = [];
  const seen = new Set<string>();
  for (const job of jobs) {
    const key = getDateKey(job.scheduled_at);
    if (!seen.has(key)) {
      seen.add(key);
      groupedJobs.push({ label: getDayLabel(job.scheduled_at, isAr), jobs: [] });
    }
    groupedJobs[groupedJobs.length - 1].jobs.push(job);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString(isAr ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }
  function formatDate(iso: string) {
    return fmtLongDate(iso, isAr);
  }

  const statusButton = (job: Job) => {
    const cfgs: Record<string, { label: string; next: JobStatus | null; bg: string; hover: string }> = {
      pending: { label: t('technician.startWork'), next: 'in_progress', bg: 'bg-slate-700', hover: 'hover:bg-slate-800' },
      in_progress: { label: t('technician.inExecution'), next: null, bg: 'bg-amber-500', hover: '' },
      awaiting_approval: { label: t('technician.awaitingApproval'), next: null, bg: 'bg-orange-400', hover: '' },
      completed: { label: t('technician.done'), next: null, bg: 'bg-green-600', hover: '' },
      cancelled: { label: t('status.cancelled'), next: null, bg: 'bg-red-500', hover: '' },
    };
    const cfg = cfgs[job.status] ?? cfgs.pending;
    return (
      <button
        onClick={() => {
          if (!cfg.next) return;
          updateJobStatus(job.id, cfg.next);
          if (cfg.next === 'in_progress') {
            openJobDetail({ ...job, status: 'in_progress' });
          }
        }}
        disabled={!cfg.next}
        className={`${cfg.bg} ${cfg.hover} text-white px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-70 flex items-center gap-2`}
      >
        {job.status === 'completed' && <CheckCircle className="w-4 h-4" />}
        {job.status === 'in_progress' && <div className="w-2 h-2 bg-white rounded-full animate-pulse" />}
        {job.status === 'awaiting_approval' && <Hourglass className="w-4 h-4" />}
        {cfg.label}
      </button>
    );
  };

  // ── Render: My Day ───────────────────────────────────────────────────────
  const renderMyDay = () => (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('technician.myDayView')}</h1>
          <p className="text-slate-500 mt-1">
            {t('technician.hey')}، {profile?.full_name?.split(' ')[0] ?? ''} —{' '}
            {isAr
              ? `لديك ${jobs.length} زيارة قادمة`
              : `You have ${jobs.length} upcoming job${jobs.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-xl text-sm font-medium border border-green-100">
          <Navigation className="w-4 h-4" />
          {t('technician.onDuty')}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { val: completedToday, label: isAr ? 'مكتملة اليوم' : 'Done Today', color: 'text-green-600' },
          { val: totalPartsUsed, label: t('technician.partsUsedCount'), color: 'text-blue-600' },
          { val: jobs.length, label: isAr ? 'إجمالي القادمة' : 'Total Upcoming', color: 'text-slate-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-xs text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Current date */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Calendar className="w-4 h-4" />
        {new Date().toLocaleDateString(isAr ? 'ar-SA' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center border border-slate-100 shadow-sm">
          <CheckCircle className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">{isAr ? 'لا توجد زيارات قادمة' : 'No upcoming appointments'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedJobs.map(group => (
            <div key={group.label}>
              {/* Date group header */}
              <div className="flex items-center gap-3 mb-3">
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                  group.label === (isAr ? 'اليوم' : 'Today')
                    ? 'bg-green-600 text-white'
                    : group.label === (isAr ? 'غداً' : 'Tomorrow')
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {group.label}
                </div>
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs text-slate-400">{group.jobs.length} {isAr ? 'زيارة' : 'job(s)'}</span>
              </div>

              {/* Job cards */}
              <div className="space-y-4">
                {group.jobs.map(job => {
                  const isActive = job.status === 'in_progress';
                  const isWaiting = job.status === 'awaiting_approval';
                  const isDone = job.status === 'completed';
                  return (
                    <div
                      key={job.id}
                      className={`bg-white rounded-2xl shadow-sm border overflow-hidden transition-all ${
                        isActive ? 'border-green-200 ring-1 ring-green-100'
                        : isWaiting ? 'border-orange-200 ring-1 ring-orange-100'
                        : isDone ? 'border-slate-100 opacity-70'
                        : 'border-slate-100 hover:shadow-md'
                      }`}
                    >
                      {isActive && (
                        <div className="bg-green-600 px-5 py-1.5 flex items-center gap-2">
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                          <span className="text-white text-xs font-semibold">{t('technician.currentlyActive')}</span>
                        </div>
                      )}
                      {isWaiting && (
                        <div className="bg-orange-500 px-5 py-1.5 flex items-center gap-2">
                          <Hourglass className="w-3 h-3 text-white" />
                          <span className="text-white text-xs font-semibold">{t('technician.awaitingApproval')}</span>
                        </div>
                      )}
                      {job.status === 'pending' && job.notes?.toLowerCase().includes('customer rejected') && (
                        <div className="bg-amber-500 px-5 py-1.5 flex items-center gap-2">
                          <AlertTriangle className="w-3 h-3 text-white" />
                          <span className="text-white text-xs font-semibold">
                            {isAr ? 'رُفض الاقتراح — بانتظار مراجعة المكتب' : 'Proposal rejected — awaiting admin review'}
                          </span>
                        </div>
                      )}
                      {isDone && (
                        <div className="bg-green-50 px-5 py-1.5 flex items-center gap-2 border-b border-green-100">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          <span className="text-green-700 text-xs font-semibold">{isAr ? 'مكتملة' : 'Completed'}</span>
                        </div>
                      )}
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-600">
                                <Clock className="w-3.5 h-3.5" />{formatTime(job.scheduled_at)}
                              </span>
                              <span className="text-xs font-mono text-slate-400">{job.id.slice(0, 8).toUpperCase()}</span>
                            </div>
                            <h3 className="font-bold text-slate-900 text-lg">{job.customers?.name ?? '-'}</h3>
                          </div>
                          {statusButton(job)}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{job.customers?.address || job.address || '-'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <VisitTypeBadge visitType={job.visit_type} size="md" />
                            {job.device && (
                              <span className="flex items-center gap-1 text-xs text-slate-500 truncate">
                                <Cpu className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                {[job.device.device_brand, job.device.serial_number && `SN ${job.device.serial_number}`, job.device.location_in_premises]
                                  .filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </div>
                        </div>
                        {job.notes && (
                          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 mb-3">{job.notes}</p>
                        )}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                            {job.customers?.phone && (
                              <a
                                href={`tel:${job.customers.phone}`}
                                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-green-600 transition bg-slate-50 hover:bg-green-50 px-3 py-1.5 rounded-lg"
                              >
                                <Phone className="w-3.5 h-3.5" />{job.customers.phone}
                              </a>
                            )}
                            {(job.address || job.customers?.address) && (
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address || job.customers?.address || '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 transition bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-medium"
                              >
                                <Navigation className="w-3.5 h-3.5" />{t('technician.openMap')}
                              </a>
                            )}
                          </div>
                          {job.status !== 'completed' && job.status !== 'cancelled' && (
                            <button
                              onClick={() => openJobDetail(job)}
                              className="flex items-center gap-1 text-xs font-semibold text-green-600 hover:text-green-700 transition"
                            >
                              {t('technician.viewDetails')}<ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Render: History ──────────────────────────────────────────────────────
  const renderHistory = () => (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">{t('technician.myHistory')}</h2>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading
          ? <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 text-green-600 animate-spin" /></div>
          : historyJobs.length === 0
          ? <div className="py-10 text-center text-sm text-slate-400">{t('common.noData')}</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('technician.date')}</th>
                    <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('technician.customer')}</th>
                    <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('technician.service')}</th>
                    <th className="text-start px-5 py-3 font-semibold text-slate-600">{t('technician.statusCol')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {historyJobs.map(job => (
                    <tr key={job.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-5 py-3 text-slate-600">{formatDate(job.scheduled_at)}</td>
                      <td className="px-5 py-3 font-medium text-slate-900">{job.customers?.name ?? '-'}</td>
                      <td className="px-5 py-3"><VisitTypeBadge visitType={job.visit_type} /></td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3" />{t('status.completed')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
      <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
        <h3 className="font-semibold text-green-900 mb-4">{t('technician.dailySummary')}</h3>
        <div className="grid grid-cols-3 gap-4">
          {[
            { v: completedToday, l: isAr ? 'مكتملة اليوم' : 'Done Today' },
            { v: totalPartsUsed, l: t('technician.partsUsedCount') },
            { v: jobs.length, l: isAr ? 'قادمة' : 'Upcoming' },
          ].map(s => (
            <div key={s.l} className="text-center">
              <p className="text-2xl font-bold text-green-700">{s.v}</p>
              <p className="text-xs text-green-600 mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Render: Job Detail Modal ─────────────────────────────────────────────
  const renderJobDetail = () => {
    if (!selectedJob) return null;
    const checklist = checklistMap[selectedJob.id] ?? [];
    const notes = notesMap[selectedJob.id] ?? '';
    const isPhase1 = selectedJob.status === 'in_progress' && !selectedJob.approval_granted;
    const isPhase2 = selectedJob.status === 'in_progress' && selectedJob.approval_granted;
    const isAwaiting = selectedJob.status === 'awaiting_approval';
    const proposedParts = proposedPartsMap[selectedJob.id] ?? [];
    const actualParts = partsMap[selectedJob.id] ?? [];
    const tds = tdsMap[selectedJob.id] ?? { before: '', after: '' };
    const followup = followupMap[selectedJob.id] ?? { enabled: false, days: 30, reason: '' };
    const nextVisit = nextVisitMap[selectedJob.id] ?? '';
    const minDate = new Date().toISOString().split('T')[0];

    return (
      <>
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="font-bold text-slate-900">{t('technician.jobDetail')}</h2>
                <p className="text-sm text-slate-500">{selectedJob.customers?.name ?? '-'} — {formatTime(selectedJob.scheduled_at)}</p>
              </div>
              <button onClick={() => setSelectedJob(null)} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            {/* 3-step phase progress */}
            <div className="px-5 pt-4 pb-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-start">
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isPhase1 || isPhase2 || isAwaiting ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {(isPhase2 || isAwaiting) ? <CheckCircle className="w-4 h-4" /> : '1'}
                  </div>
                  <span className={`text-[10px] font-semibold text-center leading-tight ${isPhase1 ? 'text-blue-700' : 'text-slate-400'}`}>{isAr ? 'التقييم' : 'Assessment'}</span>
                </div>
                <div className={`h-0.5 flex-1 mt-4 ${isPhase2 || isAwaiting ? 'bg-blue-400' : 'bg-slate-200'}`} />
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isAwaiting ? 'bg-orange-400 text-white' : isPhase2 ? 'bg-green-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                    {isAwaiting ? <Hourglass className="w-4 h-4" /> : '2'}
                  </div>
                  <span className={`text-[10px] font-semibold text-center leading-tight ${isAwaiting ? 'text-orange-600' : isPhase2 ? 'text-green-700' : 'text-slate-400'}`}>
                    {isAwaiting ? (isAr ? 'انتظار' : 'Waiting') : (isAr ? 'التنفيذ' : 'Work')}
                  </span>
                </div>
                <div className="h-0.5 flex-1 mt-4 bg-slate-200" />
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold bg-slate-200 text-slate-400">3</div>
                  <span className="text-[10px] font-semibold text-center leading-tight text-slate-400">{isAr ? 'الإكمال' : 'Complete'}</span>
                </div>
              </div>
              {isPhase2 && (
                <p className="text-xs text-green-700 text-center mt-2 font-medium">
                  {isAr ? 'وافق العميل — يمكنك البدء بالعمل' : 'Customer approved — proceed with work'}
                </p>
              )}
            </div>

            <div className="p-5 space-y-6">
              {/* Awaiting state */}
              {isAwaiting && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-orange-800 font-semibold text-sm">
                      <Hourglass className="w-4 h-4" />{t('technician.awaitingApproval')}
                    </div>
                    <button
                      onClick={refreshSelectedJob}
                      className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-100 hover:bg-orange-200 border border-orange-200 px-3 py-1.5 rounded-lg font-medium transition"
                    >
                      <Loader2 className="w-3.5 h-3.5" />
                      {isAr ? 'تحقق من الحالة' : 'Check status'}
                    </button>
                  </div>
                  {selectedJob.approval_notes && (
                    <p className="text-sm text-orange-900 whitespace-pre-wrap bg-orange-100 rounded-xl px-4 py-3">{selectedJob.approval_notes}</p>
                  )}
                  <p className="text-xs text-orange-600">
                    {isAr ? 'في انتظار موافقة العميل. اضغط "تحقق من الحالة" بعد تأكيد العميل.' : 'Waiting for customer to approve. Tap "Check status" after the customer confirms.'}
                  </p>
                </div>
              )}

              {/* Checklist */}
              {(isPhase1 || isPhase2) && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-green-600" />{t('technician.checklist')}
                  </h3>
                  {checklist.length === 0
                    ? <p className="text-sm text-slate-400 py-2">{t('common.noData')}</p>
                    : (
                      <div className="space-y-2">
                        {checklist.map(item => (
                          <label key={item.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${item.completed ? 'bg-green-50 border-green-200' : 'bg-white border-slate-100 hover:border-green-200'}`}>
                            <input
                              type="checkbox"
                              checked={item.completed}
                              onChange={() => toggleChecklistItem(selectedJob.id, item.id)}
                              className="w-5 h-5 rounded-md border-slate-300 text-green-600 focus:ring-green-500"
                            />
                            <span className={`text-sm font-medium flex-1 ${item.completed ? 'text-green-700 line-through' : 'text-slate-700'}`}>{item.title}</span>
                            {item.completed && <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />}
                          </label>
                        ))}
                      </div>
                    )}
                </div>
              )}

              {/* Phase 1: Proposed Parts */}
              {isPhase1 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />{t('technician.proposedParts')}
                  </h3>
                  <PartsSelector
                    parts={proposedParts}
                    inventory={inventoryParts}
                    onAdd={val => setProposedPartsMap(prev => ({ ...prev, [selectedJob.id]: [...(prev[selectedJob.id] ?? []), val] }))}
                    onRemove={idx => setProposedPartsMap(prev => ({ ...prev, [selectedJob.id]: prev[selectedJob.id].filter((_, i) => i !== idx) }))}
                    color="blue"
                  />
                </div>
              )}

              {/* Phase 1: Approval Notes */}
              {isPhase1 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-600" />{t('technician.approvalNotes')}
                  </h3>
                  <textarea
                    value={notes}
                    onChange={e => setNotesMap(prev => ({ ...prev, [selectedJob.id]: e.target.value }))}
                    placeholder={t('technician.approvalNotesPlaceholder')}
                    rows={3}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              )}

              {/* Phase 2: Actual Parts Used */}
              {isPhase2 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-green-600" />{t('technician.partsUsed')}
                  </h3>
                  <PartsSelector
                    parts={actualParts}
                    inventory={inventoryParts}
                    onAdd={val => setPartsMap(prev => ({ ...prev, [selectedJob.id]: [...(prev[selectedJob.id] ?? []), val] }))}
                    onRemove={idx => setPartsMap(prev => ({ ...prev, [selectedJob.id]: prev[selectedJob.id].filter((_, i) => i !== idx) }))}
                    color="green"
                  />
                </div>
              )}

              {/* Phase 2: TDS Readings */}
              {isPhase2 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-teal-600" />{t('technician.tdsReadings')}
                  </h3>
                  <div className="bg-teal-50 border border-teal-100 rounded-xl px-3 py-2 mb-3 text-xs text-teal-700 space-y-0.5">
                    <p>{isAr ? 'مرجع جودة المياه في عمّان:' : 'Amman water quality benchmarks:'}</p>
                    <p>• {isAr ? 'ماء الصنبور (عمّان): ~450 ppm (منطقة مياه عسرة)' : 'Amman tap water: ~450 ppm (hard water area)'}</p>
                    <p>• {isAr ? 'حد منظمة الصحة العالمية: 500 ppm' : 'WHO safe limit: 500 ppm'}</p>
                    <p>• {isAr ? 'مخرج BioFamily RO الجيد: أقل من 50 ppm' : 'BioFamily RO good output: <50 ppm'}</p>
                    <p>• {isAr ? 'حد التنبيه: أكثر من 150 ppm → صيانة عاجلة' : 'Alert threshold: >150 ppm → urgent service needed'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('technician.tdsBefore')} <span className="text-slate-400">(~450 ppm)</span></label>
                      <input
                        type="number" min="0"
                        value={tds.before}
                        onChange={e => setTdsMap(prev => ({ ...prev, [selectedJob.id]: { ...(prev[selectedJob.id] ?? { before: '', after: '' }), before: e.target.value } }))}
                        placeholder="450"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('technician.tdsAfter')} <span className="text-slate-400">(&lt;50 ideal)</span></label>
                      <input
                        type="number" min="0"
                        value={tds.after}
                        onChange={e => setTdsMap(prev => ({ ...prev, [selectedJob.id]: { ...(prev[selectedJob.id] ?? { before: '', after: '' }), after: e.target.value } }))}
                        placeholder="0"
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                      />
                    </div>
                  </div>
                  {tds.after && parseInt(tds.after) > 150 && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      {isAr ? 'قراءة TDS مرتفعة (>150 ppm) — سيتم إنشاء طلب صيانة عاجلة تلقائياً' : 'High TDS (>150 ppm) — an urgent service request will be created automatically'}
                    </div>
                  )}
                  {tds.after && parseInt(tds.after) > 0 && parseInt(tds.after) <= 50 && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-green-600 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      {isAr ? 'ممتاز — مخرج BioFamily ضمن المعدل المثالي' : 'Excellent — BioFamily output within ideal range'}
                    </div>
                  )}
                </div>
              )}

              {/* Phase 2: Notes */}
              {isPhase2 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-600" />{t('technician.notesField')}
                  </h3>
                  <textarea
                    value={notes}
                    onChange={e => setNotesMap(prev => ({ ...prev, [selectedJob.id]: e.target.value }))}
                    placeholder={t('technician.notesPlaceholder')}
                    rows={2}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-green-500 outline-none"
                  />
                </div>
              )}

              {/* Phase 2: Follow-up Recommendation */}
              {isPhase2 && (
                <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                      <CalendarPlus className="w-4 h-4 text-blue-600" />{t('technician.followupToggle')}
                    </h3>
                    <button
                      onClick={() => setFollowupMap(prev => ({ ...prev, [selectedJob.id]: { ...(prev[selectedJob.id] ?? { enabled: false, days: 30, reason: '' }), enabled: !followup.enabled } }))}
                      className="text-blue-600"
                    >
                      {followup.enabled ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7 text-slate-400" />}
                    </button>
                  </div>
                  {followup.enabled && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('technician.followupDays')}</label>
                        <select
                          value={followup.days}
                          onChange={e => setFollowupMap(prev => ({ ...prev, [selectedJob.id]: { ...followup, days: parseInt(e.target.value) } }))}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                          {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} {isAr ? 'يوم' : 'days'}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1.5">{t('technician.followupReason')}</label>
                        <input
                          type="text"
                          value={followup.reason}
                          onChange={e => setFollowupMap(prev => ({ ...prev, [selectedJob.id]: { ...followup, reason: e.target.value } }))}
                          placeholder={isAr ? 'سبب زيارة المتابعة...' : 'Reason for follow-up...'}
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Phase 2: Next Visit Scheduler */}
              {isPhase2 && (
                <div className="bg-blue-50 rounded-2xl p-4 space-y-2">
                  <h3 className="font-semibold text-blue-800 text-sm flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" />{t('technician.scheduleNextVisit')}
                  </h3>
                  <input
                    type="date"
                    min={minDate}
                    value={nextVisit}
                    onChange={e => setNextVisitMap(prev => ({ ...prev, [selectedJob.id]: e.target.value }))}
                    className="w-full border border-blue-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  {nextVisit && <p className="text-xs text-blue-600">{isAr ? 'سيتم إنشاء موعد جديد بحالة معلق' : 'A new pending appointment will be created'}</p>}
                </div>
              )}

              {/* Photos placeholder */}
              {isPhase2 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-teal-600" />{t('technician.uploadPhotos')}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>Photo upload requires Supabase Storage configuration.</span>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {(isPhase1 || isPhase2) && (
                <div className="space-y-3">
                  {isPhase1 && (
                    <button onClick={handleRequestApproval} disabled={submitting} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      {t('technician.requestApproval')}
                    </button>
                  )}
                  {isPhase2 && (
                    <button onClick={handleSubmitJob} disabled={submitting} className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      {isAr ? 'إكمال المهمة' : 'Complete Job'}
                    </button>
                  )}
                  <button
                    onClick={() => setFeedbackModal(prev => ({ ...prev, open: true }))}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                    {isAr ? 'إرسال ملاحظة للمكتب' : 'Send Feedback to Back Office'}
                  </button>
                  <button
                    onClick={() => setReturnModal(prev => ({ ...prev, open: true }))}
                    className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <X className="w-4 h-4" />
                    {isAr ? 'تعذّر الإكمال — إعادة للمكتب' : 'Cannot Complete — Return to Admin'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Feedback modal */}
        {feedbackModal.open && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900">{isAr ? 'إرسال ملاحظة للمكتب' : 'Send Feedback to Back Office'}</h3>
                <button onClick={() => setFeedbackModal(prev => ({ ...prev, open: false }))} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{isAr ? 'نوع الملاحظة' : 'Feedback Type'}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { val: 'issue' as const, ar: 'مشكلة مكتشفة', en: 'Issue Found' },
                      { val: 'need_parts' as const, ar: 'يحتاج قطع', en: 'Need Parts' },
                      { val: 'no_access' as const, ar: 'تعذّر الوصول', en: 'Cannot Access' },
                      { val: 'reschedule' as const, ar: 'إعادة جدولة', en: 'Reschedule' },
                    ]).map(opt => (
                      <button key={opt.val} type="button"
                        onClick={() => setFeedbackModal(prev => ({ ...prev, feedbackType: opt.val }))}
                        className={`py-2.5 rounded-xl text-sm font-medium border transition ${feedbackModal.feedbackType === opt.val ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-700 border-slate-200 hover:border-amber-400'}`}
                      >{isAr ? opt.ar : opt.en}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{isAr ? 'التفاصيل' : 'Description'}</label>
                  <textarea
                    value={feedbackModal.description}
                    onChange={e => setFeedbackModal(prev => ({ ...prev, description: e.target.value }))}
                    placeholder={isAr ? 'اكتب التفاصيل هنا...' : 'Write details here...'}
                    rows={3}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">{isAr ? 'الأولوية' : 'Urgency'}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { val: 'normal' as const, ar: 'عادي', en: 'Normal', active: 'bg-green-500 text-white border-green-500' },
                      { val: 'high' as const, ar: 'عالي', en: 'High', active: 'bg-amber-500 text-white border-amber-500' },
                      { val: 'emergency' as const, ar: 'طارئ', en: 'Emergency', active: 'bg-red-500 text-white border-red-500' },
                    ]).map(opt => (
                      <button key={opt.val} type="button"
                        onClick={() => setFeedbackModal(prev => ({ ...prev, urgency: opt.val }))}
                        className={`py-2.5 rounded-xl text-sm font-medium border transition ${feedbackModal.urgency === opt.val ? opt.active : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}
                      >{isAr ? opt.ar : opt.en}</button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleSendFeedback}
                  disabled={submittingFeedback || !feedbackModal.description.trim()}
                  className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2"
                >
                  {submittingFeedback ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {isAr ? 'إرسال' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Return to Admin modal */}
        {returnModal.open && (
          <div className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-900">{isAr ? 'إعادة المهمة للمكتب' : 'Cannot Complete — Return to Admin'}</h3>
                <button onClick={() => setReturnModal(prev => ({ ...prev, open: false }))} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-sm text-slate-600">{isAr ? 'حدد سبب تعذّر إكمال المهمة:' : 'Select reason why the job cannot be completed:'}</p>
                <div className="space-y-2">
                  {[
                    isAr ? 'العميل غير متاح' : 'Customer not available',
                    isAr ? 'القطع غير متوفرة' : 'Parts not available',
                    isAr ? 'تعذّر الوصول' : 'Access denied',
                    isAr ? 'مشكلة تقنية خارج النطاق' : 'Technical issue beyond scope',
                    isAr ? 'العميل طلب إعادة الجدولة' : 'Reschedule requested by customer',
                  ].map(reason => (
                    <label key={reason} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition ${returnModal.reason === reason ? 'bg-red-50 border-red-300' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                      <input type="radio" name="return-reason" value={reason} checked={returnModal.reason === reason} onChange={() => setReturnModal(prev => ({ ...prev, reason }))} className="w-4 h-4 text-red-500 border-slate-300 focus:ring-red-500" />
                      <span className={`text-sm font-medium ${returnModal.reason === reason ? 'text-red-700' : 'text-slate-700'}`}>{reason}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleReturnToAdmin}
                  disabled={submittingReturn || !returnModal.reason}
                  className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2"
                >
                  {submittingReturn ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  {isAr ? 'تأكيد الإعادة' : 'Confirm Return'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // ── Root render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 pb-20 sm:pb-8">
      {isOffline && (
        <div className="bg-amber-500 text-white px-4 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4" />{t('offline.banner')}
        </div>
      )}
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {(activeTab === 'home' || activeTab === 'tasks') && renderMyDay()}
        {activeTab === 'history' && renderHistory()}
        {activeTab === 'settings' && (
          <div className="text-center py-12">
            <Settings className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">{t('nav.settings')}</p>
          </div>
        )}
      </div>

      {selectedJob && renderJobDetail()}

      {/* Invoice creation modal */}
      {invoiceForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-green-600" />
                <h2 className="font-bold text-slate-900">{t('invoice.createInvoice')}</h2>
              </div>
              <button onClick={skipInvoice} className="text-xs text-slate-400 hover:text-slate-600 transition underline">
                {t('invoice.skip')}
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div className="bg-green-50 border border-green-100 rounded-xl p-4 space-y-1 text-sm">
                <p className="font-semibold text-green-900">{invoiceForm.job.customers?.name ?? '-'}</p>
                <p className="text-green-700">{invoiceForm.job.service_type}</p>
                <p className="text-green-600 text-xs">{new Date(invoiceForm.job.scheduled_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}</p>
              </div>

              {invoiceForm.partsWithPrices.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />{t('invoice.partsBreakdown')}
                  </h3>
                  <div className="space-y-2">
                    {invoiceForm.partsWithPrices.map((part, i) => (
                      <div key={i} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                        <span className="flex-1 text-sm text-slate-700 truncate">{part.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-slate-400">×{part.quantity}</span>
                          <div className="relative">
                            <input
                              type="number" min="0" step="0.5"
                              value={part.unitPrice}
                              onChange={e => {
                                const updated = [...invoiceForm.partsWithPrices];
                                updated[i] = { ...updated[i], unitPrice: e.target.value };
                                setInvoiceForm(prev => prev ? { ...prev, partsWithPrices: updated } : null);
                              }}
                              placeholder="0.00"
                              className="w-24 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-end focus:ring-2 focus:ring-green-500 outline-none bg-white"
                            />
                            <span className="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">JOD</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t('invoice.laborCost')}</label>
                <div className="relative">
                  <input
                    type="number" min="0" step="0.5"
                    value={invoiceForm.laborCost}
                    onChange={e => setInvoiceForm(prev => prev ? { ...prev, laborCost: e.target.value } : null)}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-xl px-4 pe-14 py-3 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                  />
                  <span className="absolute end-4 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium pointer-events-none">JOD</span>
                </div>
              </div>

              {(() => {
                const partsCost = invoiceForm.partsWithPrices.reduce((s, p) => s + (parseFloat(p.unitPrice) || 0) * p.quantity, 0);
                const labor = parseFloat(invoiceForm.laborCost) || 0;
                const total = partsCost + labor;
                return total > 0 ? (
                  <div className="flex items-center justify-between bg-navy rounded-xl px-4 py-3 text-white">
                    <span className="font-semibold text-sm">{t('invoice.totalAmount')}</span>
                    <span className="text-xl font-bold">{total.toFixed(2)} JOD</span>
                  </div>
                ) : null;
              })()}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t('invoice.paymentMethod')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['cash', 'bank_transfer', 'cliq', 'other'] as const).map(m => {
                    const labels: Record<string, string> = {
                      cash: isAr ? '💵 نقداً' : '💵 Cash',
                      bank_transfer: isAr ? '🏦 تحويل' : '🏦 Bank Transfer',
                      cliq: isAr ? '📱 كليك' : '📱 Cliq',
                      other: isAr ? '📝 أخرى' : '📝 Other',
                    };
                    return (
                      <button key={m} type="button"
                        onClick={() => setInvoiceForm(prev => prev ? { ...prev, paymentMethod: m } : null)}
                        className={`py-2.5 rounded-xl text-sm font-medium border transition ${invoiceForm.paymentMethod === m ? 'bg-navy text-white border-navy' : 'bg-white text-slate-700 border-slate-200 hover:border-navy'}`}
                      >{labels[m]}</button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t('invoice.paymentStatus')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['paid', 'pending'] as const).map(s => (
                    <button key={s} type="button"
                      onClick={() => setInvoiceForm(prev => prev ? { ...prev, paymentStatus: s } : null)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border transition ${invoiceForm.paymentStatus === s ? (s === 'paid' ? 'bg-green-600 text-white border-green-600' : 'bg-amber-500 text-white border-amber-500') : 'bg-white text-slate-700 border-slate-200'}`}
                    >
                      {s === 'paid' ? (isAr ? '✓ تم الدفع' : '✓ Paid Now') : (isAr ? '⏳ دفع لاحق' : '⏳ Pending')}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSaveInvoice}
                disabled={savingInvoice}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-3.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm"
              >
                {savingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                {t('invoice.createInvoice')}
              </button>
            </div>
          </div>
        </div>
      )}

      {savedInvoiceData && (
        <PrintableInvoice
          invoice={savedInvoiceData}
          onClose={() => {
            setSavedInvoiceData(null);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
          }}
        />
      )}

      {showSuccess && (
        <div className="fixed top-20 inset-x-0 flex justify-center z-50">
          <div className="bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-semibold">
            <CheckCircle className="w-5 h-5" />{t('technician.jobCompleteSuccess')} ✓
          </div>
        </div>
      )}

      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 sm:hidden z-40">
        <div className="flex items-center justify-around py-2">
          {[
            { id: 'home' as MobileTab, icon: Home, label: t('technician.mobileNav.home') },
            { id: 'tasks' as MobileTab, icon: ClipboardList, label: t('technician.mobileNav.myTasks') },
            { id: 'history' as MobileTab, icon: History, label: t('technician.mobileNav.myHistory') },
            { id: 'settings' as MobileTab, icon: Settings, label: t('technician.mobileNav.settings') },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition ${active ? 'text-green-600' : 'text-slate-400'}`}>
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── PartsSelector component ──────────────────────────────────────────────────
function PartsSelector({ parts, inventory, onAdd, onRemove, color }: {
  parts: string[];
  inventory: InventoryPart[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  color: 'blue' | 'green';
}) {
  const ring = color === 'blue' ? 'focus:ring-blue-500' : 'focus:ring-green-500';
  const tagBg = color === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-green-50 text-green-700 border-green-100';
  return (
    <>
      <select
        value=""
        onChange={e => { if (e.target.value && !parts.includes(e.target.value)) onAdd(e.target.value); }}
        className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm bg-white focus:ring-2 ${ring} outline-none`}
      >
        <option value="">— اختر قطعة —</option>
        {inventory.map(p => (
          <option key={p.id} value={p.part_name}>
            {p.part_name} ({p.quantity} {p.unit}){p.selling_price != null ? ` — ${p.selling_price.toFixed(2)} JOD` : ''}
          </option>
        ))}
      </select>
      {parts.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {parts.map((part, idx) => (
            <span key={idx} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${tagBg}`}>
              {part}
              <button onClick={() => onRemove(idx)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
