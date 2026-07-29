import { useEffect, useState } from 'react';
import {
  Users, Calendar, Receipt, FileText, Cpu, Package, MessageSquare, UserCog,
  Bell, ClipboardList, Search, Eye, Plus, X, Loader2, AlertTriangle, CheckCircle,
  TrendingUp, Save, Pencil, Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import PrintableInvoice, { type InvoiceData } from '../../components/PrintableInvoice';
import AddCustomerModal from '../../components/AddCustomerModal';
import CustomerFullEditPage from '../../components/CustomerFullEditPage';
import EditDeviceModal from '../../components/EditDeviceModal';
import EditContractModal from '../../components/EditContractModal';
import Customer360Panel from '../../components/Customer360Panel';
import ImportCustomersModal from '../../components/ImportCustomersModal';
import ScheduleVisitModal from '../../components/ScheduleVisitModal';
import VisitTypeBadge from '../../components/VisitTypeBadge';

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
  scheduled_at: string; status: string;
  customers: { name: string } | null;
  technician: { full_name: string } | null;
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
  created_at: string; customers: { id: string; name: string; phone: string } | null;
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

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB');
}

const DEVICE_BRANDS = ['BioFamily 4-Stage', 'BioFamily 7-Stage', 'Ruhens Cooler', 'Family Cooler', 'Other'];
const PLAN_TYPES = ['monthly', 'quarterly', 'biannual', 'annual'];

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

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showImportCustomers, setShowImportCustomers] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<{ id: string; name: string } | null>(null);
  const [showScheduleVisit, setShowScheduleVisit] = useState(false);
  const [fullEditCustomerId, setFullEditCustomerId] = useState<string | null>(null);
  const [editDevice, setEditDevice] = useState<DeviceRow | null>(null);
  const [editContract, setEditContract] = useState<ContractRow | null>(null);

  const [appointments, setAppointments] = useState<ApptRow[]>([]);
  const [apptSearch, setApptSearch] = useState('');

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [showAddContract, setShowAddContract] = useState(false);

  const [devices, setDevices] = useState<DeviceRow[]>([]);
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
  }

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('*').order('name');
    setCustomers((data ?? []) as Customer[]);
  }

  async function loadAppointments() {
    const { data } = await supabase
      .from('appointments')
      .select('id, service_type, visit_type, confirmed, scheduled_at, status, customers(name), technician:profiles!appointments_technician_id_fkey(full_name)')
      .order('scheduled_at', { ascending: false })
      .limit(200);
    setAppointments(((data ?? []) as Record<string, unknown>[]).map(r => ({
      ...(r as unknown as ApptRow),
      customers: one(r.customers as Record<string, unknown>[] | Record<string, unknown> | null) as { name: string } | null,
      technician: one(r.technician as Record<string, unknown>[] | Record<string, unknown> | null) as { full_name: string } | null,
    })));
  }

  async function loadInvoices() {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, payment_method, payment_status, issued_at, appointment_id, labor_cost, parts_used, customers(name, address, phone), technician:profiles!invoices_technician_id_fkey(full_name), appointments(service_type, scheduled_at)')
      .order('issued_at', { ascending: false })
      .limit(200);
    setInvoices(((data ?? []) as Record<string, unknown>[]).map(r => {
      const cust = one(r.customers as Record<string, unknown>[] | Record<string, unknown> | null) as { name: string; address: string; phone: string } | null;
      const tech = one(r.technician as Record<string, unknown>[] | Record<string, unknown> | null) as { full_name: string } | null;
      const appt = one(r.appointments as Record<string, unknown>[] | Record<string, unknown> | null) as { service_type: string; scheduled_at: string } | null;
      const parts = (Array.isArray(r.parts_used) ? r.parts_used : []) as { name: string; quantity: number; unit_price: number }[];
      const invoiceData: InvoiceData = {
        invoiceNumber: r.invoice_number as string,
        issuedAt: r.issued_at as string,
        customer: { name: cust?.name ?? '-', address: cust?.address ?? '-', phone: cust?.phone ?? '-' },
        technicianName: tech?.full_name ?? '-',
        serviceType: appt?.service_type ?? '-',
        serviceDate: appt?.scheduled_at ?? r.issued_at as string,
        parts: parts.map(p => ({ name: p.name, quantity: p.quantity, unitPrice: p.unit_price })),
        laborCost: r.labor_cost as number ?? 0,
        totalAmount: r.total_amount as number ?? 0,
        paymentMethod: r.payment_method as string ?? 'cash',
        paymentStatus: r.payment_status as string ?? 'pending',
      };
      return {
        id: r.id as string, invoice_number: r.invoice_number as string,
        total_amount: r.total_amount as number ?? 0, payment_method: r.payment_method as string,
        payment_status: r.payment_status as string, issued_at: r.issued_at as string,
        appointment_id: r.appointment_id as string | null, customers: cust, technician: tech, appointments: appt,
        invoiceData,
      };
    }));
  }

  async function loadContracts() {
    const { data } = await supabase
      .from('contracts')
      .select('id, customer_id, plan_type, visits_included, visits_used, price_jod, start_date, end_date, auto_renew, status, customers(name)')
      .order('end_date', { ascending: true });
    setContracts(((data ?? []) as Record<string, unknown>[]).map(r => ({
      ...(r as unknown as ContractRow),
      customers: one(r.customers as Record<string, unknown>[] | Record<string, unknown> | null) as { name: string } | null,
    })));
  }

  async function loadDevices() {
    const { data } = await supabase
      .from('customer_devices')
      .select('id, customer_id, device_brand, device_model, serial_number, installation_date, warranty_expires, location_in_premises, customers(name)')
      .order('installation_date', { ascending: false });
    setDevices(((data ?? []) as Record<string, unknown>[]).map(r => ({
      ...(r as unknown as DeviceRow),
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
      .select('id, trigger_type, urgency, status, description, created_at, customers(id, name, phone)')
      .order('created_at', { ascending: false })
      .limit(100);
    setRequests(((data ?? []) as Record<string, unknown>[]).map(r => ({
      ...(r as unknown as RequestRow),
      customers: one(r.customers as Record<string, unknown>[] | Record<string, unknown> | null) as { id: string; name: string; phone: string } | null,
    })));
  }

  async function loadTeam() {
    const { data } = await supabase
      .from('profiles').select('id, full_name, role, phone, created_at')
      .in('role', ['technician', 'admin', 'manager', 'owner'])
      .order('role');
    setTeam((data ?? []) as TeamMember[]);
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

  useEffect(() => { loadOverview(); loadCustomers(); }, []);

  useEffect(() => {
    if (loadedTabs.has(tab)) return;
    const loaders: Partial<Record<ManagerTab, () => Promise<void>>> = {
      appointments: loadAppointments,
      invoices: loadInvoices,
      contracts: loadContracts,
      devices: loadDevices,
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
    const { error } = await supabase.from('invoices').update({ payment_status: 'paid', paid_at: new Date().toISOString() }).eq('id', id);
    if (!error) {
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, payment_status: 'paid', invoiceData: inv.invoiceData ? { ...inv.invoiceData, paymentStatus: 'paid' } : undefined } : inv));
      showToast(t('toast.success'), 'success');
    } else {
      showToast(t('toast.error'), 'error');
    }
    setMarkingPaid(null);
  }

  async function handleInventoryUpdate(id: string) {
    const { error } = await supabase.from('inventory').update({ quantity: editingInvQty }).eq('id', id);
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
    const { error } = await supabase.from('service_requests').update({ status: 'dismissed' }).eq('id', id);
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
    const { error } = await supabase
      .from('appointments')
      .update({
        confirmed: true,
        confirmed_at: new Date().toISOString(),
        confirmed_by: profile?.id ?? null,
        confirmation_channel: 'phone',
      })
      .eq('id', id);

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: t('manager.kpiCustomers'), value: stats.customers, color: 'text-blue-600', icon: Users },
              { label: t('manager.kpiActiveContracts'), value: stats.activeContracts, color: 'text-green-600', icon: FileText },
              { label: t('manager.kpiPendingInvoices'), value: `${stats.pendingInvoices} (${stats.pendingInvoicesAmount.toFixed(0)} ${t('invoice.jod')})`, color: 'text-amber-600', icon: Receipt },
              { label: t('manager.kpiLowStock'), value: stats.lowStock, color: 'text-red-600', icon: Package },
              { label: t('manager.kpiPendingRequests'), value: stats.pendingRequests, color: 'text-purple-600', icon: MessageSquare },
              { label: t('manager.kpiTodayAppts'), value: stats.todayAppts, color: 'text-orange-600', icon: Calendar },
              { label: t('manager.kpiExpiringContracts'), value: stats.expiringContracts, color: 'text-rose-600', icon: AlertTriangle },
            ].map(s => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${s.color}`} />
                    <span className="text-xs font-medium text-slate-500">{s.label}</span>
                  </div>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
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
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-navy/10 rounded-xl flex items-center justify-center text-navy font-bold text-sm shrink-0">
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm truncate">{c.name}</p>
                      <p className="text-xs text-slate-500" dir="ltr">{c.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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
                <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900 text-sm truncate">{a.customers?.name ?? '—'}</p>
                      <VisitTypeBadge visitType={a.visit_type} />
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {a.technician?.full_name ?? t('customer360.unassigned')} · {new Date(a.scheduled_at).toLocaleString('en-GB')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!a.confirmed && a.status !== 'completed' && a.status !== 'cancelled' && (
                      <button
                        onClick={() => confirmVisit(a.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-green-600 hover:bg-green-700 text-white transition"
                      >
                        <CheckCircle className="w-3 h-3" />
                        {t('visit.confirm')}
                      </button>
                    )}
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${statusColor[a.status] ?? 'bg-slate-100 text-slate-600'}`}>{a.status}</span>
                  </div>
                </div>
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
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-end">
              <button
                onClick={() => setShowAddContract(true)}
                className="flex items-center gap-1.5 bg-navy hover:bg-navy-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition"
              >
                <Plus className="w-3.5 h-3.5" /> {t('manager.newContract')}
              </button>
            </div>
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {contracts.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
              ) : contracts.map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{c.customers?.name ?? '—'} <span className="text-slate-400 font-normal capitalize">· {c.plan_type}</span></p>
                    <p className="text-xs text-slate-500">{fmtDate(c.start_date)} → {fmtDate(c.end_date)} · {c.visits_used}/{c.visits_included} {t('customer360.visits')} · {c.price_jod} {t('invoice.jod')}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${statusColor[c.status] ?? 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
                    <button
                      onClick={() => setEditContract(c)}
                      title={t('common.edit')}
                      className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-navy/10 flex items-center justify-center text-slate-500 hover:text-navy transition"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DEVICES ── */}
        {tab === 'devices' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-end">
              <button
                onClick={() => setShowAddDevice(true)}
                className="flex items-center gap-1.5 bg-navy hover:bg-navy-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition"
              >
                <Plus className="w-3.5 h-3.5" /> {t('manager.newDevice')}
              </button>
            </div>
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {devices.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
              ) : devices.map(d => (
                <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-3.5 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{d.customers?.name ?? '—'} <span className="text-slate-400 font-normal">· {d.device_brand}</span></p>
                    <p className="text-xs text-slate-500">{d.serial_number ? `S/N ${d.serial_number} · ` : ''}{t('customer360.installDate')}: {fmtDate(d.installation_date)} · {t('customer360.warrantyExpires')}: {fmtDate(d.warranty_expires)}</p>
                  </div>
                  <button
                    onClick={() => setEditDevice(d)}
                    title={t('common.edit')}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-navy/10 flex items-center justify-center text-slate-500 hover:text-navy transition shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
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
                      <button
                        onClick={() => { setEditingInvId(i.id); setEditingInvQty(i.quantity); }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${i.quantity < i.low_stock_threshold ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}
                      >
                        {i.quantity} {i.unit}
                      </button>
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
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {requests.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">{t('common.noData')}</p>
              ) : requests.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3.5 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{r.customers?.name ?? '—'} <span className="text-slate-400 font-normal">· {t(`serviceRequests.type_${r.trigger_type}`, r.trigger_type)}</span></p>
                    <p className="text-xs text-slate-500 truncate">{r.description || fmtDate(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-1 rounded-lg text-[11px] font-semibold ${statusColor[r.status] ?? 'bg-slate-100 text-slate-600'}`}>{r.status}</span>
                    {r.status === 'pending' && (
                      <button
                        onClick={() => handleDismissRequest(r.id)}
                        disabled={dismissingId === r.id}
                        className="text-xs font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition"
                      >
                        {t('serviceRequests.dismiss')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TEAM ── */}
        {tab === 'team' && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {team.length === 0 ? (
              <p className="text-center text-slate-400 text-sm py-10 col-span-full">{t('common.noData')}</p>
            ) : team.map(m => (
              <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-navy/10 rounded-xl flex items-center justify-center text-navy font-bold shrink-0">{m.full_name?.[0]?.toUpperCase()}</div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{m.full_name}</p>
                  <p className="text-xs text-slate-500">{t(`roles.${m.role}`)} {m.phone ? `· ${m.phone}` : ''}</p>
                </div>
              </div>
            ))}
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
    {editDevice && (
      <EditDeviceModal
        device={editDevice}
        onClose={() => setEditDevice(null)}
        onUpdated={() => { loadDevices(); }}
      />
    )}
    {editContract && (
      <EditContractModal
        contract={editContract}
        onClose={() => setEditContract(null)}
        onUpdated={() => { loadContracts(); loadOverview(); }}
      />
    )}
    {showAddCustomer && (
      <AddCustomerModal
        onClose={() => setShowAddCustomer(false)}
        onCreated={() => { loadCustomers(); loadOverview(); }}
        onOpenImport={() => { setShowAddCustomer(false); setShowImportCustomers(true); }}
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
    {showAddContract && (
      <AddContractModal
        customers={customers}
        onClose={() => setShowAddContract(false)}
        onCreated={() => { loadContracts(); loadOverview(); }}
      />
    )}
    {showAddDevice && (
      <AddDeviceModal
        customers={customers}
        onClose={() => setShowAddDevice(false)}
        onCreated={() => loadDevices()}
      />
    )}
    </>
  );
}

// ── Add Contract Modal ──────────────────────────────────────────────────────

function AddContractModal({ customers, onClose, onCreated }: { customers: Customer[]; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [customerId, setCustomerId] = useState('');
  const [planType, setPlanType] = useState('quarterly');
  const [visitsIncluded, setVisitsIncluded] = useState(4);
  const [priceJod, setPriceJod] = useState(0);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [autoRenew, setAutoRenew] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !endDate) { showToast(t('toast.warning'), 'warning'); return; }
    setSaving(true);
    const { error } = await supabase.from('contracts').insert({
      customer_id: customerId, plan_type: planType, visits_included: visitsIncluded,
      price_jod: priceJod, start_date: startDate, end_date: endDate, auto_renew: autoRenew, status: 'active',
    });
    setSaving(false);
    if (error) { showToast(t('toast.error'), 'error'); return; }
    showToast(t('toast.success'), 'success');
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-base">{t('manager.newContract')}</h2>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition"><X className="w-4 h-4 text-slate-600" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('admin.selectCustomer')}</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} required className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
              <option value="">{t('admin.selectCustomer')}</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('manager.planType')}</label>
              <select value={planType} onChange={e => setPlanType(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm capitalize">
                {PLAN_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customer360.visits')}</label>
              <input type="number" min={1} value={visitsIncluded} onChange={e => setVisitsIncluded(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('admin.dateFrom')}</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('admin.dateTo')}</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('invoice.amount')}</label>
            <input type="number" min={0} step="0.01" value={priceJod} onChange={e => setPriceJod(Number(e.target.value))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={autoRenew} onChange={e => setAutoRenew(e.target.checked)} className="rounded" />
            {t('manager.autoRenew')}
          </label>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-navy hover:bg-navy-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Add Device Modal ────────────────────────────────────────────────────────

function AddDeviceModal({ customers, onClose, onCreated }: { customers: Customer[]; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [customerId, setCustomerId] = useState('');
  const [brand, setBrand] = useState(DEVICE_BRANDS[0]);
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [installDate, setInstallDate] = useState('');
  const [warrantyExpires, setWarrantyExpires] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) { showToast(t('toast.warning'), 'warning'); return; }
    setSaving(true);
    const { error } = await supabase.from('customer_devices').insert({
      customer_id: customerId, device_brand: brand, device_model: model || null,
      serial_number: serial || null, installation_date: installDate || null,
      warranty_expires: warrantyExpires || null, location_in_premises: location || null,
    });
    setSaving(false);
    if (error) { showToast(t('toast.error'), 'error'); return; }
    showToast(t('toast.success'), 'success');
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 text-base">{t('manager.newDevice')}</h2>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition"><X className="w-4 h-4 text-slate-600" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('admin.selectCustomer')}</label>
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} required className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
              <option value="">{t('admin.selectCustomer')}</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customer360.devices')}</label>
            <select value={brand} onChange={e => setBrand(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
              {DEVICE_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={model} onChange={e => setModel(e.target.value)} placeholder={t('manager.deviceModel')} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
            <input value={serial} onChange={e => setSerial(e.target.value)} placeholder={t('manager.serialNumber')} dir="ltr" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
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
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder={t('manager.locationInPremises')} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">{t('common.cancel')}</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl bg-navy hover:bg-navy-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
