import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Calendar, CalendarPlus, ClipboardList, Plus, Search, Phone, Mail, Clock,
  AlertTriangle, CheckCircle, Package, ChevronRight, Zap, Wrench, MessageSquare,
  Droplets, HelpCircle, X, Loader2, SlidersHorizontal, Download, ChevronDown,
  ChevronUp, ArrowUpDown, TrendingUp, Receipt, Cpu, UserCog, MessageCircle, Pencil,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import PrintableInvoice, { type InvoiceData } from '../../components/PrintableInvoice';
import AddCustomerModal from '../../components/AddCustomerModal';
import EditCustomerModal from '../../components/EditCustomerModal';
import EditDeviceModal from '../../components/EditDeviceModal';
import AddTechnicianModal from '../../components/AddTechnicianModal';

// ── Types ─────────────────────────────────────────────────────────────────────

type SearchResultItem =
  | { type: 'customer'; id: string; name: string; phone: string }
  | { type: 'appointment'; id: string; customerName: string; serviceType: string; status: string; scheduledAt: string };

type ApptStatusFilter = 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue';
type CustomerChip     = 'all' | 'due_soon' | 'overdue' | 'no_history' | 'has_emergency';
type DateRangePreset  = 'all' | 'today' | 'week' | 'month' | 'custom';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  user_id: string | null;
  last_service_date: string | null;
  next_appointment: string | null;
  contract_type: string | null;
  warranty_expires: string | null;
  device_install_date: string | null;
}

interface InventoryItem {
  id: string;
  part_name: string;
  quantity: number;
  unit: string;
  low_stock_threshold: number;
}

interface Appointment {
  id: string;
  service_type: string;
  scheduled_at: string;
  status: string;
  address: string;
  notes: string;
  approval_notes?: string;
  customer_id: string | null;
  technician_id: string | null;
  customers: { name: string; address: string; phone?: string } | null;
  technician: { full_name: string } | null;
}

interface ServiceRequest {
  id: string;
  trigger_type: string;
  urgency: 'emergency' | 'high' | 'medium' | 'low';
  description: string;
  created_at: string;
  suggested_date: string | null;
  customers: { id: string; name: string; phone: string } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normaliseAppt(raw: Record<string, unknown>): Appointment {
  return {
    ...(raw as unknown as Appointment),
    customers: Array.isArray(raw.customers)
      ? ((raw.customers as { name: string; address: string; phone?: string }[])[0] ?? null)
      : (raw.customers as { name: string; address: string; phone?: string } | null),
    technician: Array.isArray(raw.technician)
      ? ((raw.technician as { full_name: string }[])[0] ?? null)
      : (raw.technician as { full_name: string } | null),
  };
}

function getApptDateBounds(range: DateRangePreset, now: Date, cStart: string, cEnd: string): [string, string] {
  const pad = (d: Date) => d.toISOString().split('T')[0];
  switch (range) {
    case 'all':
      return ['2020-01-01', '2099-12-31'];
    case 'today':
      return [pad(now), pad(new Date(now.getTime() + 86400000))];
    case 'week': {
      const dow = now.getDay() === 0 ? 7 : now.getDay();
      const mon = new Date(now); mon.setDate(now.getDate() - dow + 1); mon.setHours(0, 0, 0, 0);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 7);
      return [pad(mon), pad(sun)];
    }
    case 'month':
      return [
        pad(new Date(now.getFullYear(), now.getMonth(), 1)),
        pad(new Date(now.getFullYear(), now.getMonth() + 1, 1)),
      ];
    case 'custom':
      if (!cStart) return [pad(now), pad(new Date(now.getTime() + 86400000))];
      return [cStart, cEnd ? pad(new Date(new Date(cEnd).getTime() + 86400000)) : pad(new Date(now.getTime() + 86400000))];
  }
}

// ── Service type catalogue ────────────────────────────────────────────────────

const SERVICE_TYPES = [
  'BioFamily 4-Stage Maintenance / صيانة فلتر 4 مراحل',
  'BioFamily 7-Stage Maintenance / صيانة فلتر 7 مراحل',
  'Ruhens Cooler Maintenance / صيانة كولر روهنس',
  'Built-in Cooler Service / صيانة كولر بلت إن',
  'New Installation / تركيب جهاز جديد',
  'Emergency Repair / إصلاح طارئ',
  'TDS Testing & Report / قياس TDS وتقرير',
  'Warranty Service / خدمة ضمان',
  'Follow-up Visit / زيارة متابعة',
] as const;

// Maps service_request.trigger_type → the nearest SERVICE_TYPES entry
const TRIGGER_TO_SERVICE: Record<string, string> = {
  emergency:        'Emergency Repair / إصلاح طارئ',
  complaint:        'BioFamily 4-Stage Maintenance / صيانة فلتر 4 مراحل',
  test_fail:        'TDS Testing & Report / قياس TDS وتقرير',
  followup:         'Follow-up Visit / زيارة متابعة',
  customer_request: 'BioFamily 4-Stage Maintenance / صيانة فلتر 4 مراحل',
  part_due:         'BioFamily 4-Stage Maintenance / صيانة فلتر 4 مراحل',
  schedule:         'BioFamily 4-Stage Maintenance / صيانة فلتر 4 مراحل',
  warranty:         'Warranty Service / خدمة ضمان',
  unknown_history:  'TDS Testing & Report / قياس TDS وتقرير',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  // ── Existing state ──────────────────────────────────────────────────────────
  const [customers, setCustomers]       = useState<Customer[]>([]);
  const [inventory, setInventory]       = useState<InventoryItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stats, setStats]               = useState({ today: 0, pending: 0, completed: 0, overdue: 0 });
  const [showForm, setShowForm]         = useState(false);
  const [apptSearch, setApptSearch]     = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [technicians, setTechnicians]   = useState<{ id: string; full_name: string }[]>([]);

  // Form state
  const [formCustomer, setFormCustomer]             = useState('');
  const [formDate, setFormDate]                     = useState('');
  const [formTechnician, setFormTechnician]         = useState('');
  const [formService, setFormService]               = useState('');
  const [formAddress, setFormAddress]               = useState('');
  const [formNotes, setFormNotes]                   = useState('');
  const [formStatus, setFormStatus]                 = useState('pending');
  const [formServiceRequestId, setFormServiceRequestId] = useState<string | null>(null);

  // Inventory inline editing
  const [editingInventoryId, setEditingInventoryId]   = useState<string | null>(null);
  const [editingInventoryQty, setEditingInventoryQty] = useState(0);

  // ── New search/filter state ─────────────────────────────────────────────────
  const [globalSearch, setGlobalSearch]   = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchOpen, setSearchOpen]       = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const [apptStatusFilter, setApptStatusFilter] = useState<ApptStatusFilter>('all');
  const [apptDateRange, setApptDateRange]       = useState<DateRangePreset>('all');
  const [customStart, setCustomStart]           = useState('');
  const [customEnd, setCustomEnd]               = useState('');

  const [customerFilter, setCustomerFilter] = useState<CustomerChip>('all');

  // Customer typeahead in New Appointment modal
  const [custQuery, setCustQuery]       = useState('');
  const [showCustDrop, setShowCustDrop] = useState(false);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const searchTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapRef    = useRef<HTMLDivElement>(null);
  const custDropRef      = useRef<HTMLDivElement>(null);
  // Keep current date-range values accessible inside the realtime callback without stale closure
  const apptRangeRef     = useRef<DateRangePreset>('all');
  const customStartRef   = useRef('');
  const customEndRef     = useRef('');

  // ── Enhancement state ───────────────────────────────────────────────────────
  const [highlightedApptId, setHighlightedApptId]   = useState<string | null>(null);
  const [techFilterId, setTechFilterId]             = useState<string | null>(null);
  const [custSortBy, setCustSortBy]                 = useState<'name' | 'last_service' | 'next_appointment' | 'urgency'>('name');
  const [custSortDir, setCustSortDir]               = useState<'asc' | 'desc'>('asc');
  const [collapsedUrgencies, setCollapsedUrgencies] = useState<Set<string>>(new Set());
  const [techJobCounts, setTechJobCounts]           = useState<Record<string, number>>({});
  const [conflictWarning, setConflictWarning]       = useState<string | null>(null);
  const [adminTab, setAdminTab]                     = useState<'schedule' | 'customers' | 'service_requests' | 'inventory' | 'invoices'>('schedule');
  const [techInProgressSet, setTechInProgressSet]   = useState<Set<string>>(new Set());

  // Invoice panel state
  interface AdminInvoiceRow {
    id: string;
    invoice_number: string;
    customer_name: string;
    technician_name: string;
    total_amount: number;
    payment_method: string;
    payment_status: string;
    issued_at: string;
    appointment_id: string | null;
    invoiceData?: InvoiceData;
  }
  const [adminInvoices, setAdminInvoices]             = useState<AdminInvoiceRow[]>([]);
  const [adminInvoiceFilter, setAdminInvoiceFilter]   = useState<'all' | 'paid' | 'pending'>('all');
  const [selectedAdminInvoice, setSelectedAdminInvoice] = useState<InvoiceData | null>(null);
  const [markingPaid, setMarkingPaid]                 = useState<string | null>(null);

  interface AdminDevice {
    id: string; device_brand: string; device_model: string | null;
    serial_number: string | null;
    installation_date: string | null; warranty_expires: string | null;
    location_in_premises: string | null;
  }
  const [devicesModal, setDevicesModal] = useState<{ custId: string; custName: string; list: AdminDevice[] } | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [editAdminDevice, setEditAdminDevice] = useState<AdminDevice | null>(null);
  const [expiringContracts, setExpiringContracts] = useState<{ id: string; customer_name: string; end_date: string; plan_type: string }[]>([]);

  // ── Appointment detail modal ─────────────────────────────────────────────
  interface ApptDetailState { appt: Appointment; rescheduleDate: string; reassignTechId: string; submitting: boolean; }
  const [apptDetailModal, setApptDetailModal] = useState<ApptDetailState | null>(null);

  // ── Add Customer / Add Technician modal state ────────────────────────────
  const [showAddCustomer, setShowAddCustomer]     = useState(false);
  const [editCustomer, setEditCustomer]           = useState<Customer | null>(null);
  const [showAddTechnician, setShowAddTechnician] = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadServiceRequests = useCallback(async () => {
    const { data } = await supabase
      .from('service_requests')
      .select('id, trigger_type, urgency, description, created_at, suggested_date, customers(id, name, phone)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(30);

    type RawSR = {
      id: string; trigger_type: string; urgency: string; description: string;
      created_at: string; suggested_date: string | null;
      customers: { id: string; name: string; phone: string } | { id: string; name: string; phone: string }[] | null;
    };
    const urgencyOrder: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
    const sorted = (data ?? []).slice().sort((a: RawSR, b: RawSR) =>
      (urgencyOrder[a.urgency] ?? 4) - (urgencyOrder[b.urgency] ?? 4)
    );
    setServiceRequests((sorted as RawSR[]).map(r => ({
      id: r.id,
      trigger_type: r.trigger_type,
      urgency: r.urgency as ServiceRequest['urgency'],
      description: r.description,
      created_at: r.created_at,
      suggested_date: r.suggested_date,
      customers: Array.isArray(r.customers) ? r.customers[0] ?? null : r.customers,
    })));
  }, []);

  // Fetches technician profiles via SECURITY DEFINER RPC (bypasses profiles RLS).
  // SQL to run once in Supabase SQL Editor:
  //   CREATE OR REPLACE FUNCTION public.get_technicians()
  //   RETURNS TABLE(id uuid, full_name text)
  //   LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  //     SELECT id, full_name FROM profiles WHERE role = 'technician' ORDER BY full_name;
  //   $$;
  //   GRANT EXECUTE ON FUNCTION public.get_technicians() TO authenticated;
  async function loadTechnicians() {
    // Try RPC first; fall back to direct query (works if admin RLS policy is in place)
    const rpcRes = await supabase.rpc('get_technicians');
    if (!rpcRes.error && rpcRes.data) {
      setTechnicians(rpcRes.data as { id: string; full_name: string }[]);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'technician')
      .order('full_name');
    if (error) console.error('[AdminDashboard] loadTechnicians:', error.message);
    setTechnicians(data ?? []);
  }

  async function loadTechJobCounts() {
    const today    = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const { data } = await supabase
      .from('appointments')
      .select('technician_id, status')
      .gte('scheduled_at', today)
      .lt('scheduled_at', tomorrow)
      .not('technician_id', 'is', null)
      .neq('status', 'cancelled');
    if (data) {
      const counts: Record<string, number> = {};
      const inProgress = new Set<string>();
      (data as { technician_id: string; status: string }[]).forEach(r => {
        counts[r.technician_id] = (counts[r.technician_id] ?? 0) + 1;
        if (r.status === 'in_progress') inProgress.add(r.technician_id);
      });
      setTechJobCounts(counts);
      setTechInProgressSet(inProgress);
    }
  }

  const loadAppointments = useCallback(async (range: DateRangePreset, cStart: string, cEnd: string) => {
    if (range === 'custom' && !cStart) return;
    // No profiles join — technician names resolve from the technicians[] state loaded by loadTechnicians().
    // No status filter here — filtering is client-side via apptStatusFilter.
    let q = supabase
      .from('appointments')
      .select('id, service_type, scheduled_at, status, address, notes, approval_notes, customer_id, technician_id, customers(name, address, phone)')
      .order('scheduled_at')
      .limit(200);
    if (range === 'all') {
      // no date filter — return everything
    } else if (range === 'today') {
      const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd   = new Date(); todayEnd.setUTCHours(23, 59, 59, 999);
      q = q.gte('scheduled_at', todayStart.toISOString()).lte('scheduled_at', todayEnd.toISOString());
    } else {
      const [from, to] = getApptDateBounds(range, new Date(), cStart, cEnd);
      q = q.gte('scheduled_at', from).lt('scheduled_at', to);
    }
    const { data, error } = await q;
    if (error) console.error('[loadAppointments]', error.message, error);
    setAppointments((data ?? []).map(r => normaliseAppt(r as unknown as Record<string, unknown>)));
  }, []);

  async function loadInvoices() {
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, payment_method, payment_status, issued_at, appointment_id, parts_used, labor_cost, customer_id, technician_id, customers(name, address, phone), technician:profiles!invoices_technician_id_fkey(full_name), appointments(service_type, scheduled_at)')
      .gte('issued_at', startOfMonth)
      .order('issued_at', { ascending: false })
      .limit(100);

    if (data) {
      type RawInv = Record<string, unknown>;
      const rows: AdminInvoiceRow[] = (data as RawInv[]).map(inv => {
        const cust = Array.isArray(inv.customers) ? (inv.customers as RawInv[])[0] : inv.customers as RawInv | null;
        const tech = Array.isArray(inv.technician) ? (inv.technician as RawInv[])[0] : inv.technician as RawInv | null;
        const appt = Array.isArray(inv.appointments) ? (inv.appointments as RawInv[])[0] : inv.appointments as RawInv | null;
        const parts = (Array.isArray(inv.parts_used) ? inv.parts_used : []) as { name: string; quantity: number; unit_price: number }[];
        const invoiceData: InvoiceData = {
          invoiceNumber: inv.invoice_number as string,
          issuedAt: inv.issued_at as string,
          customer: { name: cust?.name as string ?? '-', address: cust?.address as string ?? '-', phone: cust?.phone as string ?? '-' },
          technicianName: tech?.full_name as string ?? '-',
          serviceType: appt?.service_type as string ?? '-',
          serviceDate: appt?.scheduled_at as string ?? inv.issued_at as string,
          parts: parts.map(p => ({ name: p.name, quantity: p.quantity, unitPrice: p.unit_price })),
          laborCost: inv.labor_cost as number ?? 0,
          totalAmount: inv.total_amount as number ?? 0,
          paymentMethod: inv.payment_method as string ?? 'cash',
          paymentStatus: inv.payment_status as string ?? 'pending',
        };
        return {
          id: inv.id as string,
          invoice_number: inv.invoice_number as string,
          customer_name: cust?.name as string ?? '-',
          technician_name: tech?.full_name as string ?? '-',
          total_amount: inv.total_amount as number ?? 0,
          payment_method: inv.payment_method as string ?? 'cash',
          payment_status: inv.payment_status as string ?? 'pending',
          issued_at: inv.issued_at as string,
          appointment_id: inv.appointment_id as string | null,
          invoiceData,
        };
      });
      setAdminInvoices(rows);
    }
  }

  async function handleMarkPaid(id: string) {
    setMarkingPaid(id);
    const { error } = await supabase.from('invoices').update({ payment_status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (!error) {
      setAdminInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, payment_status: 'paid', invoiceData: inv.invoiceData ? { ...inv.invoiceData, paymentStatus: 'paid' } : undefined } : inv));
      showToast(t('toast.success'), 'success');
    } else {
      showToast(t('toast.error'), 'error');
    }
    setMarkingPaid(null);
  }

  async function loadData() {
    const today    = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    // NOTE: customers and appointments tables currently use open RLS (all authenticated users can read).
    // Tighten to role-scoped policies before production deployment.
    const [custRes, invRes, todayCount, pendingCount, completedCount, overdueCount] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('inventory').select('*').order('part_name'),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('scheduled_at', today).lt('scheduled_at', tomorrow),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('status', 'pending').lt('scheduled_at', today),
    ]);
    if (invRes.error) console.error('[AdminDashboard] inventory:', invRes.error.message);
    setCustomers(custRes.data ?? []);
    setInventory(invRes.data ?? []);
    setStats({
      today:     todayCount.count ?? 0,
      pending:   pendingCount.count ?? 0,
      completed: completedCount.count ?? 0,
      overdue:   overdueCount.count ?? 0,
    });
    loadServiceRequests();
    loadTechJobCounts();
    loadTechnicians();
    loadInvoices();
    loadExpiringContracts();
  }

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    loadAppointments(apptDateRange, customStart, customEnd);
  }, [apptDateRange, customStart, customEnd, loadAppointments]);

  // Keep refs in sync so the realtime callback always uses the current range
  useEffect(() => { apptRangeRef.current = apptDateRange; }, [apptDateRange]);
  useEffect(() => { customStartRef.current = customStart; }, [customStart]);
  useEffect(() => { customEndRef.current = customEnd; }, [customEnd]);

  // Realtime: reload appointments whenever any appointment changes
  useEffect(() => {
    const channel = supabase
      .channel('admin-appointments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' },
        () => { loadAppointments(apptRangeRef.current, customStartRef.current, customEndRef.current); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAppointments]);

  // Close search dropdown and customer typeahead on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (custDropRef.current && !custDropRef.current.contains(e.target as Node)) {
        setShowCustDrop(false);
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // ── Global search ───────────────────────────────────────────────────────────

  function handleGlobalSearch(val: string) {
    setGlobalSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => performSearch(val.trim()), 300);
  }

  async function performSearch(q: string) {
    setSearchLoading(true);
    const ql = q.toLowerCase();

    const custMatches: SearchResultItem[] = customers
      .filter(c => c.name.toLowerCase().includes(ql) || c.phone.includes(q))
      .slice(0, 5)
      .map(c => ({ type: 'customer', id: c.id, name: c.name, phone: c.phone }));

    // Search appointments by service type in DB + customer name from already loaded set
    const [dbAppts] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, service_type, status, scheduled_at, customers(name)')
        .ilike('service_type', `%${q}%`)
        .order('scheduled_at', { ascending: false })
        .limit(5),
    ]);

    const loadedApptMatches: SearchResultItem[] = appointments
      .filter(a =>
        (a.customers?.name ?? '').toLowerCase().includes(ql) ||
        a.service_type.toLowerCase().includes(ql)
      )
      .slice(0, 5)
      .map(a => ({
        type: 'appointment',
        id: a.id,
        customerName: a.customers?.name ?? '-',
        serviceType: a.service_type,
        status: a.status,
        scheduledAt: a.scheduled_at,
      }));

    const dbApptMatches: SearchResultItem[] = ((dbAppts.data ?? []) as Record<string, unknown>[])
      .filter(a => !loadedApptMatches.find(m => m.type === 'appointment' && m.id === a.id))
      .slice(0, 3)
      .map(a => {
        const cust = Array.isArray(a.customers)
          ? (a.customers[0] as { name: string } | undefined)?.name ?? '-'
          : (a.customers as { name: string } | null)?.name ?? '-';
        return {
          type: 'appointment' as const,
          id: a.id as string,
          customerName: cust,
          serviceType: a.service_type as string,
          status: a.status as string,
          scheduledAt: a.scheduled_at as string,
        };
      });

    setSearchResults([...custMatches, ...loadedApptMatches, ...dbApptMatches]);
    setSearchOpen(true);
    setSearchLoading(false);
  }

  function jumpToCustomer(r: SearchResultItem & { type: 'customer' }) {
    setGlobalSearch('');
    setSearchOpen(false);
    setCustomerSearch(r.name);
    setTimeout(() => {
      document.getElementById('customer-list-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function jumpToAppointment(r: SearchResultItem & { type: 'appointment' }) {
    setGlobalSearch('');
    setSearchOpen(false);
    setHighlightedApptId(r.id);
    setApptDateRange('month');
    setTimeout(() => {
      document.getElementById(`appt-row-${r.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    setTimeout(() => setHighlightedApptId(null), 3500);
  }

  // ── Form helpers ────────────────────────────────────────────────────────────

  function closeAppointmentForm() {
    setShowForm(false);
    setFormCustomer('');
    setFormDate('');
    setFormTechnician('');
    setFormService('');
    setFormAddress('');
    setFormNotes('');
    setFormStatus('pending');
    setFormServiceRequestId(null);
    setCustQuery('');
    setShowCustDrop(false);
    setConflictWarning(null);
  }

  async function handleSubmitAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (!formCustomer || !formDate) return;

    const { data: newAppt, error } = await supabase.from('appointments').insert({
      customer_id:   formCustomer,
      technician_id: formTechnician || null,
      service_type:  formService,
      scheduled_at:  formDate,
      status:        formStatus,
      notes:         formNotes,
      address:       formAddress,
    }).select('id').single();

    if (error) { showToast(t('toast.error'), 'error'); return; }

    if (formServiceRequestId && newAppt?.id) {
      await supabase.from('service_requests')
        .update({ status: 'scheduled', linked_appointment_id: newAppt.id })
        .eq('id', formServiceRequestId);
      setServiceRequests(prev => prev.filter(r => r.id !== formServiceRequestId));
    }

    showToast(t('toast.success'), 'success');
    closeAppointmentForm();
    loadData();
    loadAppointments(apptDateRange, customStart, customEnd);
  }

  async function handleDismissRequest(id: string) {
    setDismissingId(id);
    const { error } = await supabase.from('service_requests').update({ status: 'dismissed' }).eq('id', id);
    if (!error) {
      setServiceRequests(prev => prev.filter(r => r.id !== id));
    } else {
      showToast(t('toast.error'), 'error');
    }
    setDismissingId(null);
  }

  function openApptDetail(appt: Appointment) {
    setApptDetailModal({ appt, rescheduleDate: '', reassignTechId: '', submitting: false });
  }

  async function handleModalUpdate(updates: Record<string, unknown>) {
    if (!apptDetailModal) return;
    setApptDetailModal(prev => prev ? { ...prev, submitting: true } : null);
    const { error } = await supabase.from('appointments').update(updates).eq('id', apptDetailModal.appt.id);
    if (!error) {
      setApptDetailModal(null);
      loadAppointments(apptRangeRef.current, customStartRef.current, customEndRef.current);
      showToast(t('toast.success'), 'success');
    } else {
      showToast(t('toast.error'), 'error');
      setApptDetailModal(prev => prev ? { ...prev, submitting: false } : null);
    }
  }

  async function handleSendReminder(cust: Customer) {
    if (!cust.user_id) { showToast(t('toast.noLinkedAccount'), 'warning'); return; }
    const nextDate = cust.next_appointment
      ? new Date(cust.next_appointment).toLocaleDateString('en-GB')
      : '';
    const message = nextDate
      ? `Reminder: Your next service appointment is on ${nextDate}`
      : `Reminder: Please schedule your next service visit`;
    const { error } = await supabase.from('notifications').insert({
      user_id: cust.user_id, type: 'reminder', message, is_read: false,
    });
    if (!error) showToast(t('toast.remindersSent'), 'success');
    else showToast(t('toast.error'), 'error');
  }

  async function handleInventoryUpdate(id: string) {
    const { error } = await supabase.from('inventory').update({ quantity: editingInventoryQty }).eq('id', id);
    if (!error) {
      setInventory(prev => prev.map(i => i.id === id ? { ...i, quantity: editingInventoryQty } : i));
      showToast(t('toast.success'), 'success');
    } else {
      showToast(t('toast.error'), 'error');
    }
    setEditingInventoryId(null);
  }

  function handleScheduleFromRequest(req: ServiceRequest) {
    if (req.customers) {
      setFormCustomer(req.customers.id);
      setCustQuery(req.customers.name);
      const custObj = customers.find(c => c.id === req.customers!.id);
      setFormAddress(custObj?.address ?? '');
    }
    setFormService(TRIGGER_TO_SERVICE[req.trigger_type] ?? '');
    if (req.suggested_date) setFormDate(req.suggested_date + 'T09:00');
    setFormStatus('pending');
    setFormServiceRequestId(req.id);
    setShowForm(true);
  }

  function getSlaLabel(dateStr: string): { label: string; urgent: boolean } {
    const totalMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    const hours = Math.floor(totalMins / 60);
    const days  = Math.floor(hours / 24);
    if (days  >= 1) return { label: `${days}d`,                           urgent: true  };
    if (hours >= 4) return { label: `${hours}h`,                          urgent: true  };
    return { label: hours > 0 ? `${hours}h ${totalMins % 60}m` : `${totalMins}m`, urgent: false };
  }

  function exportCustomersCSV() {
    const headers = [t('admin.customerName'), t('admin.phone'), 'Email', t('admin.lastService'), t('admin.nextAppointment')];
    const rows = filteredCustomers.map(c => [
      c.name, c.phone, c.email, c.last_service_date ?? '', c.next_appointment ?? '',
    ]);
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'customers.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function checkConflict(techId: string, dateTime: string) {
    if (!techId || !dateTime) { setConflictWarning(null); return; }
    const dt   = new Date(dateTime);
    const from = new Date(dt.getTime() - 3600000).toISOString();
    const to   = new Date(dt.getTime() + 3600000).toISOString();
    const { data } = await supabase
      .from('appointments')
      .select('scheduled_at, customers(name)')
      .eq('technician_id', techId)
      .gte('scheduled_at', from)
      .lt('scheduled_at', to)
      .neq('status', 'cancelled')
      .limit(1);
    if (data && data.length > 0) {
      const row = data[0] as { scheduled_at: string; customers: { name: string } | { name: string }[] | null };
      const cName = Array.isArray(row.customers) ? row.customers[0]?.name : row.customers?.name;
      const time  = new Date(row.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setConflictWarning(`${t('admin.technician')} already has a job at ${time}${cName ? ` — ${cName}` : ''}`);
    } else {
      setConflictWarning(null);
    }
  }

  function toggleUrgencySection(urgency: string) {
    setCollapsedUrgencies(prev => {
      const next = new Set(prev);
      if (next.has(urgency)) next.delete(urgency); else next.add(urgency);
      return next;
    });
  }

  async function handleViewDevices(cust: Customer) {
    setDevicesLoading(true);
    setDevicesModal({ custId: cust.id, custName: cust.name, list: [] });
    const { data } = await supabase
      .from('customer_devices')
      .select('id, device_brand, device_model, serial_number, installation_date, warranty_expires, location_in_premises')
      .eq('customer_id', cust.id)
      .order('installation_date', { ascending: false });
    setDevicesModal({
      custId: cust.id,
      custName: cust.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      list: ((data ?? []) as any[]).map(d => ({
        id: d.id, device_brand: d.device_brand, device_model: d.device_model ?? null,
        serial_number: d.serial_number ?? null,
        installation_date: d.installation_date ?? null, warranty_expires: d.warranty_expires ?? null,
        location_in_premises: d.location_in_premises ?? null,
      })),
    });
    setDevicesLoading(false);
  }

  async function refetchDevicesModal() {
    if (!devicesModal) return;
    const { data } = await supabase
      .from('customer_devices')
      .select('id, device_brand, device_model, serial_number, installation_date, warranty_expires, location_in_premises')
      .eq('customer_id', devicesModal.custId)
      .order('installation_date', { ascending: false });
    setDevicesModal(prev => prev ? {
      ...prev,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      list: ((data ?? []) as any[]).map(d => ({
        id: d.id, device_brand: d.device_brand, device_model: d.device_model ?? null,
        serial_number: d.serial_number ?? null,
        installation_date: d.installation_date ?? null, warranty_expires: d.warranty_expires ?? null,
        location_in_premises: d.location_in_premises ?? null,
      })),
    } : null);
  }

  async function loadExpiringContracts() {
    const today = new Date().toISOString().split('T')[0];
    const in30  = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const { data } = await supabase
      .from('contracts')
      .select('id, plan_type, end_date, customers(name)')
      .eq('status', 'active')
      .gte('end_date', today)
      .lte('end_date', in30)
      .order('end_date');
    if (data) {
      setExpiringContracts((data as Record<string, unknown>[]).map(r => {
        const cust = Array.isArray(r.customers)
          ? (r.customers as { name: string }[])[0]?.name ?? '-'
          : (r.customers as { name: string } | null)?.name ?? '-';
        return { id: r.id as string, customer_name: cust, end_date: r.end_date as string, plan_type: r.plan_type as string };
      }));
    }
  }

  function handleQuickSchedule(cust: Customer) {
    setFormCustomer(cust.id);
    setCustQuery(cust.name);
    setShowForm(true);
  }

  // ── Derived / filtered data ─────────────────────────────────────────────────

  const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
    pending:           { label: t('status.pending'),          bg: 'bg-amber-100',  text: 'text-amber-700'  },
    in_progress:       { label: t('status.inProgress'),       bg: 'bg-blue-100',   text: 'text-blue-700'   },
    awaiting_approval: { label: t('status.awaitingApproval'), bg: 'bg-purple-100', text: 'text-purple-700' },
    completed:         { label: t('status.completed'),        bg: 'bg-green-100',  text: 'text-green-700'  },
    cancelled:         { label: t('status.cancelled'),        bg: 'bg-red-100',    text: 'text-red-700'    },
  };

  const now = new Date();

  const filteredAppts = appointments.filter(a => {
    if (techFilterId && a.technician_id !== techFilterId) return false;
    const textQ = apptSearch.trim().toLowerCase();
    if (textQ && !(
      (a.customers?.name ?? '').toLowerCase().includes(textQ) ||
      a.service_type.toLowerCase().includes(textQ) ||
      a.status.toLowerCase().includes(textQ)
    )) return false;
    switch (apptStatusFilter) {
      case 'pending':     return a.status === 'pending';
      case 'in_progress': return a.status === 'in_progress';
      case 'completed':   return a.status === 'completed';
      case 'overdue':     return new Date(a.scheduled_at) < now && (a.status === 'pending' || a.status === 'in_progress');
      default:            return true;
    }
  });

  const emergencyCustomerIds = new Set(
    serviceRequests.filter(r => r.urgency === 'emergency').map(r => r.customers?.id).filter(Boolean) as string[]
  );

  const filteredCustomers = (() => {
    const textQ = customerSearch.trim().toLowerCase();
    let list = textQ
      ? customers.filter(c => c.name.toLowerCase().includes(textQ) || c.phone.includes(textQ))
      : customers;

    list = list.filter(c => {
      switch (customerFilter) {
        case 'all':           return true;
        case 'due_soon': {
          const d = c.next_appointment ? new Date(c.next_appointment) : null;
          if (!d || d <= now) return false;
          return (d.getTime() - now.getTime()) / 86400000 <= 14;
        }
        case 'overdue': {
          const d = c.next_appointment ? new Date(c.next_appointment) : null;
          return d ? d < now : false;
        }
        case 'no_history':     return !c.last_service_date;
        case 'has_emergency':  return emergencyCustomerIds.has(c.id);
        default:               return true;
      }
    });

    return list;
  })();

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    const dir = custSortDir === 'asc' ? 1 : -1;
    switch (custSortBy) {
      case 'last_service':
        return dir * ((a.last_service_date ?? '0').localeCompare(b.last_service_date ?? '0'));
      case 'next_appointment':
        return dir * ((a.next_appointment ?? '9999-12-31').localeCompare(b.next_appointment ?? '9999-12-31'));
      case 'urgency': {
        const score = (c: Customer) =>
          emergencyCustomerIds.has(c.id) ? 0 :
          !c.last_service_date           ? 1 :
          (c.next_appointment && new Date(c.next_appointment) < now) ? 2 : 3;
        return dir * (score(a) - score(b));
      }
      default:
        return dir * a.name.localeCompare(b.name);
    }
  });

  const custDropResults = custQuery.trim()
    ? customers.filter(c =>
        c.name.toLowerCase().includes(custQuery.toLowerCase()) ||
        c.phone.includes(custQuery)
      ).slice(0, 8)
    : [];

  // ── Range label helper ──────────────────────────────────────────────────────
  const rangeLabels: Record<DateRangePreset, string> = {
    all:   t('admin.filterAll'),
    today: t('admin.rangeToday'),
    week:  t('admin.rangeWeek'),
    month: t('admin.rangeMonth'),
    custom: t('admin.rangeCustom'),
  };

  // ── Customer chip label helper ──────────────────────────────────────────────
  const custChipLabel: Record<CustomerChip, string> = {
    all:           t('admin.filterAll'),
    due_soon:      t('admin.filterDueSoon'),
    overdue:       t('admin.overdueAppts'),
    no_history:    t('admin.filterNoHistory'),
    has_emergency: t('admin.filterHasEmergency'),
  };

  // ── Appt chip label helper ──────────────────────────────────────────────────
  const apptChipLabel: Record<ApptStatusFilter, string> = {
    all:        t('admin.filterAll'),
    pending:    statusConfig.pending.label,
    in_progress: statusConfig.in_progress.label,
    completed:  statusConfig.completed.label,
    overdue:    t('admin.overdueAppts'),
  };

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('admin.operationsCenter')}</h1>
            <p className="text-slate-500 mt-1">{t('admin.welcomeBack')}، {profile?.full_name?.split(' ')[0] ?? ''}. {t('admin.manageSubtitle')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Add New Customer */}
            <button
              onClick={() => setShowAddCustomer(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {i18n.language === 'ar' ? 'عميل جديد' : 'New Customer'}
            </button>
            {/* Add New Technician */}
            <button
              onClick={() => setShowAddTechnician(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {i18n.language === 'ar' ? 'فني جديد' : 'New Technician'}
            </button>
            {/* New Appointment */}
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {t('admin.newAppointment')}
            </button>
          </div>
        </div>

        {/* ── Global Search Bar ── */}
        <div className="relative mb-6" ref={searchWrapRef}>
          <div className="relative">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={globalSearch}
              onChange={e => handleGlobalSearch(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
              placeholder={t('admin.globalSearch')}
              className="w-full ps-12 pe-10 py-3 rounded-xl border border-slate-200 bg-white shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            {searchLoading && (
              <Loader2 className="absolute end-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
            )}
            {globalSearch && !searchLoading && (
              <button
                onClick={() => { setGlobalSearch(''); setSearchResults([]); setSearchOpen(false); }}
                className="absolute end-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {searchOpen && (
            <div className="absolute top-full mt-2 inset-x-0 bg-white rounded-xl border border-slate-200 shadow-xl z-50 max-h-80 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="text-sm text-slate-400 px-5 py-4 text-center">{t('admin.noSearchResults')}</p>
              ) : (
                <>
                  {/* Customer results */}
                  {searchResults.some(r => r.type === 'customer') && (
                    <>
                      <div className="px-5 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100 sticky top-0">
                        {t('admin.searchCustomersHeader')}
                      </div>
                      {searchResults.filter(r => r.type === 'customer').map(r =>
                        r.type === 'customer' ? (
                          <button
                            key={r.id}
                            onClick={() => jumpToCustomer(r)}
                            className="w-full text-start px-5 py-3 hover:bg-orange-50 transition flex items-center gap-3 border-b border-slate-50"
                          >
                            <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-xs font-bold text-orange-700 shrink-0">
                              {r.name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                              <p className="text-xs text-slate-500 font-mono" dir="ltr">{r.phone}</p>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 ms-auto" />
                          </button>
                        ) : null
                      )}
                    </>
                  )}

                  {/* Appointment results */}
                  {searchResults.some(r => r.type === 'appointment') && (
                    <>
                      <div className="px-5 py-2 text-xs font-semibold text-slate-500 bg-slate-50 border-b border-slate-100 sticky top-0">
                        {t('admin.searchAppointmentsHeader')}
                      </div>
                      {searchResults.filter(r => r.type === 'appointment').map(r =>
                        r.type === 'appointment' ? (
                          <button
                            key={r.id}
                            onClick={() => jumpToAppointment(r)}
                            className="w-full text-start px-5 py-3 hover:bg-orange-50 transition flex items-center gap-3 border-b border-slate-50 last:border-0"
                          >
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                              <Calendar className="w-4 h-4 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{r.customerName}</p>
                              <p className="text-xs text-slate-500 truncate">
                                {r.serviceType}
                                {r.status && (
                                  <span className={`ms-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusConfig[r.status]?.bg ?? 'bg-slate-100'} ${statusConfig[r.status]?.text ?? 'text-slate-600'}`}>
                                    {statusConfig[r.status]?.label ?? r.status}
                                  </span>
                                )}
                              </p>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          </button>
                        ) : null
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: t('admin.todayAppts'),    value: stats.today,     color: 'text-orange-600', icon: Calendar      },
            { label: t('admin.pendingAppts'),  value: stats.pending,   color: 'text-amber-600',  icon: Clock         },
            { label: t('admin.completedAppts'),value: stats.completed, color: 'text-green-600',  icon: CheckCircle   },
            { label: t('admin.overdueAppts'),  value: stats.overdue,   color: 'text-red-600',    icon: AlertTriangle },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-xs font-medium text-slate-500">{s.label}</span>
                </div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            );
          })}
        </div>

        {/* ── Expiring Contracts Alert ── */}
        {expiringContracts.length > 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="font-semibold text-amber-900 text-sm">
                {expiringContracts.length} {expiringContracts.length === 1 ? 'contract expires' : 'contracts expire'} within 30 days
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {expiringContracts.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1.5 bg-white border border-amber-200 text-amber-800 text-xs font-medium px-3 py-1.5 rounded-lg">
                  {c.customer_name}
                  <span className="text-amber-400">·</span>
                  {new Date(c.end_date).toLocaleDateString('en-GB')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Low Stock Banner ── */}
        {inventory.filter(i => i.quantity < 5).length > 0 && (
          <div
            className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-amber-100 transition"
            onClick={() => setAdminTab('inventory')}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-900">
              ⚠️ {inventory.filter(i => i.quantity < 5).length} {inventory.filter(i => i.quantity < 5).length === 1 ? 'item is' : 'items are'} low on stock — check Inventory tab
            </p>
          </div>
        )}

        {/* ── Daily Summary Bar (today view only) ── */}
        {apptDateRange === 'today' && appointments.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 rounded-2xl px-6 py-3 mb-6">
            <div className="flex items-center gap-1.5 shrink-0">
              <TrendingUp className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-bold text-orange-800">Today</span>
            </div>
            {[
              { label: 'Completed',  value: appointments.filter(a => a.status === 'completed').length,                                                         color: 'bg-green-100 text-green-700'  },
              { label: 'Remaining',  value: appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled').length,                             color: 'bg-orange-100 text-orange-700'},
              { label: 'Unassigned', value: appointments.filter(a => !a.technician_id).length,                                                                  color: 'bg-red-100 text-red-700'      },
              { label: 'On Track',   value: appointments.filter(a => a.status !== 'completed' && a.status !== 'cancelled' && new Date(a.scheduled_at) >= now).length, color: 'bg-blue-100 text-blue-700'    },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className={`text-lg font-bold rounded-lg px-2.5 py-0.5 ${s.color}`}>{s.value}</span>
                <span className="text-xs text-slate-500">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── New Appointment Modal ── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">{t('admin.newAppointment')}</h3>
                <button onClick={closeAppointmentForm} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <form onSubmit={handleSubmitAppointment} className="space-y-4">

                {/* Customer typeahead */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.selectCustomer')}</label>
                  <div className="relative" ref={custDropRef}>
                    <div className="relative">
                      <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={custQuery}
                        onChange={e => {
                          setCustQuery(e.target.value);
                          setShowCustDrop(true);
                          if (formCustomer) setFormCustomer('');
                        }}
                        onFocus={() => { if (custDropResults.length > 0) setShowCustDrop(true); }}
                        placeholder={t('admin.customerSearchPlaceholder')}
                        className={`w-full ps-9 pe-9 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition ${formCustomer ? 'border-green-400 bg-green-50' : 'border-slate-200 bg-slate-50'}`}
                        autoComplete="off"
                      />
                      {formCustomer && (
                        <CheckCircle className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                      )}
                    </div>
                    {showCustDrop && custDropResults.length > 0 && (
                      <div className="absolute top-full mt-1 inset-x-0 bg-white rounded-xl border border-slate-200 shadow-lg z-50 max-h-48 overflow-y-auto">
                        {custDropResults.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setFormCustomer(c.id);
                              setCustQuery(c.name);
                              setFormAddress(c.address || '');
                              setShowCustDrop(false);
                            }}
                            className="w-full text-start px-4 py-2.5 hover:bg-orange-50 transition border-b border-slate-50 last:border-0 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">{c.name}</p>
                              {c.last_service_date && (
                                <p className="text-[10px] text-slate-400">{t('admin.lastService')}: {c.last_service_date}</p>
                              )}
                            </div>
                            <span className="text-xs text-slate-400 font-mono shrink-0" dir="ltr">{c.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {custQuery && !formCustomer && (
                      <p className="text-xs text-amber-600 mt-1">
                        {custDropResults.length === 0 ? t('admin.noSearchResults') : ''}
                      </p>
                    )}
                  </div>
                </div>

                {/* Address — auto-filled from customer, editable */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.address')}</label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={e => setFormAddress(e.target.value)}
                    placeholder="Auto-filled when customer is selected"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.dateTime')}</label>
                  <input
                    type="datetime-local"
                    value={formDate}
                    onChange={e => { setFormDate(e.target.value); checkConflict(formTechnician, e.target.value); }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.selectTechnician')}</label>
                  <select
                    value={formTechnician}
                    onChange={e => { setFormTechnician(e.target.value); checkConflict(e.target.value, formDate); }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">{t('admin.selectTechnician')}</option>
                    {technicians.map(tech => {
                      const jobsToday = techJobCounts[tech.id] ?? 0;
                      return (
                        <option key={tech.id} value={tech.id}>
                          {tech.full_name}{jobsToday > 0 ? ` (${jobsToday} today)` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {conflictWarning && (
                    <div className="flex items-center gap-2 mt-1.5 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      {conflictWarning}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.serviceType')}</label>
                  <select
                    value={formService}
                    onChange={e => setFormService(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">— {t('admin.serviceType')} —</option>
                    {SERVICE_TYPES.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('common.status')}</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="pending">{t('status.pending')}</option>
                    <option value="in_progress">{t('status.inProgress')}</option>
                    <option value="completed">{t('status.completed')}</option>
                    <option value="cancelled">{t('status.cancelled')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('admin.notes')}</label>
                  <textarea
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    rows={2}
                    placeholder={t('admin.notes')}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={!formCustomer}
                    className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl text-sm transition"
                  >
                    {t('common.save')}
                  </button>
                  <button
                    type="button"
                    onClick={closeAppointmentForm}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-sm transition"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Tab Bar ── */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 mb-6">
          {(['schedule', 'customers', 'service_requests', 'inventory', 'invoices'] as const).map(tab => {
            const lowStockCount = inventory.filter(i => i.quantity < 5).length;
            const srCount       = serviceRequests.length;
            const tabLabels: Record<string, string> = {
              schedule:         'Schedule',
              customers:        t('admin.customerList'),
              service_requests: t('serviceRequests.title'),
              inventory:        t('admin.inventoryList'),
              invoices:         t('invoice.allInvoices'),
            };
            return (
              <button
                key={tab}
                onClick={() => setAdminTab(tab)}
                className={`relative flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${adminTab === tab ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tabLabels[tab]}
                {tab === 'inventory' && lowStockCount > 0 && (
                  <span className="absolute -top-1 -end-1 min-w-[1rem] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {lowStockCount > 9 ? '9+' : lowStockCount}
                  </span>
                )}
                {tab === 'service_requests' && srCount > 0 && (
                  <span className="absolute -top-1 -end-1 min-w-[1rem] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {srCount > 9 ? '9+' : srCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Main Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Tab-controlled content */}
          <div className="lg:col-span-2 space-y-6">

            {/* ── Schedule Tab ── */}
            {adminTab === 'schedule' && (
            <div id="schedule-section" className="bg-white rounded-2xl shadow-sm border border-slate-100">

              {/* Section header */}
              <div className="px-6 py-4 border-b border-slate-100 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    Schedule
                    {filteredAppts.length > 0 && (
                      <span className="text-xs font-normal text-slate-400">({filteredAppts.length})</span>
                    )}
                  </h2>
                  <div className="relative">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={apptSearch}
                      onChange={e => setApptSearch(e.target.value)}
                      placeholder={t('admin.searchPlaceholder')}
                      className="ps-9 pe-4 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 w-48"
                    />
                  </div>
                </div>

                {/* Date range tabs */}
                <div className="flex items-center gap-2 flex-wrap">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                    {(['all', 'today', 'week', 'month', 'custom'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setApptDateRange(r)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition whitespace-nowrap ${apptDateRange === r ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {rangeLabels[r]}
                      </button>
                    ))}
                  </div>
                  {apptDateRange === 'custom' && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500 shrink-0">{t('admin.dateFrom')}</span>
                      <input
                        type="date"
                        value={customStart}
                        onChange={e => setCustomStart(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                      <span className="text-slate-500 shrink-0">{t('admin.dateTo')}</span>
                      <input
                        type="date"
                        value={customEnd}
                        min={customStart}
                        onChange={e => setCustomEnd(e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                  )}
                </div>

                {/* Status filter chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  {(['all', 'pending', 'in_progress', 'completed', 'overdue'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setApptStatusFilter(f)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${
                        apptStatusFilter === f
                          ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:text-orange-700'
                      }`}
                    >
                      {apptChipLabel[f]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-start px-6 py-3 text-xs font-semibold text-slate-500">{t('admin.customer')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.address')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.technician')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.time')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredAppts.length > 0 ? filteredAppts.map(appt => {
                      const sc           = statusConfig[appt.status] ?? statusConfig.pending;
                      const isOverdueRow = new Date(appt.scheduled_at) < now && (appt.status === 'pending' || appt.status === 'in_progress');
                      const isEmergency  = appt.customer_id ? emergencyCustomerIds.has(appt.customer_id) : false;
                      const isHighlighted = highlightedApptId === appt.id;
                      return (
                        <tr
                          id={`appt-row-${appt.id}`}
                          key={appt.id}
                          onClick={() => openApptDetail(appt)}
                          className={`cursor-pointer hover:bg-orange-50/30 transition-all ${
                            isHighlighted ? 'bg-yellow-50 ring-2 ring-inset ring-yellow-300' :
                            isEmergency   ? 'bg-red-50/50'    :
                            isOverdueRow  ? 'bg-orange-50/40' : ''
                          }`}
                        >
                          <td className="px-6 py-3 font-medium text-slate-900">
                            <div className="flex items-center gap-1.5">
                              {appt.customers?.name ?? '-'}
                              {isEmergency  && <span className="text-xs leading-none">🚨</span>}
                              {isOverdueRow && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{appt.customers?.address || appt.address || '-'}</td>
                          <td className="px-4 py-3 text-slate-600">{appt.technician?.full_name ?? technicians.find(t => t.id === appt.technician_id)?.full_name ?? t('status.unassigned')}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {new Date(appt.scheduled_at).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${sc.bg} ${sc.text}`}>
                                {sc.label}
                              </span>
                              {appt.status === 'pending' && appt.notes?.toLowerCase().includes('customer rejected') && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-700">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  Needs Review
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">{t('common.noData')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* ── Customers Tab ── */}
            {adminTab === 'customers' && (
            <div id="customer-list-section" className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <div className="px-6 py-4 border-b border-slate-100 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="font-semibold text-slate-900 shrink-0 flex items-center gap-2">
                    {t('admin.customerList')}
                    <span className="text-xs font-normal text-slate-400">({sortedCustomers.length})</span>
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        placeholder={t('admin.searchPlaceholder')}
                        className="ps-9 pe-4 py-1.5 rounded-lg border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 w-40"
                      />
                    </div>
                    {/* Sort controls */}
                    <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                      {([
                        { key: 'name',             label: 'Name'    },
                        { key: 'last_service',      label: 'Last'    },
                        { key: 'next_appointment',  label: 'Next'    },
                        { key: 'urgency',           label: 'Priority'},
                      ] as const).map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => {
                            if (custSortBy === opt.key) setCustSortDir(d => d === 'asc' ? 'desc' : 'asc');
                            else { setCustSortBy(opt.key); setCustSortDir('asc'); }
                          }}
                          className={`flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-semibold transition whitespace-nowrap ${custSortBy === opt.key ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                          {opt.label}
                          {custSortBy === opt.key
                            ? (custSortDir === 'asc' ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />)
                            : <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={exportCustomersCSV}
                      title="Export CSV"
                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-orange-100 flex items-center justify-center text-slate-400 hover:text-orange-600 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Customer filter chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  {(['all', 'due_soon', 'overdue', 'no_history', 'has_emergency'] as const).map(chip => (
                    <button
                      key={chip}
                      onClick={() => setCustomerFilter(chip)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${
                        customerFilter === chip
                          ? chip === 'has_emergency'
                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                            : 'bg-orange-600 text-white border-orange-600 shadow-sm'
                          : chip === 'has_emergency' && emergencyCustomerIds.size > 0
                            ? 'bg-white text-red-600 border-red-200 hover:border-red-400'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-orange-300 hover:text-orange-700'
                      }`}
                    >
                      {custChipLabel[chip]}
                      {chip === 'has_emergency' && emergencyCustomerIds.size > 0 && customerFilter !== 'has_emergency' && (
                        <span className="ms-1.5 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                          {emergencyCustomerIds.size}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-start px-6 py-3 text-xs font-semibold text-slate-500">{t('admin.customerName')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.phone')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.lastService')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.nextAppointment')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">Days</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sortedCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-slate-400">{t('common.noData')}</td>
                      </tr>
                    ) : sortedCustomers.map(cust => {
                      const noHistory = !cust.last_service_date;
                      const nextDate  = cust.next_appointment ? new Date(cust.next_appointment) : null;
                      const isOverdue = nextDate ? nextDate < now : false;
                      const isDueSoon = nextDate && !isOverdue
                        ? (nextDate.getTime() - now.getTime()) / 86400000 <= 14
                        : false;
                      const hasEmergency = emergencyCustomerIds.has(cust.id);
                      const daysUntil    = nextDate
                        ? Math.ceil((nextDate.getTime() - now.getTime()) / 86400000)
                        : null;
                      return (
                        <tr key={cust.id} className={`hover:bg-slate-50/50 transition ${hasEmergency ? 'bg-red-50/20' : ''}`}>
                          <td className="px-6 py-3 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              {cust.name}
                              <div className="flex gap-0.5">
                                {hasEmergency && <span title="Emergency" className="text-sm leading-none">🚨</span>}
                                {noHistory   && <span title={t('serviceRequests.flagNoHistory')} className="text-sm leading-none">🔴</span>}
                                {isOverdue   && <span title={t('serviceRequests.flagOverdue')}   className="text-sm leading-none">🟠</span>}
                                {isDueSoon   && <span title={t('serviceRequests.flagDueSoon')}   className="text-sm leading-none">🟡</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs font-mono" dir="ltr">{cust.phone}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{cust.last_service_date ?? '-'}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            <span className={isOverdue ? 'text-red-500 font-semibold' : isDueSoon ? 'text-amber-600 font-semibold' : ''}>
                              {cust.next_appointment ?? '-'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold">
                            {daysUntil === null ? (
                              <span className="text-slate-400">—</span>
                            ) : daysUntil < 0 ? (
                              <span className="text-red-600">{Math.abs(daysUntil)}d overdue</span>
                            ) : daysUntil === 0 ? (
                              <span className="text-orange-600">Today</span>
                            ) : (
                              <span className={daysUntil <= 7 ? 'text-amber-600' : 'text-slate-500'}>{daysUntil}d</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => handleQuickSchedule(cust)}
                                title={t('admin.newAppointment')}
                                className="w-7 h-7 rounded-lg bg-orange-50 hover:bg-orange-100 flex items-center justify-center text-orange-400 hover:text-orange-600 transition"
                              >
                                <CalendarPlus className="w-3 h-3" />
                              </button>
                              <a
                                href={`tel:${cust.phone}`}
                                title={cust.phone}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-orange-100 flex items-center justify-center text-slate-400 hover:text-orange-600 transition"
                              >
                                <Phone className="w-3 h-3" />
                              </a>
                              <button
                                onClick={() => handleSendReminder(cust)}
                                title={t('reminders.title')}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-orange-100 flex items-center justify-center text-slate-400 hover:text-orange-600 transition"
                              >
                                <Mail className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleViewDevices(cust)}
                                title="View Devices"
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-100 flex items-center justify-center text-slate-400 hover:text-blue-600 transition"
                              >
                                <Cpu className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setEditCustomer(cust)}
                                title={t('common.edit')}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-100 flex items-center justify-center text-slate-400 hover:text-blue-600 transition"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* ── Inventory Tab ── */}
            {adminTab === 'inventory' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" />
                  {t('admin.inventoryList')}
                </h2>
              </div>
              {inventory.filter(i => i.quantity < 5).length > 0 && (
                <div className="mx-5 mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Low Stock — Needs Reorder
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {inventory.filter(i => i.quantity < 5).map(i => (
                      <span key={i.id} className="bg-white border border-red-200 text-red-700 text-xs font-medium px-2.5 py-1 rounded-lg">
                        {i.part_name} — {i.quantity} {i.unit}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="divide-y divide-slate-50 mt-2">
                {inventory.map(item => {
                  const isLow     = item.quantity <= item.low_stock_threshold;
                  const isEditing = editingInventoryId === item.id;
                  return (
                    <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{item.part_name}</p>
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 mt-1">
                            <input
                              type="number"
                              min={0}
                              value={editingInventoryQty}
                              onChange={e => setEditingInventoryQty(Number(e.target.value))}
                              onKeyDown={e => {
                                if (e.key === 'Enter')  handleInventoryUpdate(item.id);
                                if (e.key === 'Escape') setEditingInventoryId(null);
                              }}
                              className="w-16 text-xs border border-orange-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500"
                              autoFocus
                            />
                            <span className="text-xs text-slate-400">{item.unit}</span>
                            <button onClick={() => handleInventoryUpdate(item.id)} className="text-xs text-orange-600 hover:text-orange-700 font-semibold">{t('common.save')}</button>
                            <button onClick={() => setEditingInventoryId(null)} className="text-xs text-slate-400 hover:text-slate-600">{t('common.cancel')}</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingInventoryId(item.id); setEditingInventoryQty(item.quantity); }}
                            className="text-xs text-slate-400 hover:text-orange-600 transition text-start"
                          >
                            {item.quantity} {item.unit}
                          </button>
                        )}
                      </div>
                      {!isEditing && (
                        isLow ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700 shrink-0">
                            <AlertTriangle className="w-3 h-3" />
                            {t('inventory.lowStock')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-green-100 text-green-700 shrink-0">
                            {t('inventory.inStock')}
                          </span>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* ── Invoices Tab ── */}
            {adminTab === 'invoices' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-orange-600" />
                  {t('invoice.allInvoices')}
                  <span className="text-xs font-normal text-slate-400">({t('common.thisMonth')})</span>
                </h2>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                    {(['all', 'paid', 'pending'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setAdminInvoiceFilter(f)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${adminInvoiceFilter === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {f === 'all' ? t('admin.filterAll') : f === 'paid' ? t('invoice.paid') : t('invoice.pending')}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const headers = [t('invoice.invoiceNumber'), t('invoice.customerName'), t('invoice.technicianName'), t('invoice.amount'), t('invoice.paymentMethod'), t('invoice.paymentStatus'), 'Date'];
                      const rows = adminInvoices.map(inv => [inv.invoice_number, inv.customer_name, inv.technician_name, inv.total_amount.toFixed(2), inv.payment_method, inv.payment_status, new Date(inv.issued_at).toLocaleDateString('en-GB')]);
                      const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
                      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url; a.download = 'invoices.csv'; a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t('common.export')}
                  </button>
                </div>
              </div>
              {adminInvoices.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">{t('common.noData')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-start px-5 py-3 text-xs font-semibold text-slate-500">{t('invoice.invoiceNumber')}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.customer')}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.technician')}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('invoice.paymentMethod')}</th>
                        <th className="text-end px-4 py-3 text-xs font-semibold text-slate-500">{t('invoice.amount')}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('invoice.paymentStatus')}</th>
                        <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {adminInvoices
                        .filter(inv => adminInvoiceFilter === 'all' || inv.payment_status === adminInvoiceFilter)
                        .map(inv => (
                          <tr key={inv.id} className="hover:bg-slate-50/50 transition">
                            <td className="px-5 py-3 font-mono text-xs font-semibold text-orange-700">{inv.invoice_number}</td>
                            <td className="px-4 py-3 font-medium text-slate-900">{inv.customer_name}</td>
                            <td className="px-4 py-3 text-slate-600">{inv.technician_name}</td>
                            <td className="px-4 py-3 text-slate-600 capitalize">{inv.payment_method.replace('_', ' ')}</td>
                            <td className="px-4 py-3 text-end font-bold text-slate-900">{inv.total_amount.toFixed(2)} JOD</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${inv.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {inv.payment_status === 'paid' ? t('invoice.paid') : t('invoice.pending')}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {inv.invoiceData && (
                                  <button
                                    onClick={() => setSelectedAdminInvoice(inv.invoiceData!)}
                                    className="text-xs font-medium text-blue-600 hover:text-blue-700 transition flex items-center gap-1"
                                  >
                                    <Receipt className="w-3.5 h-3.5" />
                                    {t('invoice.viewInvoice')}
                                  </button>
                                )}
                                {inv.payment_status !== 'paid' && (
                                  <button
                                    onClick={() => handleMarkPaid(inv.id)}
                                    disabled={markingPaid === inv.id}
                                    className="text-xs font-medium text-green-600 hover:text-green-700 transition flex items-center gap-1 disabled:opacity-50"
                                  >
                                    {markingPaid === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                    {t('invoice.markPaid')}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}

            {/* ── Service Requests Tab ── */}
            {adminTab === 'service_requests' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-600" />
                  {t('serviceRequests.title')}
                  {serviceRequests.length > 0 && (
                    <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      {serviceRequests.length}
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {(['emergency', 'high', 'medium', 'low'] as const).map(urgency => {
                    const count = serviceRequests.filter(r => r.urgency === urgency).length;
                    if (count === 0) return null;
                    const cfg: Record<string, string> = {
                      emergency: 'bg-red-100 text-red-700',
                      high:      'bg-orange-100 text-orange-700',
                      medium:    'bg-amber-100 text-amber-700',
                      low:       'bg-slate-100 text-slate-600',
                    };
                    return (
                      <span key={urgency} className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${cfg[urgency]}`}>
                        {t(`serviceRequests.urgency_${urgency}`)} ({count})
                      </span>
                    );
                  })}
                </div>
              </div>

              {serviceRequests.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">{t('serviceRequests.noRequests')}</div>
              ) : (() => {
                const urgencyStyle: Record<string, { dot: string; badge: string; groupBg: string; groupBorder: string }> = {
                  emergency: { dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700',       groupBg: 'bg-red-50/60',    groupBorder: 'border-red-100'    },
                  high:      { dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', groupBg: 'bg-orange-50/40', groupBorder: 'border-orange-100' },
                  medium:    { dot: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700',   groupBg: '',                groupBorder: 'border-slate-100'  },
                  low:       { dot: 'bg-slate-300',  badge: 'bg-slate-100 text-slate-600',   groupBg: '',                groupBorder: 'border-slate-100'  },
                };
                const triggerIcon: Record<string, typeof Zap> = {
                  emergency: Zap, complaint: MessageSquare, test_fail: Droplets,
                  followup: ChevronRight, customer_request: Wrench, part_due: Package,
                  schedule: CalendarPlus, warranty: HelpCircle, unknown_history: HelpCircle,
                };
                return (
                  <div>
                    {(['emergency', 'high', 'medium', 'low'] as const).map(urgency => {
                      const group = serviceRequests.filter(r => r.urgency === urgency);
                      if (group.length === 0) return null;
                      const style       = urgencyStyle[urgency];
                      const isCollapsed = collapsedUrgencies.has(urgency);
                      return (
                        <div key={urgency} className={`border-b last:border-b-0 ${style.groupBorder}`}>
                          <button
                            onClick={() => toggleUrgencySection(urgency)}
                            className={`w-full flex items-center justify-between px-6 py-3 text-start hover:bg-slate-50/50 transition ${style.groupBg}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${style.badge}`}>
                                {t(`serviceRequests.urgency_${urgency}`)}
                              </span>
                              <span className="text-xs text-slate-500 font-medium">{group.length} request{group.length !== 1 ? 's' : ''}</span>
                            </div>
                            {isCollapsed
                              ? <ChevronDown className="w-4 h-4 text-slate-400" />
                              : <ChevronUp   className="w-4 h-4 text-slate-400" />}
                          </button>
                          {!isCollapsed && (
                            <div className="divide-y divide-slate-50">
                              {group.map(req => {
                                const TriggerIcon = triggerIcon[req.trigger_type] ?? HelpCircle;
                                const sla         = getSlaLabel(req.created_at);
                                return (
                                  <div key={req.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50/50 transition">
                                    <div className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${style.dot}`} />
                                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                      <TriggerIcon className="w-4 h-4 text-slate-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                        <span className="text-xs text-slate-500">
                                          {t(`serviceRequests.${req.trigger_type}`) || req.trigger_type}
                                        </span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${sla.urgent ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                          <Clock className="w-2.5 h-2.5" />
                                          {sla.label}
                                        </span>
                                      </div>
                                      <p className="text-sm font-semibold text-slate-900">{req.customers?.name ?? '-'}</p>
                                      {req.customers?.phone && (
                                        <p className="text-xs text-slate-500 font-mono" dir="ltr">{req.customers.phone}</p>
                                      )}
                                      {req.description && (
                                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">{req.description}</p>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-2 flex-shrink-0">
                                      <button
                                        onClick={() => handleScheduleFromRequest(req)}
                                        className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition whitespace-nowrap"
                                      >
                                        <CalendarPlus className="w-3.5 h-3.5" />
                                        {t('admin.newAppointment')}
                                      </button>
                                      <button
                                        onClick={() => handleDismissRequest(req.id)}
                                        disabled={dismissingId === req.id}
                                        className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-lg transition whitespace-nowrap"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                        {t('serviceRequests.dismiss')}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
            )}

          </div>

          {/* ── Right column — Field Team ── */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">{t('admin.fieldTeam')}</h2>
                {techFilterId && (
                  <button
                    onClick={() => setTechFilterId(null)}
                    className="text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Clear filter
                  </button>
                )}
              </div>
              <div className="p-3 space-y-1">
                {technicians.length > 0 ? technicians.map(tech => {
                  const jobsToday   = techJobCounts[tech.id] ?? 0;
                  const isOnJob     = techInProgressSet.has(tech.id);
                  const dotColor    = isOnJob ? 'bg-red-500' : jobsToday >= 1 ? 'bg-amber-500' : 'bg-green-500';
                  const statusLabel = isOnJob ? 'On Job' : jobsToday >= 1 ? 'Busy' : 'Free';
                  const statusColor = isOnJob ? 'text-red-600' : jobsToday >= 1 ? 'text-amber-600' : 'text-green-600';
                  const isActive    = techFilterId === tech.id;
                  return (
                    <button
                      key={tech.id}
                      onClick={() => { setTechFilterId(isActive ? null : tech.id); if (!isActive) setAdminTab('schedule'); }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-start ${isActive ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-slate-50'}`}
                    >
                      <div className="relative shrink-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${isActive ? 'bg-orange-600 text-white' : 'bg-orange-100 text-orange-700'}`}>
                          {tech.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <span className={`absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full border-2 border-white ${dotColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{tech.full_name}</p>
                        <p className="text-[10px] text-slate-400">{jobsToday} job{jobsToday !== 1 ? 's' : ''} today</p>
                      </div>
                      <span className={`text-xs font-semibold ${statusColor} shrink-0`}>{statusLabel}</span>
                    </button>
                  );
                }) : (
                  <p className="text-sm text-slate-400 p-3">{t('common.noData')}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Appointment Detail Modal ── */}
        {apptDetailModal && (() => {
          const { appt, rescheduleDate, reassignTechId, submitting } = apptDetailModal;
          const sc = statusConfig[appt.status] ?? statusConfig.pending;
          const techName = appt.technician?.full_name ?? technicians.find(t => t.id === appt.technician_id)?.full_name ?? t('status.unassigned');
          const isNeedsReview = appt.status === 'pending' && !!appt.notes?.toLowerCase().includes('customer rejected');
          const isAwaiting    = appt.status === 'awaiting_approval';
          const isAr = i18n.language === 'ar';
          const rejectionText = isNeedsReview ? (appt.notes ?? '') : '';
          return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setApptDetailModal(null)}>
              <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
                  <div>
                    <h2 className="font-bold text-slate-900">{appt.customers?.name ?? '-'}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{appt.service_type}</p>
                  </div>
                  <button onClick={() => setApptDetailModal(null)} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
                    <X className="w-4 h-4 text-slate-600" />
                  </button>
                </div>

                <div className="p-5 space-y-4">

                  {/* Needs Review banner */}
                  {isNeedsReview && (
                    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <p className="font-bold text-amber-900 text-sm">{isAr ? 'رُفض الاقتراح من العميل — يتطلب المراجعة' : 'Customer rejected this proposal — review required'}</p>
                      </div>
                      {rejectionText && (
                        <p className="text-sm text-amber-800 bg-amber-100 rounded-xl px-4 py-2.5 whitespace-pre-wrap">{rejectionText}</p>
                      )}
                    </div>
                  )}

                  {/* Awaiting approval banner */}
                  {isAwaiting && (
                    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-orange-600 shrink-0" />
                        <p className="font-semibold text-orange-900 text-sm">{isAr ? 'في انتظار موافقة العميل' : 'Awaiting customer approval'}</p>
                      </div>
                      {appt.approval_notes && (
                        <p className="text-sm text-orange-800 bg-orange-100 rounded-xl px-4 py-2.5 mt-2 whitespace-pre-wrap">{appt.approval_notes}</p>
                      )}
                    </div>
                  )}

                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 mb-0.5">{t('admin.time')}</p>
                      <p className="text-sm font-semibold text-slate-900">
                        {new Date(appt.scheduled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-slate-500">{new Date(appt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 mb-0.5">{t('common.status')}</p>
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${sc.bg} ${sc.text}`}>{sc.label}</span>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 mb-0.5">{t('admin.technician')}</p>
                      <p className="text-sm font-semibold text-slate-900">{techName}</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 mb-0.5">{t('admin.address')}</p>
                      <p className="text-sm font-semibold text-slate-900 truncate">{appt.customers?.address || appt.address || '-'}</p>
                    </div>
                  </div>

                  {/* Contact row */}
                  {appt.customers?.phone && (
                    <div className="flex gap-2">
                      <a href={`tel:${appt.customers.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-semibold transition">
                        <Phone className="w-3.5 h-3.5" />{appt.customers.phone}
                      </a>
                      <a
                        href={`https://wa.me/${appt.customers.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Regarding your appointment: ${appt.service_type}`)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl text-xs font-semibold transition"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />{isAr ? 'واتساب' : 'WhatsApp'}
                      </a>
                    </div>
                  )}

                  {/* Notes */}
                  {appt.notes && !isNeedsReview && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">{t('admin.notes')}</p>
                      <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-4 py-3 whitespace-pre-wrap">{appt.notes}</p>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-4 space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{isAr ? 'الإجراءات' : 'Admin Actions'}</p>

                    {/* Needs Review actions */}
                    {isNeedsReview && (
                      <>
                        <button
                          onClick={() => handleModalUpdate({ status: 'in_progress', notes: '', approval_granted: false })}
                          disabled={submitting}
                          className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition"
                        >
                          <Wrench className="w-4 h-4" />{isAr ? 'مراجعة وإعادة إرسال' : 'Revise & Resubmit'}
                        </button>
                        <div className="flex gap-2">
                          <select
                            value={reassignTechId}
                            onChange={e => setApptDetailModal(prev => prev ? { ...prev, reassignTechId: e.target.value } : null)}
                            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-orange-500 outline-none"
                          >
                            <option value="">{isAr ? 'إعادة تعيين فني...' : 'Reassign technician...'}</option>
                            {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
                          </select>
                          <button
                            onClick={() => reassignTechId && handleModalUpdate({ technician_id: reassignTechId, status: 'in_progress', notes: '' })}
                            disabled={submitting || !reassignTechId}
                            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
                          >
                            <UserCog className="w-4 h-4" />{isAr ? 'تعيين' : 'Assign'}
                          </button>
                        </div>
                      </>
                    )}

                    {/* General actions */}
                    {appt.status === 'pending' && !isNeedsReview && (
                      <button
                        onClick={() => handleModalUpdate({ status: 'in_progress' })}
                        disabled={submitting}
                        className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition"
                      >
                        <CheckCircle className="w-4 h-4" />{isAr ? 'تحديد كقيد التنفيذ' : 'Mark In Progress'}
                      </button>
                    )}

                    {!appt.technician_id && (
                      <div className="flex gap-2">
                        <select
                          value={reassignTechId}
                          onChange={e => setApptDetailModal(prev => prev ? { ...prev, reassignTechId: e.target.value } : null)}
                          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-orange-500 outline-none"
                        >
                          <option value="">{isAr ? 'تعيين فني...' : 'Assign technician...'}</option>
                          {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.full_name}</option>)}
                        </select>
                        <button
                          onClick={() => reassignTechId && handleModalUpdate({ technician_id: reassignTechId })}
                          disabled={submitting || !reassignTechId}
                          className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
                        >
                          <UserCog className="w-4 h-4" />{isAr ? 'تعيين' : 'Assign'}
                        </button>
                      </div>
                    )}

                    {/* Reschedule */}
                    {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                      <div className="flex gap-2">
                        <input
                          type="datetime-local"
                          value={rescheduleDate}
                          onChange={e => setApptDetailModal(prev => prev ? { ...prev, rescheduleDate: e.target.value } : null)}
                          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                        />
                        <button
                          onClick={() => rescheduleDate && handleModalUpdate({ scheduled_at: new Date(rescheduleDate).toISOString() })}
                          disabled={submitting || !rescheduleDate}
                          className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
                        >
                          <Calendar className="w-4 h-4" />{isAr ? 'إعادة جدولة' : 'Reschedule'}
                        </button>
                      </div>
                    )}

                    {/* Cancel */}
                    {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                      <button
                        onClick={() => handleModalUpdate({ status: 'cancelled' })}
                        disabled={submitting}
                        className="w-full flex items-center gap-2 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-sm font-semibold transition"
                      >
                        <X className="w-4 h-4" />{isAr ? 'إلغاء الموعد' : 'Cancel Appointment'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {selectedAdminInvoice && (
          <PrintableInvoice invoice={selectedAdminInvoice} onClose={() => setSelectedAdminInvoice(null)} />
        )}

        {/* Customer Devices modal */}
        {devicesModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setDevicesModal(null)}>
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-600" />
                  <h3 className="font-bold text-slate-900 text-sm">{devicesModal.custName} — Devices</h3>
                </div>
                <button onClick={() => setDevicesModal(null)} className="w-7 h-7 bg-slate-200 rounded-lg flex items-center justify-center hover:bg-slate-300 transition"><X className="w-3.5 h-3.5 text-slate-600" /></button>
              </div>
              <div className="p-4 max-h-96 overflow-y-auto">
                {devicesLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 text-blue-600 animate-spin" /></div>
                ) : devicesModal.list.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">No devices registered</p>
                ) : (
                  <div className="space-y-3">
                    {devicesModal.list.map(dev => {
                      const warrantyOk = dev.warranty_expires ? new Date(dev.warranty_expires) > new Date() : null;
                      return (
                        <div key={dev.id} className="border border-slate-100 rounded-xl p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{dev.device_brand} {dev.device_model ? `— ${dev.device_model}` : ''}</p>
                              {dev.location_in_premises && <p className="text-xs text-slate-500 mt-0.5">{dev.location_in_premises}</p>}
                              {dev.serial_number && <p className="text-xs font-mono text-slate-400 mt-0.5">S/N: {dev.serial_number}</p>}
                              {dev.installation_date && <p className="text-xs text-slate-400 mt-0.5">Installed: {dev.installation_date}</p>}
                              {dev.warranty_expires && <p className="text-xs text-slate-400">Warranty: {dev.warranty_expires}</p>}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {warrantyOk !== null && (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${warrantyOk ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                  {warrantyOk ? 'Active' : 'Expired'}
                                </span>
                              )}
                              <button
                                onClick={() => setEditAdminDevice(dev)}
                                title={t('common.edit')}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-100 flex items-center justify-center text-slate-400 hover:text-blue-600 transition"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Portal description */}
        <div className="mt-6 bg-orange-50 border border-orange-100 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-600 rounded-xl flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-orange-900">{t('admin.portalTitle')}</p>
              <p className="text-sm text-orange-700">{t('admin.portalDesc')}</p>
            </div>
          </div>
        </div>

      </div>
    </div>

    {/* ── Add Customer Modal ── */}
    {showAddCustomer && (
      <AddCustomerModal
        onClose={() => setShowAddCustomer(false)}
        onCreated={() => { loadData(); }}
      />
    )}

    {/* ── Edit Customer Modal ── */}
    {editCustomer && (
      <EditCustomerModal
        customer={editCustomer}
        onClose={() => setEditCustomer(null)}
        onUpdated={() => { loadData(); }}
      />
    )}

    {/* ── Edit Device Modal ── */}
    {editAdminDevice && (
      <EditDeviceModal
        device={editAdminDevice}
        onClose={() => setEditAdminDevice(null)}
        onUpdated={() => { refetchDevicesModal(); }}
      />
    )}

    {/* ── Add Technician Modal ── */}
    {showAddTechnician && (
      <AddTechnicianModal
        onClose={() => setShowAddTechnician(false)}
        onCreated={() => { loadData(); loadTechnicians(); }}
      />
    )}
    </>
  );
}
