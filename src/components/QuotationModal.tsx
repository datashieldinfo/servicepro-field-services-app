import { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Plus, Trash2, FileSpreadsheet, MessageCircle, Mail, Printer,
  AlertTriangle, PackagePlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { useAuth } from '../contexts/AuthContext';
import PrintableQuotation from './PrintableQuotation';
import {
  defaultValidUntil,
  lineTotal,
  nextQuoteNumber,
  quotationMessage,
  quotationTotals,
  type LineKind,
  type QuotationItem,
} from '../lib/quotationFields';

interface CatalogItem {
  id: string;
  part_name: string;
  category: string;
  selling_price: number | null;
}

interface DraftLine extends QuotationItem {
  key: string;
}

interface Props {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  onClose: () => void;
  onSaved: (quotationId: string) => void;
  /** Offered after saving: turn the quoted devices into an installation. */
  onConvert?: (quotationId: string, devices: { device_brand: string; catalog_id: string }[]) => void;
}

function newLine(overrides: Partial<DraftLine> = {}): DraftLine {
  return {
    key: crypto.randomUUID(),
    kind: 'device',
    ref_id: null,
    name: '',
    qty: 1,
    unit_price: 0,
    total: 0,
    ...overrides,
  };
}

/**
 * Builds a price offer for a customer — typically a new device before any
 * installation exists — and shares it over WhatsApp or email.
 */
export default function QuotationModal({
  customerId,
  customerName,
  customerPhone,
  customerEmail,
  customerAddress,
  onClose,
  onSaved,
  onConvert,
}: Props) {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [discount, setDiscount] = useState(0);
  const [validUntil, setValidUntil] = useState(defaultValidUntil());
  const [notes, setNotes] = useState(() => t('quote.notesDefault'));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ id: string; quote_number: string } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('inventory')
        .select('id, part_name, category, selling_price')
        .order('category')
        .order('part_name');
      setCatalog((data ?? []) as CatalogItem[]);
    })();
  }, []);

  const { subtotal, total } = useMemo(
    () => quotationTotals(lines, discount),
    [lines, discount]
  );

  function patchLine(key: string, changes: Partial<DraftLine>) {
    setLines(prev => prev.map(l => {
      if (l.key !== key) return l;
      const next = { ...l, ...changes };
      next.total = lineTotal(next.qty, next.unit_price);
      return next;
    }));
    setError(null);
  }

  function pickCatalogItem(key: string, itemId: string) {
    const item = catalog.find(c => c.id === itemId);
    if (!item) {
      patchLine(key, { ref_id: null, kind: 'custom' });
      return;
    }
    patchLine(key, {
      ref_id: item.id,
      name: item.part_name,
      unit_price: Number(item.selling_price ?? 0),
      kind: (['device', 'part', 'accessory', 'service'].includes(item.category)
        ? item.category
        : 'custom') as LineKind,
    });
  }

  async function handleSave() {
    const usable = lines.filter(l => l.name.trim() && l.qty > 0);
    if (!usable.length) {
      setError(t('quote.errNoLines'));
      return;
    }

    setSaving(true);
    const quoteNumber = await nextQuoteNumber();
    const items: QuotationItem[] = usable.map(({ key, ...item }) => {
      void key;
      return { ...item, name: item.name.trim() };
    });

    const { data, error: saveError } = await supabase
      .from('quotations')
      .insert({
        quote_number: quoteNumber,
        customer_id: customerId,
        status: 'draft',
        items,
        subtotal,
        discount,
        total_amount: total,
        valid_until: validUntil || null,
        notes: notes.trim(),
        created_by: profile?.id ?? null,
      })
      .select('id, quote_number')
      .single();

    setSaving(false);

    if (saveError || !data) {
      showToast(saveError?.message ?? t('toast.error'), 'error');
      return;
    }

    setSaved(data);
    showToast(t('quote.saved', { number: data.quote_number }), 'success');
    onSaved(data.id);
  }

  async function markSent(channel: 'whatsapp' | 'email' | 'print') {
    if (!saved) return;
    await supabase
      .from('quotations')
      .update({ status: 'sent', sent_at: new Date().toISOString(), sent_channel: channel })
      .eq('id', saved.id);
  }

  const message = useMemo(() => {
    if (!saved) return '';
    return quotationMessage(
      {
        quote_number: saved.quote_number,
        items: lines.filter(l => l.name.trim()),
        total_amount: total,
        currency: 'JOD',
        valid_until: validUntil || null,
      },
      customerName,
      isAr
    );
  }, [saved, lines, total, validUntil, customerName, isAr]);

  function shareWhatsApp() {
    const digits = (customerPhone ?? '').replace(/\D/g, '');
    markSent('whatsapp');
    window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  }

  function shareEmail() {
    const subject = isAr
      ? `عرض سعر ${saved?.quote_number} — BioFamily`
      : `Price offer ${saved?.quote_number} — BioFamily`;
    markSent('email');
    window.location.href =
      `mailto:${customerEmail ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  }

  const devicesForInstall = lines
    .filter(l => l.kind === 'device' && l.name.trim())
    .map(l => ({ device_brand: l.name, catalog_id: l.ref_id ?? '' }));

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">{t('quote.title')}</h2>
              <p className="text-xs text-slate-500">{customerName}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {saved ? (
          /* ── Saved: share it ───────────────────────────────────────────── */
          <div className="p-5 space-y-5">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-sm text-green-800">{t('quote.savedTitle')}</p>
              <p className="text-2xl font-bold text-green-900 mt-1" dir="ltr">{saved.quote_number}</p>
              <p className="text-sm text-green-700 mt-1">{total.toFixed(2)} JOD</p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">{t('quote.share')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  onClick={shareWhatsApp}
                  disabled={!customerPhone}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t('quote.viaWhatsApp')}
                </button>
                <button
                  onClick={shareEmail}
                  disabled={!customerEmail}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold transition"
                >
                  <Mail className="w-4 h-4" />
                  {t('quote.viaEmail')}
                </button>
                <button
                  onClick={() => { markSent('print'); setPrinting(true); }}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition"
                >
                  <Printer className="w-4 h-4" />
                  {t('quote.print')}
                </button>
              </div>
              {!customerPhone && <p className="text-[11px] text-slate-400 mt-1.5">{t('quote.noPhone')}</p>}
              {!customerEmail && <p className="text-[11px] text-slate-400 mt-1">{t('quote.noEmail')}</p>}
            </div>

            <pre className="text-xs bg-slate-50 border border-slate-200 rounded-xl p-3 whitespace-pre-wrap text-slate-600 max-h-48 overflow-y-auto">
              {message}
            </pre>

            {onConvert && devicesForInstall.length > 0 && (
              <button
                onClick={() => onConvert(saved.id, devicesForInstall)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-blue-200 bg-blue-50 hover:border-blue-400 transition text-start"
              >
                <PackagePlus className="w-5 h-5 text-blue-600 shrink-0" />
                <span>
                  <span className="block text-sm font-semibold text-blue-900">{t('quote.convertTitle')}</span>
                  <span className="block text-[11px] text-blue-700">{t('quote.convertDesc')}</span>
                </span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
            >
              {t('common.close')}
            </button>
          </div>
        ) : (
          /* ── Building the offer ────────────────────────────────────────── */
          <div className="p-5 space-y-5">
            <section className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('quote.lines')}</h3>

              {lines.map((line, index) => (
                <div key={line.key} className="border border-slate-200 rounded-xl p-3 space-y-3 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">{t('quote.line')} {index + 1}</span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines(prev => prev.filter(l => l.key !== line.key))}
                        className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">{t('quote.fromCatalog')}</label>
                    <select
                      value={line.ref_id ?? ''}
                      onChange={e => pickCatalogItem(line.key, e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                    >
                      <option value="">{t('quote.customLine')}</option>
                      {catalog.map(c => (
                        <option key={c.id} value={c.id}>
                          [{t(`quote.kind.${c.category}`)}] {c.part_name}
                          {c.selling_price ? ` — ${Number(c.selling_price).toFixed(2)} JOD` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-600 mb-1">{t('quote.itemName')}</label>
                      <input
                        value={line.name}
                        onChange={e => patchLine(line.key, { name: e.target.value })}
                        placeholder={t('quote.itemPlaceholder')}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">{t('quote.qty')}</label>
                      <input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={e => patchLine(line.key, { qty: Math.max(1, Number(e.target.value)) })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">{t('quote.unitPrice')}</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unit_price}
                        onChange={e => patchLine(line.key, { unit_price: Math.max(0, Number(e.target.value)) })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-end font-semibold text-slate-600">
                    {t('quote.lineTotal')}: {line.total.toFixed(2)} JOD
                  </p>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setLines(prev => [...prev, newLine()])}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-purple-300 hover:text-purple-600 transition"
              >
                <Plus className="w-4 h-4" />
                {t('quote.addLine')}
              </button>
            </section>

            <section className="space-y-3 border-t border-slate-100 pt-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{t('quote.discount')}</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={discount}
                    onChange={e => setDiscount(Math.max(0, Number(e.target.value)))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{t('quote.validUntil')}</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('quote.notes')}</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t('quote.notesPlaceholder')}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>

              <div className="bg-slate-50 rounded-xl p-3 space-y-1 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>{t('quote.subtotal')}</span>
                  <span>{subtotal.toFixed(2)} JOD</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>{t('quote.discount')}</span>
                    <span>− {discount.toFixed(2)} JOD</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-slate-900 text-base border-t border-slate-200 pt-1 mt-1">
                  <span>{t('quote.total')}</span>
                  <span>{total.toFixed(2)} JOD</span>
                </div>
              </div>
            </section>

            {error && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                {t('quote.save')}
              </button>
            </div>
          </div>
        )}
      </div>

      {printing && saved && (
        <PrintableQuotation
          quote={{
            quoteNumber: saved.quote_number,
            issuedAt: new Date().toISOString(),
            validUntil: validUntil || null,
            customer: {
              name: customerName,
              address: customerAddress ?? '',
              phone: customerPhone ?? '',
              email: customerEmail,
            },
            items: lines.filter(l => l.name.trim()).map(({ key, ...item }) => { void key; return item; }),
            subtotal,
            discount,
            total,
            currency: 'JOD',
            notes: notes.trim(),
          }}
          onClose={() => setPrinting(false)}
        />
      )}
    </div>
  );
}
