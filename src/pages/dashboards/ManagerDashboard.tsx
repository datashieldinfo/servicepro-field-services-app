import { useEffect, useState } from 'react';
import {
  Users, Calendar, Receipt, FileText, Cpu, Package, MessageSquare, UserCog,
  Bell, ClipboardList, Search, Eye, Plus, Loader2, AlertTriangle, CheckCircle,
  TrendingUp, Save, Pencil, Upload, ChevronDown, ChevronLeft, Phone,
  Sparkles, FileSpreadsheet, Printer,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import PrintableInvoice, { type InvoiceData } from '../../components/PrintableInvoice';
import AddCustomerModal from '../../components/AddCustomerModal';
import CustomerFullEditPage from '../../components/CustomerFullEditPage';
import DeviceModal from '../../components/DeviceModal';
import ContractModal from '../../components/ContractModal';
import CustomerStatusBadge from '../../components/CustomerStatusBadge';
import DeviceCatalogue from '../../components/DeviceCatalogue';
import InventoryItemCard, { type InventoryItem as StockItem } from '../../components/InventoryItemCard';
import Customer360Panel from '../../components/Customer360Panel';
import ImportCustomersModal from '../../components/ImportCustomersModal';
import ScheduleVisitModal from '../../components/ScheduleVisitModal';
import CustomerNextStep from '../../components/CustomerNextStep';
import VisitTypeBadge from '../../components/VisitTypeBadge';
import { StatusChip, StatusDetailPanel } from '../../components/StatusDetail';
import {
  TONE_CLASS,
  URGENCY_TONE,
  contractHealth,
  requestStatusMeta,
  visitBlockers,
  visitStatusMeta,
  waitingFor,
} from '../../lib/statusMeta';
import { loadCustomerActionState, type OpenOffer } from '../../lib/customerActionState';
import { type CustomerStatus } from '../../lib/statusMeta';
import { fmtDate, whatsAppLink } from '../../lib/format';
import { fetchInvoices, invoiceEmbeds, startOfMonth, toInvoiceData } from '../../lib/invoiceRows';
import { confirmAppointment, dismissServiceRequest, markInvoicePaid, setInventoryQuantity } from '../../lib/operations';
import { TRIGGER_TO_VISIT_TYPE } from '../../lib/visitFields';

// ── Types ─────────────────────────────────────────────────────────────────────

type ManagerTab =
  | 'overview' | 'customers' | 'appointments' | 'invoices' | 'contracts'
  | 'devices' | 'inventory' | 'requests' | 'team' | 'notifications' | 'activity';

interface Customer {
  id: string; name: string; phone: string; email: string; address: string;
  user_id: string | null; last_service_date: string | null; next_appointment: string | null;
  contract_type: string | null; warranty_expires: string | null; device_install_date: string | null;
}

interface ApptRow {
  id: string; service_type: string; visit_type: string; confirmed: boolean;
  confirmed_at: string | null; confirmation_channel: string | null;
  scheduled_at: string; status: string; address: string; notes: string;
  approval_notes: string | null; technician_id: string | null;
  tds_before: number | null; tds_after: number | null;
  customer_id: string | null;
  customers: { name: string; phone: string } | null;
  technician: { full_name: string } | null;
  device: { device_brand: string; serial_number: string | null; location_in_premises: string | null } | null;
}

interface InvoiceRow {
  id: string; invoice_number: string; total_amount: number; payment_method: string;
  payment_status: string; issued_at: string; appointment_id: string | null;
  customers: { name: string; address: string; phone: string } | null;
  technician: { full_name: string } | null;
  appointments: { service_type: string; scheduled_at: string } | null;
  invoiceData?: InvoiceData;
}

interface ContractRow {
  id: string; customer_id: string; plan_type: string; visits_included: number; visits_used: number;
  price_jod: number; start_date: string; end_date: string; auto_renew: boolean; status: string;
  contract_number: string | null; filter_category: 'home' | 'industrial' | null;
  customers: { name: string } | null;
}

interface DeviceRow {
  id: string; customer_id: string; device_brand: string; device_model: string | null;
  serial_number: string | null; installation_date: string | null; warranty_expires: string | null;
  location_in_premises: string | null;
  customers: { name: string } | null;
}

interface InventoryItem {
  id: string; part_name: string; quantity: number; unit: string; low_stock_threshold: number;
  cost_price: number; selling_price: number;
}

interface RequestRow {
  id: string; trigger_type: string; urgency: string; status: string; description: string;
  created_at: string; triggered_by: string | null; suggested_date: string | null;
  linked_appointment_id: string | null;
  customers: { id: string; name: string; phone: string; address: string } | null;
}

interface TeamMember { id: string; full_name: string; role: string; phone: string; created_at: string; }

interface NotificationRow {
  id: string; type: string; message: string; is_read: boolean; created_at: string;
  profiles: { full_name: string } | null;
}

interface ActivityRow {
  id: string; action: string; description: string; created_at: string;
  profiles: { full_name: string } | null;
}

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? v[0] ?? null : v;
}


export default function ManagerDashboard() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [tab, setTab] = useState<ManagerTab>('overview');
  const [loadedTabs, setLoadedTabs] = useState<Set<ManagerTab>>(new Set());

  // Overview stats
  const [stats, setStats] = useState({
    customers: 0, activeContracts: 0, pendingInvoices: 0, pendingInvoicesAmount: 0,
    lowStock: 0, pendingRequests: 0, todayAppts: 0, expiringContracts: 0,
  });
  /** The line under each headline number — what it is actually made of. */
  const [overviewDetail, setOverviewDetail] = useState({
    customersNew: 0,
    contractVisitsLeft: 0,
    invoicesOldestDays: 0,
    lowStockNames: '',
    requestsHigh: 0,
    requestsLongestWait: 0,
    todayUnconfirmed: 0,
    expiringName: '',
  });
  const [workload, setWorkload] = useState<Record<string, {
    today: number; inProgress: number; completedMonth: number; unconfirmed: number;
    nextVisit: { at: string; customer: string } | null;
  }>>({});
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  /** Registered with no visit and no offer — the follow-up never happened. */
  const [awaitingActionIds, setAwaitingActionIds] = useState<Set<string>>(new Set());
  const [openOffers, setOpenOffers] = useState<Record<string, OpenOffer>>({});
  const [customerStatuses, setCustomerStatuses] = useState<Record<string, CustomerStatus>>({});
  const [inventoryCard, setInventoryCard] = useState<StockItem | null>(null);
  const [deviceReload, setDeviceReload] = useState(0);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showImportCustomers, setShowImportCustomers] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<{ id: string; name: string } | null>(null);
  const [showScheduleVisit, setShowScheduleVisit] = useState(false);
  const [fullEditCustomerId, setFullEditCustomerId] = useState<string | null>(null);
  const [editDevice, setEditDevice] = useState<DeviceRow | null>(null);

  const [appointments, setAppointments] = useState<ApptRow[]>([]);
  const [apptSearch, setApptSearch] = useState('');

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractModal, setContractModal] = useState<{ contract?: ContractRow; print?: boolean } | null>(null);
  const [openApptId, setOpenApptId] = useState<string | null>(null);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'scheduled' | 'dismissed'>('all');
  const [scheduleFromRequest, setScheduleFromRequest] = useState<RequestRow | null>(null);

  const [showAddDevice, setShowAddDevice] = useState(false);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [editingInvId, setEditingInvId] = useState<string | null>(null);
  const [editingInvQty, setEditingInvQty] = useState(0);

  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  // ── Loaders ─────────────────────────────────────────────────────────────────

  async function loadOverview() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const [custCount, activeContracts, pendingInv, lowStock, pendingReq, todayApptCount, expContracts] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('invoices').select('total_amount').eq('payment_status', 'pending'),
      supabase.from('inventory').select('id', { count: 'exact', head: true }).lt('quantity', 5),
      supabase.from('service_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('scheduled_at', today).lt('scheduled_at', tomorrow),
      supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('status', 'active').lte('end_date', in30).gte('end_date', today),
    ]);
    const pendingAmount = ((pendingInv.data ?? []) as { total_amount: number }[]).reduce((s, r) => s + (r.total_amount ?? 0), 0);
    setStats({
      customers: custCount.count ?? 0,
      activeContracts: activeContracts.count ?? 0,
      pendingInvoices: pendingInv.data?.length ?? 0,
      pendingInvoicesAmount: pendingAmount,
      lowStock: lowStock.count ?? 0,
      pendingRequests: pendingReq.count ?? 0,
      todayAppts: todayApptCount.count ?? 0,
      expiringContracts: expContracts.count ?? 0,
    });

    loadOverviewDetail(today, tomorrow, in30);
  }

  /** The second line on each card: what the headline number is made of. */
  async function loadOverviewDetail(today: string, tomorrow: string, in30: string) {
    const monthStart = startOfMonth();

    const [newCust, contractRows, oldestInv, lowItems, urgentReq, oldestReq, todayRows, expiring] =
      await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
        supabase.from('contracts').select('visits_included, visits_used').eq('status', 'active'),
        supabase.from('invoices').select('issued_at').eq('payment_status', 'pending').order('issued_at').limit(1),
        supabase.from('inventory').select('part_name').lt('quantity', 5).limit(2),
        supabase.from('service_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('urgency', 'high'),
        supabase.from('service_requests').select('created_at').eq('status', 'pending').order('created_at').limit(1),
        supabase.from('appointments').select('confirmed').gte('scheduled_at', today).lt('scheduled_at', tomorrow),
        supabase.from('contracts')
          .select('end_date, customers(name)')
          .eq('status', 'active').lte('end_date', in30).gte('end_date', today)
          .order('end_date').limit(1),
      ]);

    const visitsLeft = ((contractRows.data ?? []) as { visits_included: number; visits_used: number }[])
      .reduce((sum, c) => sum + Math.max(0, (c.visits_included ?? 0) - (c.visits_used ?? 0)), 0);

    const days = (iso?: string) =>
      iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0;

    const expRow = (expiring.data ?? [])[0] as { end_date: string; customers: unknown } | undefined;
    const expCust = one(expRow?.customers as Record<string, unknown>[] | Record<string, unknown> | null) as { name: string } | null;

    setOverviewDetail({
      customersNew: newCust.count ?? 0,
      contractVisitsLeft: visitsLeft,
      invoicesOldestDays: days((oldestInv.data ?? [])[0]?.issued_at),
      lowStockNames: ((lowItems.data ?? []) as { part_name: string }[]).map(i => i.part_name).join('، '),
      requestsHigh: urgentReq.count ?? 0,
      requestsLongestWait: days((oldestReq.data ?? [])[0]?.created_at),
      todayUnconfirmed: ((todayRows.data ?? []) as { confirmed: boolean }[]).filter(a => !a.confirmed).length,
      expiringName: expRow ? `${expCust?.name ?? ''} · ${fmtDate(expRow.end_date)}` : '',
    });
  }

  /** What each technician is actually carrying right now. */
  async function loadWorkload() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const monthStart = startOfMonth();

    const { data } = await supabase
      .from('appointments')
      .select('technician_id, status, confirmed, scheduled_at, customers(name)')
      .not('technician_id', 'is', null)
      .gte('scheduled_at', monthStart)
      /* Newest visit first, so today's work is at the top of the list. */
      .order('scheduled_at', { ascending: false });

    const map: Record<string, {
      today: number; inProgress: number; completedMonth: number; unconfirmed: number;
      nextVisit: { at: string; customer: string } | null;
    }> = {};

    ((data ?? []) as Record<string, unknown>[]).forEach(row => {
      const id = row.technician_id as string;
      const at = row.scheduled_at as string;
      const status = row.status as string;
      const cust = one(row.customers as Record<string, unknown>[] | Record<string, unknown> | null) as { name: string } | null;

      map[id] ??= { today: 0, inProgress: 0, completedMonth: 0, unconfirmed: 0, nextVisit: null };
      const entry = map[id];

      if (at >= today && at < tomorrow) entry.today += 1;
      if (status === 'in_progress') entry.inProgress += 1;
      if (status === 'completed') entry.completedMonth += 1;
      if (!row.confirmed && status !== 'completed' && status !== 'cancelled') entry.unconfirmed += 1;
      if (!entry.nextVisit && at >= new Date().toISOString() && status !== 'completed' && status !== 'cancelled') {
        entry.nextVisit = { at, customer: cust?.name ?? '—' };
      }
    });

    setWorkload(map);
  }

  async function loadCustomers() {
    /* Newest customer first — the one just registered is the one being worked on. */
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    const rows = (data ?? []) as Customer[];
    setCustomers(rows);

    const { awaiting, offers, statuses } = await loadCustomerActionState(rows);
    setAwaitingActionIds(awaiting);
    setOpenOffers(offers);
    setCustomerStatuses(statuses);
  }

  async function loadAppointments() {
    const { data } = await supabase
      .from('appointments')
      .select('id, service_type, visit_type, confirmed, confirmed_at, confirmation_channel, scheduled_at, status, address, notes, approval_notes, technician_id, tds_before, tds_after, customer_id, customers(name, phone), technician:profiles!appointments_technician_id_fkey(full_name), device:customer_devices(device_brand, serial_number, location_in_premises)')
      .order('scheduled_at', { ascending: false })
      .limit(200);
    setAppointments(((data ?? []) as Record<string, unknown>[]).map(r => ({
      ...(r as unknown as ApptRow),
      customers: one(r.customers as Record<string, unknown>[] | Record<string, unknown> | null) as { name: string; phone: string } | null,
      technician: one(r.technician as Record<string, unknown>[] | Record<string, unknown> | null) as { full_name: string } | null,
      device: one(r.device as Record<string, unknown>[] | Record<string, unknown> | null) as ApptRow['device'],
    })));
  }

  async function loadInvoices() {
    const rows = await fetchInvoices({ limit: 200 });

    setInvoices(rows.map(r => {
      const { customer, technician, appointment } = invoiceEmbeds(r);
      return {
        id: r.id as string,
        invoice_number: r.invoice_number as string,
        total_amount: (r.total_amount as number) ?? 0,
        payment_method: r.payment_method as string,
        payment_status: r.payment_status as string,
        issued_at: r.issued_at as string,
        appointment_id: r.appointment_id as string | null,
        customers: customer,
        technician,
        appointments: appointment,
        invoiceData: toInvoiceData(r),
      };
    }));
  }

  async function loadContracts() {
    const { data } = await supabase
      .from('contracts')
      .select('id, customer_id, contract_number, filter_category, plan_type, visits_included, visits_used, price_jod, start_date, end_date, auto_renew, status, customers(name)')
      .order('end_date', { ascending: true });
    setContracts(((data ?? []) as Record<string, unknown>[]).map(r => ({
      ...(r as unknown as ContractRow),
      customers: one(r.customers as Record<string, unknown>[] | Record<string, unknown> | null) as { name: string } | null,
    })));
  }

  async function loadInventory() {
    const { data } = await supabase.from('inventory').select('*').order('part_name');
    setInventory((data ?? []) as InventoryItem[]);
  }

  async function loadRequests() {
    const { data } = await supabase
      .from('service_requests')
      .select('id, trigger_type, urgency, status, description, created_at, triggered_by, suggested_date, linked_appointment_id, customers(id, name, phone, address)')
      .order('created_at', { ascending: false })
      .limit(100);
    setRequests(((data ?? []) as Record<string, unknown>[]).map(r => ({
      ...(r as unknown as RequestRow),
      customers: one(r.customers as Record<string, unknown>[] | Record<string, unknown> | null) as RequestRow['customers'],
    })));
  }

  async function loadTeam() {
    const { data } = await supabase
      .from('profiles').select('id, full_name, role, phone, created_at')
      .in('role', ['technician', 'admin', 'manager', 'owner'])
      .order('role');
    setTeam((data ?? []) as TeamMember[]);
    loadWorkload();
  }

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications').select('id, type, message, is_read, created_at, profiles(full_name)')
      .order('created_at', { ascending: false }).limit(100);
    setNotifications(((data ?? []) as Record<string, unknown>[]).map(r => ({
      ...(r as unknown as NotificationRow),
      profiles: one(r.profiles as Record<string, unknown>[] | Record<string, unknown> | null) as { full_name: string } | null,
    })));
  }

  async function loadActivity() {
    const { data } = await supabase
      .from('activity_log').select('id, action, description, created_at, profiles(full_name)')
      .order('created_at', { ascending: false }).limit(100);
    setActivity(((data ?? []) as Record<string, unknown>[]).map(r => ({
      ...(r as unknown as ActivityRow),
      profiles: one(r.profiles as Record<string, unknown>[] | Record<string, unknown> | null) as { full_name: string } | null,
    })));
  }

  // Runs once on mount; the loaders are stable for the life of the screen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadOverview(); loadCustomers(); }, []);

  useEffect(() => {
    if (loadedTabs.has(tab)) return;
    const loaders: Partial<Record<ManagerTab, () => Promise<void>>> = {
      appointments: loadAppointments,
      invoices: loadInvoices,
      contracts: loadContracts,
      inventory: loadInventory,
      requests: loadRequests,
      team: loadTeam,
      notifications: loadNotifications,
      activity: loadActivity,
    };
    const fn = loaders[tab];
    if (fn) {
      fn();
      setLoadedTabs(prev => new Set(prev).add(tab));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleMarkPaid(id: string) {
    setMarkingPaid(id);
    const { error } = await markInvoicePaid(id);
    if (!error) {
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, payment_status: 'paid', invoiceData: inv.invoiceData ? { ...inv.invoiceData, paymentStatus: 'paid' } : undefined } : inv));
      showToast(t('toast.success'), 'success');
    } else {
      showToast(t('toast.error'), 'error');
    }
    setMarkingPaid(null);
  }

  async function handleInventoryUpdate(id: string) {
    const { error } = await setInventoryQuantity(id, editingInvQty);
    if (!error) {
      setInventory(prev => prev.map(i => i.id === id ? { ...i, quantity: editingInvQty } : i));
      showToast(t('toast.success'), 'success');
    } else {
      showToast(t('toast.error'), 'error');
    }
    setEditingInvId(null);
  }

  async function handleDismissRequest(id: string) {
    setDismissingId(id);
    const { error } = await dismissServiceRequest(id);
    if (!error) {
      setRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'dismissed' } : r));
    } else {
      showToast(t('toast.error'), 'error');
    }
    setDismissingId(null);
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const filteredAppts = appointments.filter(a => {
    const q = apptSearch.trim().toLowerCase();
    return !q || (a.customers?.name ?? '').toLowerCase().includes(q) || a.service_type.toLowerCase().includes(q);
  });

  const filteredInvoices = invoices.filter(inv => invoiceFilter === 'all' ? true : inv.payment_status === invoiceFilter);

  const statusColor: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700', in_progress: 'bg-blue-100 text-blue-700',
    awaiting_approval: 'bg-purple-100 text-purple-700', completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700', active: 'bg-green-100 text-green-700',
    expired: 'bg-slate-100 text-slate-600', scheduled: 'bg-blue-100 text-blue-700',
    dismissed: 'bg-slate-100 text-slate-500', paid: 'bg-green-100 text-green-700',
    partial: 'bg-amber-100 text-amber-700',
  };

  async function confirmVisit(id: string) {
    const { error } = await confirmAppointment(id, profile?.id);

    if (error) { showToast(error.message, 'error'); return; }
    showToast(t('visit.confirmedToast'), 'success');
    setAppointments(prev => prev.map(a => (a.id === id ? { ...a, confirmed: true } : a)));
  }

  const TABS: { id: ManagerTab; labelKey: string; icon: typeof Users }[] = [
    { id: 'overview', labelKey: 'manager.tabOverview', icon: TrendingUp },
    { id: 'customers', labelKey: 'manager.tabCustomers', icon: Users },
    { id: 'appointments', labelKey: 'manager.tabAppointments', icon: Calendar },
    { id: 'invoices', labelKey: 'manager.tabInvoices', icon: Receipt },
    { id: 'contracts', labelKey: 'manager.tabContracts', icon: FileText },
    { id: 'devices', labelKey: 'manager.tabDevices', icon: Cpu },
    { id: 'inventory', labelKey: 'manager.tabInventory', icon: Package },
    { id: 'requests', labelKey: 'manager.tabRequests', icon: MessageSquare },
    { id: 'team', labelKey: 'manager.tabTeam', icon: UserCog },
    { id: 'notifications', labelKey: 'manager.tabNotifications', icon: Bell },
    { id: 'activity', labelKey: 'manager.tabActivity', icon: ClipboardList },
  ];

  return (
    <>
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t('manager.title')}</h1>
            <p className="text-slate-500 mt-1">{t('admin.welcomeBack')}، {profile?.full_name?.split(' ')[0] ?? ''}. {t('manager.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowAddCustomer(true)}
              className="flex items-center gap-2 bg-navy hover:bg-navy-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              {isAr ? 'عميل جديد' : 'New Customer'}
            </button>
            <button
              onClick={() => { setScheduleFor(null); setShowScheduleVisit(true); }}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm"
            >
              <Calendar className="w-4 h-4" />
              {t('visit.scheduleAction')}
            </button>
            <button
              onClick={() => setShowImportCustomers(true)}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
            >
              <Upload className="w-4 h-4" />
              {t('customerImport.title')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 -mx-1 px-1">
          {TABS.map(tb => {
            const Icon = tb.icon;
            return (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
                  tab === tb.id ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t(tb.labelKey)}
              </button>
            );
          })}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                key: 'customers',
                label: t('manager.kpiCustomers'),
                value: String(stats.customers),
                detail: t('manager.detailNewCustomers', { count: overviewDetail.customersNew }),
                color: 'text-blue-600', ring: 'hover:border-blue-300', icon: Users,
                go: () => setTab('customers'),
              },
              {
                key: 'contracts',
                label: t('manager.kpiActiveContracts'),
                value: String(stats.activeContracts),
                detail: t('manager.detailVisitsLeft', { count: overviewDetail.contractVisitsLeft }),
                color: 'text-green-600', ring: 'hover:border-green-300', icon: FileText,
                go: () => setTab('contracts'),
              },
              {
                key: 'invoices',
                label: t('manager.kpiPendingInvoices'),
                value: `${stats.pendingInvoices} (${stats.pendingInvoicesAmount.toFixed(0)} ${t('invoice.jod')})`,
                detail: stats.pendingInvoices > 0
                  ? t('manager.detailOldestInvoice', { count: overviewDetail.invoicesOldestDays })
                  : t('manager.detailAllSettled'),
                color: 'text-amber-600', ring: 'hover:border-amber-300', icon: Receipt,
                go: () => { setInvoiceFilter('pending'); setTab('invoices'); },
              },
              {
                key: 'stock',
                label: t('manager.kpiLowStock'),
                value: String(stats.lowStock),
                detail: overviewDetail.lowStockNames || t('manager.detailStockFine'),
                color: 'text-red-600', ring: 'hover:border-red-300', icon: Package,
                go: () => setTab('inventory'),
              },
              {
                key: 'requests',
                label: t('manager.kpiPendingRequests'),
                value: String(stats.pendingRequests),
                detail: overviewDetail.requestsHigh > 0
                  ? t('manager.detailRequestsUrgent', { count: overviewDetail.requestsHigh, days: overviewDetail.requestsLongestWait })
                  : t('manager.detailRequestsWait', { count: overviewDetail.requestsLongestWait }),
                color: 'text-purple-600', ring: 'hover:border-purple-300', icon: MessageSquare,
                go: () => { setRequestFilter('pending'); setTab('requests'); },
              },
              {
                key: 'today',
                label: t('manager.kpiTodayAppts'),
                value: String(stats.todayAppts),
                detail: overviewDetail.todayUnconfirmed > 0
                  ? t('manager.detailTodayUnconfirmed', { count: overviewDetail.todayUnconfirmed })
                  : t('manager.detailTodayAllConfirmed'),
                color: 'text-orange-600', ring: 'hover:border-orange-300', icon: Calendar,
                go: () => setTab('appointments'),
              },
              {
                key: 'expiring',
                label: t('manager.kpiExpiringContracts'),
                value: String(stats.expiringContracts),
                detail: overviewDetail.expiringName || t('manager.detailNoneExpiring'),
                color: 'text-rose-600', ring: 'hover:border-rose-300', icon: AlertTriangle,
                go: () => setTab('contracts'),
              },
            ].map(s2 => {
              const Icon = s2.icon;
              return (
                <button
                  key={s2.key}
                  onClick={s2.go}
                  className={`bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-start transition hover:shadow-md ${s2.ring} group`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${s2.color}`} />
                      <span className="text-xs font-medium text-slate-500 truncate">{s2.label}</span>
                    </div>
                    <ChevronLeft className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition rtl:rotate-180 shrink-0" />
                  </div>
                  <p className={`text-xl font-bold ${s2.color}`}>{s2.value}</p>
                  <p className="text-[11px] text-slate-500 mt-1 truncate" title={s2.detail}>{s2.detail}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* ── CUSTOMERS (master data hub → Customer 360) ── */}
        {tab === 'customers' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  placeholder={t('admin.customerSearchPlaceholder')}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                />
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredCustomers.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
              ) : filteredCustomers.map(c => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 transition ${
                    awaitingActionIds.has(c.id) ? 'bg-amber-50/40' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-navy/10 rounded-xl flex items-center justify-center text-navy font-bold text-sm shrink-0">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 text-sm truncate">{c.name}</p>
                        {awaitingActionIds.has(c.id) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 whitespace-nowrap shrink-0">
                            <Sparkles className="w-2.5 h-2.5" />
                            {t('admin.awaitingActionBadge')}
                          </span>
                        )}
                        {openOffers[c.id] && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-100 text-purple-700 whitespace-nowrap shrink-0">
                            <FileSpreadsheet className="w-2.5 h-2.5" />
                            {openOffers[c.id].quote_number}
                          </span>
                        )}
                        <CustomerStatusBadge status={customerStatuses[c.id]} small />
                      </div>
                      <p className="text-xs text-slate-500" dir="ltr">{c.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <CustomerNextStep
                      customer={c}
                      offer={openOffers[c.id] ?? null}
                      highlight={awaitingActionIds.has(c.id)}
                      onChanged={() => { loadCustomers(); loadAppointments(); }}
                    />
                    <button
                      onClick={() => setFullEditCustomerId(c.id)}
                      title={t('common.edit')}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-navy/10 flex items-center justify-center text-slate-500 hover:text-navy transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setSelectedCustomerId(c.id)}
                      className="flex items-center gap-1.5 bg-navy/5 hover:bg-navy/10 text-navy px-3 py-2 rounded-lg text-xs font-semibold transition"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {t('manager.view360')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── APPOINTMENTS ── */}
        {tab === 'appointments' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={apptSearch}
                  onChange={e => setApptSearch(e.target.value)}
                  placeholder={t('admin.searchPlaceholder')}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-navy"
                />
              </div>
            </div>
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {filteredAppts.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
              ) : filteredAppts.map(a => (
                (() => {
                  const meta = visitStatusMeta(a.status);
                  const open = openApptId === a.id;
                  const reasons = visitBlockers(a);
                  return (
                    <div key={a.id}>
                      <button
                        onClick={() => setOpenApptId(open ? null : a.id)}
                        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-start hover:bg-slate-50/60 transition"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-slate-900 text-sm truncate">{a.customers?.name ?? '—'}</p>
                            <VisitTypeBadge visitType={a.visit_type} />
                            {!a.confirmed && a.status !== 'completed' && a.status !== 'cancelled' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                                {t('visit.unconfirmed')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">
                            {a.technician?.full_name ?? t('customer360.unassigned')} · {new Date(a.scheduled_at).toLocaleString('en-GB')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusChip meta={meta} ns="visitStatus" />
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {open && (
                        <StatusDetailPanel
                          meta={meta}
                          ns="visitStatus"
                          reasons={reasons}
                          facts={[
                            { label: t('visit.visitType'), value: t(`visit.type.${a.visit_type}`) },
                            { label: t('visit.dateTime'), value: new Date(a.scheduled_at).toLocaleString('en-GB') },
                            { label: t('visit.technician'), value: a.technician?.full_name ?? t('status.unassigned'), tone: a.technician_id ? undefined : 'warning' },
                            {
                              label: t('visit.confirmed'),
                              value: a.confirmed
                                ? `${t('visit.confirmed')}${a.confirmation_channel ? ` · ${t(`visit.channel.${a.confirmation_channel}`)}` : ''}`
                                : t('visit.unconfirmed'),
                              tone: a.confirmed ? 'success' : 'warning',
                            },
                            ...(a.device ? [{ label: t('visit.device'), value: [a.device.device_brand, a.device.serial_number, a.device.location_in_premises].filter(Boolean).join(' · ') }] : []),
                            ...(a.address ? [{ label: t('visit.address'), value: a.address }] : []),
                            ...(a.tds_before != null || a.tds_after != null ? [{ label: 'TDS', value: `${a.tds_before ?? '—'} → ${a.tds_after ?? '—'} ppm` }] : []),
                            ...(a.approval_notes ? [{ label: t('technician.approvalNotes', 'Approval notes'), value: a.approval_notes }] : []),
                            ...(a.notes ? [{ label: t('admin.notes'), value: a.notes }] : []),
                          ]}
                        >
                          {!a.confirmed && a.status !== 'completed' && a.status !== 'cancelled' && (
                            <button
                              onClick={() => confirmVisit(a.id)}
                              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              {t('visit.confirm')}
                            </button>
                          )}
                          {a.customers?.phone && (
                            <a
                              href={`tel:${a.customers.phone}`}
                              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold transition"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              {a.customers.phone}
                            </a>
                          )}
                        </StatusDetailPanel>
                      )}
                    </div>
                  );
                })()
              ))}
            </div>
          </div>
        )}

        {/* ── INVOICES ── */}
        {tab === 'invoices' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex gap-2">
              {(['all', 'paid', 'pending'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setInvoiceFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${invoiceFilter === f ? 'bg-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {f === 'all' ? t('admin.filterAll') : t(`invoice.${f}`)}
                </button>
              ))}
            </div>
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {filteredInvoices.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
              ) : filteredInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between gap-3 px-5 py-3.5 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm" dir="ltr">{inv.invoice_number}</p>
                    <p className="text-xs text-slate-500 truncate">{inv.customers?.name ?? '—'} · {fmtDate(inv.issued_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-slate-900 text-sm">{inv.total_amount.toFixed(2)} {t('invoice.jod')}</span>
                    <span className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${statusColor[inv.payment_status] ?? 'bg-slate-100 text-slate-600'}`}>{inv.payment_status}</span>
                    {inv.payment_status !== 'paid' && (
                      <button
                        onClick={() => handleMarkPaid(inv.id)}
                        disabled={markingPaid === inv.id}
                        className="text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg transition"
                      >
                        {markingPaid === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('invoice.markPaid')}
                      </button>
                    )}
                    <button
                      onClick={() => inv.invoiceData && setSelectedInvoice(inv.invoiceData)}
                      className="text-xs font-semibold text-navy bg-navy/5 hover:bg-navy/10 px-2.5 py-1.5 rounded-lg transition"
                    >
                      {t('invoice.viewInvoice')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CONTRACTS ── */}
        {tab === 'contracts' && (
          <div className="space-y-4">
            {/* Contracts that need attention before anything else */}
            {contracts.some(c => contractHealth(c).alert) && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-sm font-bold text-amber-900 flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  {t('contract.needsAttention')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {contracts.filter(c => contractHealth(c).alert).map(c => {
                    const h = contractHealth(c);
                    return (
                      <button
                        key={c.id}
                        onClick={() => setContractModal({ contract: c })}
                        className="text-start bg-white border border-amber-200 rounded-xl px-3 py-2 hover:border-amber-400 transition"
                      >
                        <p className="text-xs font-semibold text-slate-900">{c.customers?.name ?? '—'}</p>
                        <p className="text-[11px] text-amber-800">{t(`contract.state_${h.state}`)}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex justify-end">
                <button
                  onClick={() => setContractModal({})}
                  className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5" /> {t('manager.newContract')}
                </button>
              </div>
              <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
                {contracts.length === 0 ? (
                  <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
                ) : contracts.map(c => {
                  const h = contractHealth(c);
                  const pct = c.visits_included > 0
                    ? Math.min(100, Math.round((c.visits_used / c.visits_included) * 100))
                    : 0;
                  return (
                    <div key={c.id} className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold text-slate-900 text-sm">{c.customers?.name ?? '—'}</p>
                          {c.contract_number && (
                            <span className="text-[10px] font-bold text-navy bg-navy/5 px-1.5 py-0.5 rounded-md" dir="ltr">
                              {c.contract_number}
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500">{t(`contract.plan_${c.plan_type}`, c.plan_type)}</span>
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">
                            {t(`device.usage_${c.filter_category ?? 'home'}`)}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${TONE_CLASS[h.tone]}`}>
                            {t(`contract.state_${h.state}`)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-500 mb-2">
                          {fmtDate(c.start_date)} → {fmtDate(c.end_date)} · {c.price_jod} {t('invoice.jod')}
                          {h.daysLeft >= 0 && ` · ${t('contract.daysLeft', { count: h.daysLeft })}`}
                        </p>

                        {/* Visits used against visits sold */}
                        <div className="max-w-sm">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-slate-500">
                              {t('contract.visitsProgress', { used: c.visits_used, total: c.visits_included })}
                            </span>
                            <span className={`font-bold ${h.remaining <= 1 ? 'text-amber-700' : 'text-slate-700'}`}>
                              {t('contract.remainingCount', { count: h.remaining })}
                            </span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                h.remaining === 0 ? 'bg-red-500' : h.remaining === 1 ? 'bg-amber-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {c.auto_renew && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                            {t('contract.autoRenewShort')}
                          </span>
                        )}
                        <button
                          onClick={() => setContractModal({ contract: c, print: true })}
                          title={t('contract.print')}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-navy/10 flex items-center justify-center text-slate-500 hover:text-navy transition"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setContractModal({ contract: c })}
                          title={t('common.edit')}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-navy/10 flex items-center justify-center text-slate-500 hover:text-navy transition"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── DEVICES ── */}
        {tab === 'devices' && (
          <DeviceCatalogue
            reloadToken={deviceReload}
            onAdd={() => setShowAddDevice(true)}
            onEdit={device => setEditDevice(device as typeof editDevice)}
            onOpenCustomer={id => setSelectedCustomerId(id)}
          />
        )}

        {/* ── INVENTORY ── */}
        {tab === 'inventory' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {inventory.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
              ) : inventory.map(i => (
                <div key={i.id} className="flex items-center justify-between gap-3 px-5 py-3.5 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{i.part_name}</p>
                    <p className="text-xs text-slate-500">{i.cost_price} / {i.selling_price} {t('invoice.jod')} · {t('inventory.unit')}: {i.unit}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {editingInvId === i.id ? (
                      <>
                        <input
                          type="number"
                          value={editingInvQty}
                          onChange={e => setEditingInvQty(Number(e.target.value))}
                          className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-sm"
                        />
                        <button onClick={() => handleInventoryUpdate(i.id)} className="text-green-700 bg-green-50 hover:bg-green-100 p-1.5 rounded-lg transition">
                          <Save className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingInvId(i.id); setEditingInvQty(i.quantity); }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${i.quantity < i.low_stock_threshold ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}
                        >
                          {i.quantity} {i.unit}
                        </button>
                        <button
                          onClick={() => setInventoryCard(i)}
                          title={t('inventoryCard.open')}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-navy/10 text-slate-600 hover:text-navy transition"
                        >
                          {t('inventoryCard.open')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SERVICE REQUESTS ── */}
        {tab === 'requests' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
              {(['all', 'pending', 'scheduled', 'dismissed'] as const).map(f => {
                const count = f === 'all' ? requests.length : requests.filter(r => r.status === f).length;
                return (
                  <button
                    key={f}
                    onClick={() => setRequestFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                      requestFilter === f ? 'bg-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {f === 'all' ? t('admin.filterAll') : t(`requestStatus.label_${f}`)}
                    <span className="ms-1.5 opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {requests.filter(r => requestFilter === 'all' || r.status === requestFilter).length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
              ) : requests
                .filter(r => requestFilter === 'all' || r.status === requestFilter)
                .map(r => {
                  const meta = requestStatusMeta(r.status);
                  const wait = waitingFor(r.created_at, r.urgency);
                  const open = openRequestId === r.id;
                  return (
                    <div key={r.id}>
                      <button
                        onClick={() => setOpenRequestId(open ? null : r.id)}
                        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-start hover:bg-slate-50/60 transition"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 text-sm truncate">
                            {r.customers?.name ?? '—'}
                            <span className="text-slate-400 font-normal"> · {t(`serviceRequests.type_${r.trigger_type}`, r.trigger_type)}</span>
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {t(`requestReason.${r.trigger_type}`, r.description || '')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {r.status === 'pending' && (
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-bold ${
                              wait.breached ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {wait.days > 0
                                ? t('requestStatus.waitingDays', { count: wait.days })
                                : t('requestStatus.waitingHours', { count: wait.hours })}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${TONE_CLASS[URGENCY_TONE[r.urgency] ?? 'neutral']}`}>
                            {t(`serviceRequests.urgency_${r.urgency}`, r.urgency)}
                          </span>
                          <StatusChip meta={meta} ns="requestStatus" />
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {open && (
                        <StatusDetailPanel
                          meta={meta}
                          ns="requestStatus"
                          reasons={[r.trigger_type, ...(wait.breached ? ['slaBreached'] : [])]}
                          facts={[
                            { label: t('requestStatus.raisedBy'), value: t(`requestStatus.by_${r.triggered_by ?? 'system'}`, r.triggered_by ?? 'system') },
                            { label: t('requestStatus.raisedOn'), value: fmtDate(r.created_at) },
                            {
                              label: t('requestStatus.waiting'),
                              value: wait.days > 0
                                ? t('requestStatus.waitingDays', { count: wait.days })
                                : t('requestStatus.waitingHours', { count: wait.hours }),
                              tone: wait.breached ? 'danger' : undefined,
                            },
                            ...(r.suggested_date ? [{ label: t('requestStatus.suggestedDate'), value: fmtDate(r.suggested_date) }] : []),
                            ...(r.customers?.phone ? [{ label: t('admin.phone'), value: r.customers.phone }] : []),
                            ...(r.description ? [{ label: t('admin.notes'), value: r.description }] : []),
                          ]}
                        >
                          {r.status === 'pending' && (
                            <>
                              <button
                                onClick={() => setScheduleFromRequest(r)}
                                className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition"
                              >
                                <Calendar className="w-3.5 h-3.5" />
                                {t('requestStatus.scheduleNow')}
                              </button>
                              {r.customers?.phone && (
                                <a
                                  href={`tel:${r.customers.phone}`}
                                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold transition"
                                >
                                  <Phone className="w-3.5 h-3.5" />
                                  {t('requestStatus.callCustomer')}
                                </a>
                              )}
                              <button
                                onClick={() => handleDismissRequest(r.id)}
                                disabled={dismissingId === r.id}
                                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs font-semibold transition"
                              >
                                {t('serviceRequests.dismiss')}
                              </button>
                            </>
                          )}
                          {r.status === 'scheduled' && (
                            <button
                              onClick={() => setTab('appointments')}
                              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold transition"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              {t('requestStatus.seeVisit')}
                            </button>
                          )}
                        </StatusDetailPanel>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── TEAM ── */}
        {tab === 'team' && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {team.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-10 col-span-full">{t('common.noData')}</p>
            ) : team.map(m => {
              const load = workload[m.id];
              const isTech = m.role === 'technician';
              const open = openMemberId === m.id;
              const busy = (load?.inProgress ?? 0) > 0;
              const freeToday = isTech && !busy && (load?.today ?? 0) === 0;

              return (
                <div
                  key={m.id}
                  className={`bg-white rounded-2xl shadow-sm border transition ${
                    open ? 'border-navy/30 shadow-md' : 'border-slate-100'
                  }`}
                >
                  <button
                    onClick={() => setOpenMemberId(open ? null : m.id)}
                    className="w-full p-4 flex items-center gap-3 text-start"
                  >
                    <div className="w-10 h-10 bg-navy/10 rounded-xl flex items-center justify-center text-navy font-bold shrink-0">
                      {m.full_name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 text-sm truncate">{m.full_name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {t(`roles.${m.role}`)}{m.phone ? ` · ${m.phone}` : ''}
                      </p>
                    </div>
                    {isTech && (
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap ${
                        busy ? 'bg-blue-50 text-blue-700'
                          : freeToday ? 'bg-slate-100 text-slate-500'
                          : 'bg-green-50 text-green-700'
                      }`}>
                        {busy ? t('team.onJob') : freeToday ? t('team.freeToday') : t('team.jobsToday', { count: load?.today ?? 0 })}
                      </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition shrink-0 ${open ? 'rotate-180' : ''}`} />
                  </button>

                  {open && (
                    <div className="border-t border-slate-100 px-4 py-4 space-y-4">
                      {isTech && (
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: t('team.today'), value: load?.today ?? 0, tone: 'text-slate-900' },
                            { label: t('team.inProgress'), value: load?.inProgress ?? 0, tone: 'text-blue-700' },
                            { label: t('team.doneThisMonth'), value: load?.completedMonth ?? 0, tone: 'text-green-700' },
                            { label: t('visit.unconfirmed'), value: load?.unconfirmed ?? 0, tone: (load?.unconfirmed ?? 0) > 0 ? 'text-amber-700' : 'text-slate-900' },
                          ].map(stat => (
                            <div key={stat.label} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-center">
                              <p className={`text-lg font-bold ${stat.tone}`}>{stat.value}</p>
                              <p className="text-[10px] text-slate-500 leading-tight">{stat.label}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1">
                          <span className="text-[11px] text-slate-500">{t('team.role')}</span>
                          <span className="text-xs font-medium text-slate-800">{t(`roles.${m.role}`)}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1">
                          <span className="text-[11px] text-slate-500">{t('admin.phone')}</span>
                          <span className="text-xs font-medium text-slate-800" dir="ltr">{m.phone || '—'}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1">
                          <span className="text-[11px] text-slate-500">{t('team.joined')}</span>
                          <span className="text-xs font-medium text-slate-800">{fmtDate(m.created_at)}</span>
                        </div>
                        {isTech && load?.nextVisit && (
                          <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1">
                            <span className="text-[11px] text-slate-500">{t('team.nextVisit')}</span>
                            <span className="text-xs font-medium text-slate-800 text-end">
                              {new Date(load.nextVisit.at).toLocaleString('en-GB')} · {load.nextVisit.customer}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {m.phone && (
                          <>
                            <a
                              href={`tel:${m.phone}`}
                              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-xs font-semibold transition"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              {t('requestStatus.callCustomer')}
                            </a>
                            <a
                              href={whatsAppLink(m.phone)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-xs font-semibold transition"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              {t('quote.viaWhatsApp')}
                            </a>
                          </>
                        )}
                        {isTech && (
                          <button
                            onClick={() => { setApptSearch(m.full_name); setTab('appointments'); }}
                            className="flex items-center gap-1.5 bg-navy hover:bg-navy/90 text-white px-3 py-2 rounded-lg text-xs font-semibold transition"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                            {t('team.viewVisits')}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── NOTIFICATIONS ── */}
        {tab === 'notifications' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
              ) : notifications.map(n => (
                <div key={n.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className={`text-sm truncate ${!n.is_read ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{n.message}</p>
                    <p className="text-xs text-slate-400">{n.profiles?.full_name ?? '—'} · {t(`customer.notif${n.type.charAt(0).toUpperCase()}${n.type.slice(1)}`, n.type)}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{fmtDate(n.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ACTIVITY LOG ── */}
        {tab === 'activity' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {activity.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
              ) : activity.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{a.action}</p>
                    <p className="text-xs text-slate-500 truncate">{a.description} {a.profiles?.full_name ? `· ${a.profiles.full_name}` : ''}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{fmtDate(a.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>

    {/* Modals / overlays */}
    {selectedCustomerId && (
      <Customer360Panel customerId={selectedCustomerId} onClose={() => setSelectedCustomerId(null)} />
    )}
    {fullEditCustomerId && (
      <CustomerFullEditPage
        customerId={fullEditCustomerId}
        onClose={() => setFullEditCustomerId(null)}
        onSaved={() => { loadCustomers(); }}
      />
    )}
    {inventoryCard && (
      <InventoryItemCard
        item={inventoryCard}
        onClose={() => setInventoryCard(null)}
        onChanged={() => loadInventory()}
      />
    )}
    {editDevice && (
      <DeviceModal
        device={editDevice}
        onClose={() => setEditDevice(null)}
        onSaved={() => setDeviceReload(v => v + 1)}
      />
    )}
    {contractModal && (
      <ContractModal
        contract={contractModal.contract}
        autoPrint={contractModal.print}
        customers={customers}
        onClose={() => setContractModal(null)}
        onSaved={() => { loadContracts(); loadOverview(); }}
      />
    )}
    {showAddCustomer && (
      <AddCustomerModal
        onClose={() => setShowAddCustomer(false)}
        onCreated={() => { loadCustomers(); loadOverview(); }}
        onOpenImport={() => { setShowAddCustomer(false); setShowImportCustomers(true); }}
      />
    )}
    {scheduleFromRequest && (
      <ScheduleVisitModal
        presetCustomerId={scheduleFromRequest.customers?.id}
        presetCustomerName={scheduleFromRequest.customers?.name}
        presetVisitType={TRIGGER_TO_VISIT_TYPE[scheduleFromRequest.trigger_type] ?? 'scheduled_visit'}
        presetDate={scheduleFromRequest.suggested_date ? `${scheduleFromRequest.suggested_date}T09:00` : undefined}
        presetNotes={scheduleFromRequest.description ?? ''}
        serviceRequestId={scheduleFromRequest.id}
        onClose={() => setScheduleFromRequest(null)}
        onSaved={() => { loadRequests(); loadAppointments(); loadOverview(); }}
      />
    )}
    {showScheduleVisit && (
      <ScheduleVisitModal
        presetCustomerId={scheduleFor?.id}
        presetCustomerName={scheduleFor?.name}
        onClose={() => { setShowScheduleVisit(false); setScheduleFor(null); }}
        onSaved={() => { loadAppointments(); loadOverview(); }}
      />
    )}
    {showImportCustomers && (
      <ImportCustomersModal
        onClose={() => setShowImportCustomers(false)}
        onImported={() => { loadCustomers(); loadOverview(); }}
      />
    )}
    {selectedInvoice && (
      <PrintableInvoice invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
    )}
    {showAddDevice && (
      <DeviceModal
        customers={customers}
        onClose={() => setShowAddDevice(false)}
        onSaved={() => setDeviceReload(v => v + 1)}
      />
    )}
    </>
  );
}

