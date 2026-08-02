import { useCallback, useEffect, useState } from 'react';
import {
  X, Loader2, Package, ArrowDownLeft, ArrowUpRight, Plus, Save,
  Building, CalendarClock, AlertTriangle, User, Truck, History,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { fmtDate, fmtDateTime } from '../lib/format';
import { USAGE_TONE, type UsageType } from '../lib/deviceFields';
import {
  MOVEMENT_REASONS_IN, MOVEMENT_REASONS_OUT, branchLabel, fetchBranchStock, fetchBranches,
  fetchItemLedger, recordMovement, summariseLedger,
  type Branch, type BranchStock, type InventoryTransaction, type LedgerSummary, type MovementDirection,
} from '../lib/inventoryLedger';

export interface InventoryItem {
  id: string;
  part_name: string;
  category?: string | null;
  usage_type?: UsageType | null;
  quantity: number;
  unit: string;
  low_stock_threshold: number;
  cost_price?: number | null;
  selling_price?: number | null;
}

interface Props {
  item: InventoryItem;
  /** Staff can book movements; technicians only read the card. */
  canEdit?: boolean;
  onClose: () => void;
  /** Fired after a movement, so the list behind the card can refresh. */
  onChanged?: () => void;
}

/**
 * Everything known about one stocked item: how many are in which branch, when
 * it was last filled and by whom, who it came from, when the batch expires, and
 * every movement in and out since.
 *
 * The card can also book a movement, because a ledger nobody can write to goes
 * stale on the first day. The database recomputes the item's total afterwards.
 */
export default function InventoryItemCard({ item, canEdit = true, onClose, onChanged }: Props) {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [branches, setBranches] = useState<Branch[]>([]);
  const [stock, setStock] = useState<BranchStock[]>([]);
  const [ledger, setLedger] = useState<InventoryTransaction[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  /* The movement being booked. */
  const [direction, setDirection] = useState<MovementDirection>('in');
  const [branchId, setBranchId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState<string>('purchase');
  const [counterparty, setCounterparty] = useState('');
  const [reference, setReference] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [branchRows, stockRows, ledgerRows] = await Promise.all([
      fetchBranches(),
      fetchBranchStock(item.id),
      fetchItemLedger(item.id),
    ]);
    setBranches(branchRows);
    setStock(stockRows);
    setLedger(ledgerRows);
    setSummary(summariseLedger(ledgerRows));
    setBranchId(current => current || branchRows.find(b => b.is_default)?.id || branchRows[0]?.id || '');
    setLoading(false);
  }, [item.id]);

  useEffect(() => { load(); }, [load]);

  /* In and out are not booked for the same reasons. */
  useEffect(() => {
    setReason(direction === 'in' ? 'purchase' : 'issue');
  }, [direction]);

  const total = stock.reduce((sum, row) => sum + row.quantity, 0);
  const low = total < item.low_stock_threshold;
  const lastIn = summary?.lastIn ?? null;

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!branchId) { showToast(t('inventoryCard.errBranch'), 'warning'); return; }
    if (quantity < 1) { showToast(t('inventoryCard.errQuantity'), 'warning'); return; }

    setSaving(true);
    const { error } = await recordMovement({
      itemId: item.id,
      branchId,
      direction,
      reason,
      quantity,
      counterparty,
      reference,
      batchNo,
      expiryDate: direction === 'in' ? expiryDate : null,
      note,
      performedBy: profile?.id ?? null,
    });
    setSaving(false);

    if (error) { showToast(error.message, 'error'); return; }

    showToast(t('inventoryCard.movementSaved'), 'success');
    setShowForm(false);
    setQuantity(1);
    setCounterparty('');
    setReference('');
    setBatchNo('');
    setExpiryDate('');
    setNote('');
    await load();
    onChanged?.();
  }

  const field = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-navy outline-none';
  const th = 'text-start px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500';

  return (
    <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-navy/10 rounded-xl flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-navy" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-900 text-base truncate">{item.part_name}</h2>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                {item.category && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
                    {t(`inventory.category_${item.category}`, item.category)}
                  </span>
                )}
                {item.category === 'device' && item.usage_type && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${USAGE_TONE[item.usage_type]}`}>
                    {t(`device.usage_${item.usage_type}`)}
                  </span>
                )}
                <span className="text-[11px] text-slate-400">{t('inventory.unit')}: {item.unit}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition shrink-0">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
        ) : (
          <div className="p-5 space-y-5">

            {/* Headline numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className={`rounded-xl border p-3 ${low ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className={`text-xl font-bold ${low ? 'text-red-700' : 'text-slate-900'}`}>{total}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('inventoryCard.onHand')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xl font-bold text-slate-900">{summary?.totalIn ?? 0}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('inventoryCard.totalIn')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xl font-bold text-slate-900">{summary?.totalOut ?? 0}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('inventoryCard.totalOut')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-bold text-slate-900">
                  {item.cost_price ?? 0} / {item.selling_price ?? 0}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">{t('inventoryCard.costSelling')}</p>
              </div>
            </div>

            {(low || summary?.expired) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-900">
                  {low && t('inventoryCard.lowStock', { threshold: item.low_stock_threshold })}
                  {low && summary?.expired ? ' · ' : ''}
                  {summary?.expired && t('inventoryCard.hasExpired')}
                </p>
              </div>
            )}

            {/* Where the stock sits */}
            <section>
              <p className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                <Building className="w-4 h-4 text-slate-400" /> {t('inventoryCard.byBranch')}
              </p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>{t('inventoryCard.branch')}</th>
                      <th className={th}>{t('inventoryCard.quantity')}</th>
                      <th className={th}>{t('inventoryCard.lastFilled')}</th>
                      <th className={th}>{t('inventoryCard.expiry')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stock.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-400">{t('inventoryCard.noMovements')}</td></tr>
                    ) : stock.map(row => (
                      <tr key={row.branch_id}>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {branchLabel({ name: row.branch_name, name_ar: row.branch_name_ar }, isAr)}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{row.quantity} {item.unit}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs">{row.last_in_at ? fmtDate(row.last_in_at) : '—'}</td>
                        <td className="px-3 py-2 text-slate-500 text-xs">{row.next_expiry ? fmtDate(row.next_expiry) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* The last time it was filled */}
            {lastIn && (
              <section className="grid sm:grid-cols-2 gap-3">
                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-green-600" /> {t('inventoryCard.lastEntry')}
                  </p>
                  <p className="text-sm font-semibold text-slate-800">
                    {lastIn.quantity} {item.unit} · {fmtDateTime(lastIn.created_at)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                    <User className="w-3 h-3 text-slate-400" />
                    {t('inventoryCard.by')}: {lastIn.performer?.full_name ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Truck className="w-3 h-3 text-slate-400" />
                    {t('inventoryCard.from')}: {lastIn.counterparty || '—'}
                  </p>
                  {lastIn.batch_no && (
                    <p className="text-xs text-slate-500">{t('inventoryCard.batch')}: {lastIn.batch_no}</p>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-slate-400" /> {t('inventoryCard.expiry')}
                  </p>
                  <p className="text-sm font-semibold text-slate-800">
                    {summary?.nextExpiry ? fmtDate(summary.nextExpiry) : t('inventoryCard.noExpiry')}
                  </p>
                  {summary?.lastOut && (
                    <>
                      <p className="text-[11px] uppercase tracking-wide text-slate-400 mt-3 mb-1 flex items-center gap-1.5">
                        <ArrowUpRight className="w-3.5 h-3.5 text-red-500" /> {t('inventoryCard.lastIssue')}
                      </p>
                      <p className="text-xs text-slate-600">
                        {summary.lastOut.quantity} {item.unit} · {fmtDate(summary.lastOut.created_at)} ·{' '}
                        {summary.lastOut.counterparty || summary.lastOut.performer?.full_name || '—'}
                      </p>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* Book a movement */}
            {canEdit && (
              showForm ? (
                <form onSubmit={handleBook} className="border border-navy/20 bg-navy/5 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    {(['in', 'out'] as const).map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDirection(d)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition ${
                          direction === d
                            ? d === 'in' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700'
                            : 'border-slate-200 bg-white text-slate-500'
                        }`}
                      >
                        {t(`inventoryCard.direction_${d}`)}
                      </button>
                    ))}
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">{t('inventoryCard.branch')}</label>
                      <select value={branchId} onChange={e => setBranchId(e.target.value)} className={field}>
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{branchLabel(b, isAr)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">{t('inventoryCard.quantity')}</label>
                      <input
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">{t('inventoryCard.reason')}</label>
                      <select value={reason} onChange={e => setReason(e.target.value)} className={field}>
                        {(direction === 'in' ? MOVEMENT_REASONS_IN : MOVEMENT_REASONS_OUT).map(r => (
                          <option key={r} value={r}>{t(`inventoryCard.reason_${r}`)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        {direction === 'in' ? t('inventoryCard.from') : t('inventoryCard.to')}
                      </label>
                      <input
                        value={counterparty}
                        onChange={e => setCounterparty(e.target.value)}
                        placeholder={direction === 'in' ? t('inventoryCard.fromPlaceholder') : t('inventoryCard.toPlaceholder')}
                        className={field}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">{t('inventoryCard.reference')}</label>
                      <input
                        value={reference}
                        onChange={e => setReference(e.target.value)}
                        placeholder={t('inventoryCard.referencePlaceholder')}
                        className={field}
                      />
                    </div>
                  </div>

                  {direction === 'in' && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">{t('inventoryCard.batch')}</label>
                        <input value={batchNo} onChange={e => setBatchNo(e.target.value)} className={field} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          {t('inventoryCard.expiry')} <span className="font-normal text-slate-400">{t('inventoryCard.ifApplicable')}</span>
                        </label>
                        <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={field} />
                      </div>
                    </div>
                  )}

                  <input
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder={t('common.notes')}
                    className={field}
                  />

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 py-2.5 rounded-xl bg-navy hover:bg-navy/90 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {t('inventoryCard.book')}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-navy/40 hover:text-navy transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> {t('inventoryCard.recordMovement')}
                </button>
              )
            )}

            {/* Everything that ever moved */}
            <section>
              <p className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                <History className="w-4 h-4 text-slate-400" /> {t('inventoryCard.movements')}
              </p>
              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>{t('inventoryCard.date')}</th>
                      <th className={th}>{t('inventoryCard.movement')}</th>
                      <th className={th}>{t('inventoryCard.branch')}</th>
                      <th className={th}>{t('inventoryCard.by')}</th>
                      <th className={th}>{t('inventoryCard.party')}</th>
                      <th className={th}>{t('common.notes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ledger.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-4 text-center text-xs text-slate-400">{t('inventoryCard.noMovements')}</td></tr>
                    ) : ledger.map(row => (
                      <tr key={row.id}>
                        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(row.created_at)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                            row.direction === 'in' ? 'text-green-700' : 'text-red-600'
                          }`}>
                            {row.direction === 'in'
                              ? <ArrowDownLeft className="w-3.5 h-3.5" />
                              : <ArrowUpRight className="w-3.5 h-3.5" />}
                            {row.direction === 'in' ? '+' : '−'}{row.quantity}
                          </span>
                          <span className="block text-[10px] text-slate-400">{t(`inventoryCard.reason_${row.reason}`, row.reason)}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">{branchLabel(row.branch, isAr)}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{row.performer?.full_name ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {row.counterparty || '—'}
                          {row.reference && <span className="block text-[10px] text-slate-400">{row.reference}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {row.note || '—'}
                          {row.expiry_date && (
                            <span className="block text-[10px] text-slate-400">
                              {t('inventoryCard.expiry')}: {fmtDate(row.expiry_date)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
