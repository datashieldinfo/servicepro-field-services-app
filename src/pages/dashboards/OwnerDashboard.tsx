import { useEffect, useState } from 'react';
import { Users, CalendarCheck, MapPin, UserCog, ArrowUpRight, Activity, Send, UserPlus, FileBarChart, Clock, Database, Zap, AlertOctagon, Timer, Receipt, TrendingUp, CreditCard, Download, Package, AlertTriangle, Calendar, X, Phone, MessageCircle, CheckCircle, Wrench, Upload, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';
import PrintableInvoice, { type InvoiceData } from '../../components/PrintableInvoice';
import AddCustomerModal from '../../components/AddCustomerModal';
import CustomerNextStep, { type NextStepCustomer } from '../../components/CustomerNextStep';
import { loadCustomerActionState, type OpenOffer } from '../../lib/customerActionState';
import ImportCustomersModal from '../../components/ImportCustomersModal';
import VisitTypeBadge from '../../components/VisitTypeBadge';
import { VISIT_TYPES, visitTypeDef } from '../../lib/visitFields';

interface ActivityItem {
  id: string;
  action: string;
  description: string;
  created_at: string;
}

interface TechnicianStatus {
  id: string;
  full_name: string;
  status: 'available' | 'busy';
}

interface OwnerAppt {
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
}

function normaliseOwnerAppt(raw: Record<string, unknown>): OwnerAppt {
  return {
    ...(raw as unknown as OwnerAppt),
    customers: Array.isArray(raw.customers)
      ? ((raw.customers as { name: string; address: string; phone?: string }[])[0] ?? null)
      : (raw.customers as { name: string; address: string; phone?: string } | null),
  };
}

export default function OwnerDashboard() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [seeding, setSeeding] = useState(false);
  const [showAddCustomer, setShowAddCustomer]         = useState(false);
  const [showImportCustomers, setShowImportCustomers] = useState(false);

  const [customerCount, setCustomerCount] = useState(0);
  /** Registered with no visit and no offer — the follow-up never happened. */
  const [awaitingCustomers, setAwaitingCustomers] = useState<NextStepCustomer[]>([]);
  const [openOffers, setOpenOffers] = useState<Record<string, OpenOffer>>({});
  const [visitMix, setVisitMix] = useState<{ type: string; count: number }[]>([]);
  const [unconfirmedCount, setUnconfirmedCount] = useState(0);
  const [technicianCount, setTechnicianCount] = useState(0);
  const [todayAppts, setTodayAppts] = useState(0);
  const [monthlyVisits, setMonthlyVisits] = useState(0);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [technicianList, setTechnicianList] = useState<TechnicianStatus[]>([]);
  const [triggerByType, setTriggerByType] = useState<{ type: string; count: number }[]>([]);
  const [avgResponseHours, setAvgResponseHours] = useState<number | null>(null);
  const [emergencyCount, setEmergencyCount] = useState(0);

  // Invoice tracking state
  interface InvoiceRow {
    id: string;
    invoice_number: string;
    customer_name: string;
    technician_name: string;
    total_amount: number;
    payment_method: string;
    payment_status: string;
    issued_at: string;
    invoiceData?: InvoiceData;
  }
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [invoiceRevenue, setInvoiceRevenue] = useState(0);
  const [invoicePendingTotal, setInvoicePendingTotal] = useState(0);
  const [invoicePendingCount, setInvoicePendingCount] = useState(0);
  const [selectedOwnerInvoice, setSelectedOwnerInvoice] = useState<InvoiceData | null>(null);
  const [contractMRR, setContractMRR] = useState(0);
  const [contractRenewalRate, setContractRenewalRate] = useState<number | null>(null);

  interface InventoryItem { id: string; part_name: string; quantity: number; unit: string; low_stock_threshold: number; }
  const [inventory, setInventory]               = useState<InventoryItem[]>([]);
  const [ownerTab, setOwnerTab]                 = useState<'overview' | 'appointments' | 'inventory'>('overview');
  const [editingInvId, setEditingInvId]         = useState<string | null>(null);
  const [editingInvQty, setEditingInvQty]       = useState(0);
  const [ownerAppts, setOwnerAppts]             = useState<OwnerAppt[]>([]);
  const [ownerApptStatusFilter, setOwnerApptStatusFilter] = useState<'all' | 'pending' | 'in_progress' | 'awaiting_approval' | 'completed'>('all');
  interface OwnerApptModalState { appt: OwnerAppt; rescheduleDate: string; reassignTechId: string; submitting: boolean; }
  const [ownerApptModal, setOwnerApptModal]     = useState<OwnerApptModalState | null>(null);

  /** Customers the office registered and then left without a next step. */
  async function loadAwaitingCustomers() {
    const { data } = await supabase
      .from('customers')
      .select('id, name, phone, email, address, user_id')
      .order('created_at', { ascending: false });

    const rows = (data ?? []) as NextStepCustomer[];
    const { awaiting, offers } = await loadCustomerActionState(rows);
    setAwaitingCustomers(rows.filter(c => awaiting.has(c.id) || offers[c.id]));
    setOpenOffers(offers);
  }

  async function loadData() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const [custRes, techRes, apptRes, monthRes, actRes, techProfilesRes, busyRes] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'technician'),
      supabase.from('appointments').select('id', { count: 'exact', head: true })
        .gte('scheduled_at', today)
        .lt('scheduled_at', tomorrow),
      supabase.from('appointments').select('id', { count: 'exact', head: true })
        .gte('scheduled_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('profiles').select('id, full_name').eq('role', 'technician').order('full_name'),
      supabase.from('appointments').select('technician_id')
        .eq('status', 'in_progress')
        .gte('scheduled_at', today)
        .lt('scheduled_at', tomorrow),
    ]);

    await loadAwaitingCustomers();

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const [mixRes, unconfirmedRes] = await Promise.all([
      supabase.from('appointments').select('visit_type').gte('scheduled_at', monthStart),
      supabase.from('appointments').select('id', { count: 'exact', head: true })
        .eq('confirmed', false)
        .in('status', ['pending', 'in_progress', 'awaiting_approval'])
        .gte('scheduled_at', new Date().toISOString()),
    ]);

    const mixCounts = ((mixRes.data ?? []) as { visit_type: string }[]).reduce<Record<string, number>>((acc, r) => {
      const key = r.visit_type ?? 'scheduled_visit';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    setVisitMix(VISIT_TYPES
      .map(vt => ({ type: vt.value, count: mixCounts[vt.value] ?? 0 }))
      .filter(row => row.count > 0));
    setUnconfirmedCount(unconfirmedRes.count ?? 0);

    setCustomerCount(custRes.count ?? 0);
    setTechnicianCount(techRes.count ?? 0);
    setTodayAppts(apptRes.count ?? 0);
    setMonthlyVisits(monthRes.count ?? 0);
    setActivities(actRes.data ?? []);

    const busyIds = new Set((busyRes.data ?? []).map((r: { technician_id: string | null }) => r.technician_id).filter(Boolean));
    setTechnicianList(
      (techProfilesRes.data ?? []).map((p: { id: string; full_name: string }) => ({
        id: p.id,
        full_name: p.full_name,
        status: busyIds.has(p.id) ? 'busy' : 'available',
      }))
    );

    // Load invoices for this month
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('id, invoice_number, total_amount, payment_method, payment_status, issued_at, parts_used, labor_cost, appointment_id, customer_id, technician_id, customers(name, address, phone), technician:profiles!invoices_technician_id_fkey(full_name), appointments(service_type, scheduled_at)')
      .gte('issued_at', startOfMonth)
      .order('issued_at', { ascending: false })
      .limit(50);

    if (invoiceData) {
      type RawInv = Record<string, unknown>;
      const rows: InvoiceRow[] = (invoiceData as RawInv[]).map(inv => {
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
          invoiceData,
        };
      });
      setInvoices(rows);
      const paid = rows.filter(r => r.payment_status === 'paid').reduce((s, r) => s + r.total_amount, 0);
      const pending = rows.filter(r => r.payment_status !== 'paid');
      setInvoiceRevenue(paid);
      setInvoicePendingTotal(pending.reduce((s, r) => s + r.total_amount, 0));
      setInvoicePendingCount(pending.length);
    }

    // Trigger insights for this month
    const { data: srData } = await supabase
      .from('service_requests')
      .select('trigger_type, urgency, created_at, resolved_at')
      .gte('created_at', startOfMonth);

    if (srData) {
      const counts: Record<string, number> = {};
      let emergencies = 0;
      const resolvedDelays: number[] = [];

      for (const r of srData) {
        counts[r.trigger_type] = (counts[r.trigger_type] ?? 0) + 1;
        if (r.urgency === 'emergency') emergencies++;
        if (r.resolved_at) {
          const delayMs = new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime();
          if (delayMs > 0) resolvedDelays.push(delayMs / 3600000);
        }
      }

      setTriggerByType(
        Object.entries(counts)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count)
      );
      setEmergencyCount(emergencies);
      setAvgResponseHours(
        resolvedDelays.length > 0
          ? Math.round(resolvedDelays.reduce((s, v) => s + v, 0) / resolvedDelays.length)
          : null
      );
    }

    // Inventory
    const { data: invData } = await supabase.from('inventory').select('*').order('part_name');
    setInventory(invData ?? []);

    // Contract MRR & renewal rate
    const { data: contractsData } = await supabase
      .from('contracts')
      .select('price_jod, plan_type, auto_renew')
      .eq('status', 'active');
    if (contractsData && contractsData.length > 0) {
      const divisor: Record<string, number> = { monthly: 1, quarterly: 3, biannual: 6, annual: 12 };
      const mrr = (contractsData as { price_jod: number; plan_type: string }[])
        .reduce((sum, c) => sum + (c.price_jod / (divisor[c.plan_type] ?? 1)), 0);
      setContractMRR(Math.round(mrr));
      const withAutoRenew = (contractsData as { auto_renew: boolean }[]).filter(c => c.auto_renew).length;
      setContractRenewalRate(Math.round((withAutoRenew / contractsData.length) * 100));
    }

    // All appointments for owner schedule view
    const { data: apptData } = await supabase
      .from('appointments')
      .select('id, service_type, scheduled_at, status, address, notes, approval_notes, customer_id, technician_id, customers(name, address, phone)')
      .order('scheduled_at', { ascending: false })
      .limit(150);
    setOwnerAppts((apptData ?? []).map(normaliseOwnerAppt));
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleInventoryUpdate(id: string) {
    const { error } = await supabase.from('inventory').update({ quantity: editingInvQty }).eq('id', id);
    if (!error) setInventory(prev => prev.map(i => i.id === id ? { ...i, quantity: editingInvQty } : i));
    setEditingInvId(null);
  }

  async function handleOwnerApptUpdate(updates: Record<string, unknown>) {
    if (!ownerApptModal) return;
    setOwnerApptModal(prev => prev ? { ...prev, submitting: true } : null);
    const { error } = await supabase.from('appointments').update(updates).eq('id', ownerApptModal.appt.id);
    if (!error) {
      setOwnerApptModal(null);
      loadData();
      showToast(t('toast.success'), 'success');
    } else {
      showToast(t('toast.error'), 'error');
      setOwnerApptModal(prev => prev ? { ...prev, submitting: false } : null);
    }
  }

  const monthKeys = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const revenueData = monthKeys.map((key, i) => ({
    name: t(`months.${key}`),
    value: [12000, 15000, 18000, 14000, 22000, 19000, 25000, 28000, 21000, 30000, 27000, 32000][i],
  }));

  const statusColors: Record<string, { dot: string; text: string }> = {
    available: { dot: 'bg-green-500', text: 'text-green-700' },
    busy: { dot: 'bg-orange-500', text: 'text-orange-700' },
  };

  const stats = [
    { label: t('owner.totalCustomers'), value: customerCount, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: t('owner.todayAppointments'), value: todayAppts, icon: CalendarCheck, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    { label: t('owner.monthlyVisits'), value: monthlyVisits, icon: MapPin, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100' },
    { label: t('owner.totalTechnicians'), value: technicianCount, icon: UserCog, color: 'text-gold', bg: 'bg-gold-50', border: 'border-gold-100' },
  ];

  function formatTimeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return t('time.daysAgo', { count: days });
    if (hours > 0) return t('time.hoursAgo', { count: hours });
    return t('time.minutesAgo', { count: Math.max(1, Math.floor(diff / 60000)) });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t('owner.greeting')}، {profile?.full_name?.split(' ')[0] ?? ''}
            </h1>
            <p className="text-slate-500 mt-1">{t('owner.overview')}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => setShowAddCustomer(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              {t('customerForm.title')}
            </button>
            <button
              onClick={() => setShowImportCustomers(true)}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-semibold transition"
            >
              <Upload className="w-4 h-4" />
              {t('customerImport.title')}
            </button>
            <div className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-sm font-medium border border-blue-100">
              <Activity className="w-4 h-4" />
              {t('owner.liveDashboard')}
            </div>
          </div>
        </div>

        {/* ── Customers registered with nothing booked yet ── */}
        {awaitingCustomers.length > 0 && (
          <div className="mb-6 bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden">
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-sm font-semibold text-amber-900">
                {t('admin.awaitingActionTitle', { count: awaitingCustomers.length })}
              </p>
            </div>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {awaitingCustomers.slice(0, 8).map(c => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 text-sm truncate">{c.name}</p>
                      {openOffers[c.id] && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-purple-100 text-purple-700 whitespace-nowrap shrink-0">
                          {openOffers[c.id].quote_number}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500" dir="ltr">{c.phone}</p>
                  </div>
                  <CustomerNextStep
                    customer={c}
                    offer={openOffers[c.id] ?? null}
                    highlight
                    onChanged={() => loadAwaitingCustomers()}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Low Stock Banner ── */}
        {inventory.filter(i => i.quantity < 5).length > 0 && (
          <div
            className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-amber-100 transition"
            onClick={() => setOwnerTab('inventory')}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-900">
              ⚠️ {inventory.filter(i => i.quantity < 5).length} {inventory.filter(i => i.quantity < 5).length === 1 ? 'item is' : 'items are'} low on stock — check Inventory tab
            </p>
          </div>
        )}

        {/* ── Tab Bar ── */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 mb-8">
          {(['overview', 'appointments', 'inventory'] as const).map(tab => {
            const lowStockCount = inventory.filter(i => i.quantity < 5).length;
            const needsReviewCount = ownerAppts.filter(a => a.status === 'pending' && a.notes?.toLowerCase().includes('customer rejected')).length;
            const labels: Record<string, string> = {
              overview:     t('owner.overview'),
              appointments: 'Schedule',
              inventory:    t('admin.inventoryList'),
            };
            return (
              <button
                key={tab}
                onClick={() => setOwnerTab(tab)}
                className={`relative flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition ${ownerTab === tab ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {labels[tab]}
                {tab === 'inventory' && lowStockCount > 0 && (
                  <span className="absolute -top-1 -end-1 min-w-[1rem] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {lowStockCount > 9 ? '9+' : lowStockCount}
                  </span>
                )}
                {tab === 'appointments' && needsReviewCount > 0 && (
                  <span className="absolute -top-1 -end-1 min-w-[1rem] h-4 px-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {needsReviewCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Inventory Tab ── */}
        {ownerTab === 'inventory' && (
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
              const isEditing = editingInvId === item.id;
              return (
                <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{item.part_name}</p>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          type="number"
                          min={0}
                          value={editingInvQty}
                          onChange={e => setEditingInvQty(Number(e.target.value))}
                          onKeyDown={e => {
                            if (e.key === 'Enter')  handleInventoryUpdate(item.id);
                            if (e.key === 'Escape') setEditingInvId(null);
                          }}
                          className="w-16 text-xs border border-blue-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        <span className="text-xs text-slate-400">{item.unit}</span>
                        <button onClick={() => handleInventoryUpdate(item.id)} className="text-xs text-blue-600 hover:text-blue-700 font-semibold">{t('common.save')}</button>
                        <button onClick={() => setEditingInvId(null)} className="text-xs text-slate-400 hover:text-slate-600">{t('common.cancel')}</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingInvId(item.id); setEditingInvQty(item.quantity); }}
                        className="text-xs text-slate-400 hover:text-blue-600 transition text-start"
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

        {/* ── Appointments Tab ── */}
        {ownerTab === 'appointments' && (() => {
          const apptStatusConfig: Record<string, { label: string; bg: string; text: string }> = {
            pending:           { label: t('status.pending'),          bg: 'bg-amber-100',  text: 'text-amber-700'  },
            in_progress:       { label: t('status.inProgress'),       bg: 'bg-blue-100',   text: 'text-blue-700'   },
            awaiting_approval: { label: t('status.awaitingApproval'), bg: 'bg-purple-100', text: 'text-purple-700' },
            completed:         { label: t('status.completed'),        bg: 'bg-green-100',  text: 'text-green-700'  },
            cancelled:         { label: t('status.cancelled'),        bg: 'bg-red-100',    text: 'text-red-700'    },
          };
          const filtered = ownerApptStatusFilter === 'all'
            ? ownerAppts
            : ownerAppts.filter(a => a.status === ownerApptStatusFilter);
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
              <div className="px-5 py-4 border-b border-slate-100 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-500" />
                    Schedule
                    {filtered.length > 0 && <span className="text-xs font-normal text-slate-400">({filtered.length})</span>}
                  </h2>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {(['all', 'pending', 'in_progress', 'awaiting_approval', 'completed'] as const).map(f => (
                    <button key={f} onClick={() => setOwnerApptStatusFilter(f)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${ownerApptStatusFilter === f ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy hover:text-navy'}`}>
                      {f === 'all' ? t('admin.filterAll') : (apptStatusConfig[f]?.label ?? f)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-start px-5 py-3 text-xs font-semibold text-slate-500">{t('admin.customer')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.technician')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.serviceType')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('admin.time')}</th>
                      <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.length === 0 ? (
                      <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">{t('common.noData')}</td></tr>
                    ) : filtered.map(appt => {
                      const sc = apptStatusConfig[appt.status] ?? apptStatusConfig.pending;
                      const techName = technicianList.find(t => t.id === appt.technician_id)?.full_name ?? t('status.unassigned');
                      const isNeedsReview = appt.status === 'pending' && !!appt.notes?.toLowerCase().includes('customer rejected');
                      return (
                        <tr key={appt.id} onClick={() => setOwnerApptModal({ appt, rescheduleDate: '', reassignTechId: '', submitting: false })}
                          className="cursor-pointer hover:bg-blue-50/30 transition-all">
                          <td className="px-5 py-3 font-medium text-slate-900">{appt.customers?.name ?? '-'}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">{techName}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs truncate max-w-[140px]">{appt.service_type}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {new Date(appt.scheduled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                            {' '}
                            {new Date(appt.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${sc.bg} ${sc.text}`}>{sc.label}</span>
                              {isNeedsReview && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-700">
                                  <AlertTriangle className="w-2.5 h-2.5" />Needs Review
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* ── Overview Tab ── */}
        {ownerTab === 'overview' && (<>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {stats.map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className={`bg-white rounded-2xl p-5 shadow-sm border ${stat.border} hover:shadow-md transition-shadow`}>
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <span className="flex items-center gap-0.5 text-xs font-semibold text-green-600">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </span>
                </div>
                <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-sm text-slate-500 mt-0.5">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* Visit mix this month + confirmation backlog */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
          <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-slate-900">{t('visit.mixThisMonth')}</p>
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>
            {visitMix.length === 0 ? (
              <p className="text-sm text-slate-400">{t('common.noData')}</p>
            ) : (
              <div className="space-y-2.5">
                {visitMix.map(row => {
                  const total = visitMix.reduce((sum, r) => sum + r.count, 0);
                  const def = visitTypeDef(row.type);
                  return (
                    <div key={row.type} className="flex items-center gap-3">
                      <span className="w-40 shrink-0"><VisitTypeBadge visitType={row.type} /></span>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${def.dot} rounded-full`} style={{ width: `${Math.round((row.count / total) * 100)}%` }} />
                      </div>
                      <span className="w-8 text-end text-sm font-semibold text-slate-700">{row.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div
            className={`rounded-2xl p-5 shadow-sm border transition-shadow ${
              unconfirmedCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-100'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${unconfirmedCount > 0 ? 'bg-amber-100' : 'bg-slate-50'}`}>
                <AlertTriangle className={`w-5 h-5 ${unconfirmedCount > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
              </div>
            </div>
            <p className="text-3xl font-bold text-slate-900">{unconfirmedCount}</p>
            <p className="text-sm text-slate-500 mt-0.5">{t('visit.unconfirmedUpcoming')}</p>
          </div>
        </div>

        {/* Contract KPIs */}
        {(contractMRR > 0 || contractRenewalRate !== null) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-8">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-purple-100 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-purple-600" />
                </div>
                <span className="text-xs text-slate-400">monthly recurring</span>
              </div>
              <p className="text-3xl font-bold text-slate-900">{contractMRR} JOD</p>
              <p className="text-sm text-slate-500 mt-0.5">Contract MRR</p>
            </div>
            {contractRenewalRate !== null && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-teal-100 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-teal-600" />
                  </div>
                  <span className="text-xs text-slate-400">auto-renew enabled</span>
                </div>
                <p className="text-3xl font-bold text-slate-900">{contractRenewalRate}%</p>
                <p className="text-sm text-slate-500 mt-0.5">Renewal Rate</p>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Revenue Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-slate-900">{t('owner.revenueChart')}</h2>
              <span className="text-xs text-slate-400">{t('common.thisMonth')}</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenueData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                  formatter={(value) => [`${Number(value).toLocaleString()} JOD`, t('owner.revenue')]}
                />
                <Bar dataKey="value" fill="#1E3A8A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Technician Status */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">{t('owner.technicianStatus')}</h2>
            </div>
            <div className="p-3 space-y-1">
              {technicianList.length === 0 ? (
                <p className="text-sm text-slate-400 p-3 text-center">{t('common.noData')}</p>
              ) : technicianList.map(tech => {
                const sc = statusColors[tech.status];
                return (
                  <div key={tech.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition">
                    <div className="relative">
                      <div className="w-9 h-9 bg-navy-50 text-navy rounded-lg flex items-center justify-center text-xs font-bold">
                        {tech.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                      <span className={`absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full border-2 border-white ${sc.dot}`} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{tech.full_name}</p>
                    </div>
                    <span className={`text-xs font-medium ${sc.text}`}>
                      {t(`status.${tech.status}`)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick Actions + Activity Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-900 mb-4">{t('owner.quickActions')}</h2>
            <div className="space-y-2">
              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100 transition text-start group">
                <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Send className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{t('owner.sendOffer')}</span>
              </button>
              <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100 transition text-start group">
                <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-green-600" />
                </div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{t('owner.addTechnician')}</span>
              </button>
              <button
                onClick={() => navigate('/dashboard/owner/reports')}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100 transition text-start group"
              >
                <div className="w-9 h-9 bg-navy-50 rounded-lg flex items-center justify-center">
                  <FileBarChart className="w-4 h-4 text-navy" />
                </div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{t('owner.viewReports')}</span>
              </button>
              <button
                onClick={async () => {
                  setSeeding(true);
                  const names = ['سمير الطراونة', 'هناء المجالي', 'وسام البطاينة', 'لمى الحموي'];
                  const services = ['تركيب جهاز تحلية', 'صيانة دورية وقياس TDS', 'استبدال فلاتر', 'فحص غشاء RO'];
                  for (let i = 0; i < names.length; i++) {
                    await supabase.from('customers').upsert({
                      name: names[i],
                      phone: `079${1000000 + i}`,
                      address: 'عمّان، الأردن',
                    }, { onConflict: 'id' });
                  }
                  await supabase.from('activity_log').insert(
                    services.map((s, i) => ({ action: 'seed', description: `${s} — ${names[i]}`, user_id: profile!.id }))
                  );
                  setSeeding(false);
                  showToast(t('owner.seedSuccess'), 'success');
                  loadData();
                }}
                disabled={seeding}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 border border-slate-100 transition text-start group"
              >
                <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
                  <Database className="w-4 h-4 text-amber-600" />
                </div>
                <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                  {seeding ? t('common.loading') : t('owner.seedData')}
                </span>
              </button>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{t('owner.recentActivity')}</h2>
              <button className="text-blue-600 text-sm font-medium hover:text-blue-700">{t('common.viewAll')}</button>
            </div>
            <div className="divide-y divide-slate-50">
              {activities.length > 0 ? activities.map(item => (
                <div key={item.id} className="px-6 py-3.5 flex items-center gap-3 hover:bg-slate-50/50 transition">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Clock className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-800 font-medium truncate">{item.description}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatTimeAgo(item.created_at)}</p>
                  </div>
                </div>
              )) : (
                <div className="px-6 py-8 text-center text-sm text-slate-400">{t('common.noData')}</div>
              )}
            </div>
          </div>
        </div>

        {/* Trigger Insights */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-500" />
            <h2 className="font-semibold text-slate-900">{t('serviceRequests.triggerInsights')}</h2>
            <span className="text-xs text-slate-400 ms-1">{t('common.thisMonth')}</span>
          </div>
          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bar chart */}
            <div className="lg:col-span-2">
              {triggerByType.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-slate-400">{t('common.noData')}</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={triggerByType} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="type"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      width={140}
                      tickFormatter={val => (t as (k: string) => string)(`serviceRequests.${val}`) || val}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                      formatter={(value) => [value, t('serviceRequests.title')]}
                      labelFormatter={val => (t as (k: string) => string)(`serviceRequests.${val}`) || val}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {triggerByType.map((entry, idx) => (
                        <Cell
                          key={entry.type}
                          fill={idx === 0 ? '#1E3A8A' : idx === 1 ? '#3B82F6' : '#93C5FD'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* KPI cards */}
            <div className="flex flex-col gap-4">
              <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 bg-red-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertOctagon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-700">{emergencyCount}</p>
                  <p className="text-xs text-red-600 font-medium mt-0.5">{t('serviceRequests.emergencyCount')}</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-11 h-11 bg-navy rounded-xl flex items-center justify-center flex-shrink-0">
                  <Timer className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-navy">
                    {avgResponseHours !== null ? `${avgResponseHours}h` : '—'}
                  </p>
                  <p className="text-xs text-blue-700 font-medium mt-0.5">{t('serviceRequests.avgResponse')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Invoices section */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-600" />
              <h2 className="font-semibold text-slate-900">{t('invoice.allInvoices')}</h2>
              <span className="text-xs text-slate-400 ms-1">{t('common.thisMonth')}</span>
            </div>
            <div className="flex items-center gap-2">
              {/* KPI chips */}
              <div className="flex items-center gap-1.5 bg-green-50 border border-green-100 rounded-xl px-3 py-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                <span className="text-xs font-bold text-green-700">{invoiceRevenue.toFixed(0)} JOD {t('invoice.paid')}</span>
              </div>
              {invoicePendingCount > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-bold text-amber-700">{invoicePendingTotal.toFixed(0)} JOD {t('invoice.pending')}</span>
                </div>
              )}
              <button
                onClick={() => {
                  const headers = [t('invoice.invoiceNumber'), t('invoice.customerName'), t('invoice.technicianName'), t('invoice.amount'), t('invoice.paymentMethod'), t('invoice.paymentStatus'), 'Date'];
                  const rows = invoices.map(inv => [inv.invoice_number, inv.customer_name, inv.technician_name, inv.total_amount.toFixed(2), inv.payment_method, inv.payment_status, new Date(inv.issued_at).toLocaleDateString('en-GB')]);
                  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
                  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = 'invoices.csv'; a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-medium text-slate-600 transition"
              >
                <Download className="w-3.5 h-3.5" />
                {t('invoice.exportCsv')}
              </button>
            </div>
          </div>

          {/* Filter chips */}
          <div className="px-6 py-3 flex items-center gap-2 border-b border-slate-50">
            {(['all', 'paid', 'pending'] as const).map(f => (
              <button
                key={f}
                onClick={() => setInvoiceFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${invoiceFilter === f ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:border-navy'}`}
              >
                {f === 'all' ? t('admin.filterAll') : f === 'paid' ? t('invoice.paid') : t('invoice.pending')}
              </button>
            ))}
          </div>

          {invoices.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">{t('common.noData')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-start px-5 py-3 text-xs font-semibold text-slate-500">{t('invoice.invoiceNumber')}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('invoice.customerName')}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('invoice.technicianName')}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('invoice.paymentMethod')}</th>
                    <th className="text-end px-4 py-3 text-xs font-semibold text-slate-500">{t('invoice.amount')}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('invoice.paymentStatus')}</th>
                    <th className="text-start px-4 py-3 text-xs font-semibold text-slate-500">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoices
                    .filter(inv => invoiceFilter === 'all' || inv.payment_status === invoiceFilter)
                    .map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-5 py-3 font-mono text-xs font-semibold text-navy">{inv.invoice_number}</td>
                        <td className="px-4 py-3 text-slate-900 font-medium">{inv.customer_name}</td>
                        <td className="px-4 py-3 text-slate-600">{inv.technician_name}</td>
                        <td className="px-4 py-3 text-slate-600 capitalize">{inv.payment_method.replace('_', ' ')}</td>
                        <td className="px-4 py-3 text-end font-bold text-slate-900">{inv.total_amount.toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${inv.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {inv.payment_status === 'paid' ? t('invoice.paid') : t('invoice.pending')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {inv.invoiceData && (
                            <button
                              onClick={() => setSelectedOwnerInvoice(inv.invoiceData!)}
                              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition flex items-center gap-1"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              {t('invoice.viewInvoice')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Appointment Detail Modal ── */}
        {ownerApptModal && (() => {
          const { appt, rescheduleDate, reassignTechId, submitting } = ownerApptModal;
          const apptStatusConfig: Record<string, { label: string; bg: string; text: string }> = {
            pending:           { label: t('status.pending'),          bg: 'bg-amber-100',  text: 'text-amber-700'  },
            in_progress:       { label: t('status.inProgress'),       bg: 'bg-blue-100',   text: 'text-blue-700'   },
            awaiting_approval: { label: t('status.awaitingApproval'), bg: 'bg-purple-100', text: 'text-purple-700' },
            completed:         { label: t('status.completed'),        bg: 'bg-green-100',  text: 'text-green-700'  },
            cancelled:         { label: t('status.cancelled'),        bg: 'bg-red-100',    text: 'text-red-700'    },
          };
          const sc = apptStatusConfig[appt.status] ?? apptStatusConfig.pending;
          const techName = technicianList.find(tl => tl.id === appt.technician_id)?.full_name ?? t('status.unassigned');
          const isNeedsReview = appt.status === 'pending' && !!appt.notes?.toLowerCase().includes('customer rejected');
          const isAwaiting    = appt.status === 'awaiting_approval';
          const isAr = t('status.pending') !== 'Pending';
          return (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setOwnerApptModal(null)}>
              <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
                  <div>
                    <h2 className="font-bold text-slate-900">{appt.customers?.name ?? '-'}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{appt.service_type}</p>
                  </div>
                  <button onClick={() => setOwnerApptModal(null)} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
                    <X className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  {isNeedsReview && (
                    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        <p className="font-bold text-amber-900 text-sm">{isAr ? 'رُفض الاقتراح من العميل — يتطلب المراجعة' : 'Customer rejected this proposal — review required'}</p>
                      </div>
                      {appt.notes && <p className="text-sm text-amber-800 bg-amber-100 rounded-xl px-4 py-2.5 whitespace-pre-wrap">{appt.notes}</p>}
                    </div>
                  )}
                  {isAwaiting && (
                    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-orange-600 shrink-0" />
                        <p className="font-semibold text-orange-900 text-sm">{isAr ? 'في انتظار موافقة العميل' : 'Awaiting customer approval'}</p>
                      </div>
                      {appt.approval_notes && <p className="text-sm text-orange-800 bg-orange-100 rounded-xl px-4 py-2.5 mt-2 whitespace-pre-wrap">{appt.approval_notes}</p>}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 mb-0.5">{t('admin.time')}</p>
                      <p className="text-sm font-semibold text-slate-900">{new Date(appt.scheduled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
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
                  {appt.customers?.phone && (
                    <div className="flex gap-2">
                      <a href={`tel:${appt.customers.phone}`} className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl text-xs font-semibold transition">
                        <Phone className="w-3.5 h-3.5" />{appt.customers.phone}
                      </a>
                      <a href={`https://wa.me/${appt.customers.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Regarding: ${appt.service_type}`)}`} target="_blank" rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl text-xs font-semibold transition">
                        <MessageCircle className="w-3.5 h-3.5" />{isAr ? 'واتساب' : 'WhatsApp'}
                      </a>
                    </div>
                  )}
                  {appt.notes && !isNeedsReview && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">{t('admin.notes')}</p>
                      <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-4 py-3 whitespace-pre-wrap">{appt.notes}</p>
                    </div>
                  )}
                  <div className="border-t border-slate-100 pt-4 space-y-2">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{isAr ? 'الإجراءات' : 'Actions'}</p>
                    {isNeedsReview && (
                      <>
                        <button onClick={() => handleOwnerApptUpdate({ status: 'in_progress', notes: '', approval_granted: false })} disabled={submitting}
                          className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition">
                          <Wrench className="w-4 h-4" />{isAr ? 'مراجعة وإعادة إرسال' : 'Revise & Resubmit'}
                        </button>
                        <div className="flex gap-2">
                          <select value={reassignTechId} onChange={e => setOwnerApptModal(prev => prev ? { ...prev, reassignTechId: e.target.value } : null)}
                            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="">{isAr ? 'إعادة تعيين فني...' : 'Reassign technician...'}</option>
                            {technicianList.map(tl => <option key={tl.id} value={tl.id}>{tl.full_name}</option>)}
                          </select>
                          <button onClick={() => reassignTechId && handleOwnerApptUpdate({ technician_id: reassignTechId, status: 'in_progress', notes: '' })} disabled={submitting || !reassignTechId}
                            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
                            <UserCog className="w-4 h-4" />{isAr ? 'تعيين' : 'Assign'}
                          </button>
                        </div>
                      </>
                    )}
                    {appt.status === 'pending' && !isNeedsReview && (
                      <button onClick={() => handleOwnerApptUpdate({ status: 'in_progress' })} disabled={submitting}
                        className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition">
                        <CheckCircle className="w-4 h-4" />{isAr ? 'تحديد كقيد التنفيذ' : 'Mark In Progress'}
                      </button>
                    )}
                    {!appt.technician_id && (
                      <div className="flex gap-2">
                        <select value={reassignTechId} onChange={e => setOwnerApptModal(prev => prev ? { ...prev, reassignTechId: e.target.value } : null)}
                          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-orange-500 outline-none">
                          <option value="">{isAr ? 'تعيين فني...' : 'Assign technician...'}</option>
                          {technicianList.map(tl => <option key={tl.id} value={tl.id}>{tl.full_name}</option>)}
                        </select>
                        <button onClick={() => reassignTechId && handleOwnerApptUpdate({ technician_id: reassignTechId })} disabled={submitting || !reassignTechId}
                          className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
                          <UserCog className="w-4 h-4" />{isAr ? 'تعيين' : 'Assign'}
                        </button>
                      </div>
                    )}
                    {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                      <div className="flex gap-2">
                        <input type="datetime-local" value={rescheduleDate}
                          onChange={e => setOwnerApptModal(prev => prev ? { ...prev, rescheduleDate: e.target.value } : null)}
                          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-slate-500 outline-none" />
                        <button onClick={() => rescheduleDate && handleOwnerApptUpdate({ scheduled_at: new Date(rescheduleDate).toISOString() })} disabled={submitting || !rescheduleDate}
                          className="flex items-center gap-1.5 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-semibold transition">
                          <Calendar className="w-4 h-4" />{isAr ? 'جدولة' : 'Reschedule'}
                        </button>
                      </div>
                    )}
                    {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                      <button onClick={() => handleOwnerApptUpdate({ status: 'cancelled' })} disabled={submitting}
                        className="w-full flex items-center gap-2 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-600 border border-red-200 py-2.5 rounded-xl text-sm font-semibold transition">
                        <X className="w-4 h-4" />{isAr ? 'إلغاء الموعد' : 'Cancel Appointment'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {selectedOwnerInvoice && (
          <PrintableInvoice invoice={selectedOwnerInvoice} onClose={() => setSelectedOwnerInvoice(null)} />
        )}

        {/* Portal description */}
        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
              <Activity className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-semibold text-blue-900">{t('owner.portalTitle')}</p>
              <p className="text-sm text-blue-700">{t('owner.portalDesc')}</p>
            </div>
          </div>
        </div>
        </>)}

      </div>

      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onCreated={() => { loadData(); }}
          onOpenImport={() => { setShowAddCustomer(false); setShowImportCustomers(true); }}
        />
      )}

      {showImportCustomers && (
        <ImportCustomersModal
          onClose={() => setShowImportCustomers(false)}
          onImported={() => { loadData(); }}
        />
      )}
    </div>
  );
}
