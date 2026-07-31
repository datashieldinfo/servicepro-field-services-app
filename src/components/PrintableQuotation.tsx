import { createPortal } from 'react-dom';
import { X, Printer, MessageCircle, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import { quotationMessage, type QuotationItem } from '../lib/quotationFields';
import { fmtDate } from '../lib/format';

export interface QuotationData {
  quoteNumber: string;
  issuedAt: string;
  validUntil: string | null;
  customer: { name: string; address: string; phone: string; email?: string };
  items: QuotationItem[];
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  notes: string;
  status?: string;
}

interface Props {
  quote: QuotationData;
  onClose: () => void;
}

/**
 * The customer-facing price offer. Printing used to fall back to
 * `window.print()` on the dashboard, which put the whole operations screen on
 * paper; this is the actual document, and the print rules hide everything else.
 */
export default function PrintableQuotation({ quote, onClose }: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const money = (n: number) => `${n.toFixed(2)} ${quote.currency}`;
  const whatsappText = encodeURIComponent(
    quotationMessage(
      {
        quote_number: quote.quoteNumber,
        items: quote.items,
        total_amount: quote.total,
        currency: quote.currency,
        valid_until: quote.validUntil,
      },
      quote.customer.name,
      isAr,
    ),
  );
  const customerDigits = (quote.customer.phone ?? '').replace(/\D/g, '');

  /*
    Rendered into <body>, not into #root: the print rule below hides every
    child of body except this overlay, so an overlay nested inside #root would
    hide itself along with the app and print a blank page.
  */
  return createPortal(
    <>
      <style>{`
        @media print {
          #quotation-card {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            border-radius: 0 !important;
          }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      <div
        id="print-quotation-overlay"
        data-print-overlay
        className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        <div
          id="quotation-card"
          className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden my-4"
          onClick={e => e.stopPropagation()}
        >
          {/* Action bar — never printed */}
          <div className="no-print flex items-center justify-between bg-slate-800 px-5 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-white text-slate-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 transition"
              >
                <Printer className="w-4 h-4" />
                {isAr ? 'طباعة' : 'Print'}
              </button>
              {customerDigits && (
                <a
                  href={`https://wa.me/${customerDigits}?text=${whatsappText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  {isAr ? 'واتساب' : 'WhatsApp'}
                </a>
              )}
              {quote.customer.email && (
                <a
                  href={`mailto:${quote.customer.email}?subject=${encodeURIComponent(
                    isAr ? `عرض سعر ${quote.quoteNumber}` : `Price offer ${quote.quoteNumber}`,
                  )}&body=${whatsappText}`}
                  className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
                >
                  <Mail className="w-4 h-4" />
                  {isAr ? 'بريد' : 'Email'}
                </a>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* The document itself */}
          <div className="p-7 font-sans text-sm text-slate-800" dir="ltr">

            {/* Header */}
            <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-slate-800">
              <div className="flex items-center gap-3">
                <Logo compact />
                <div>
                  <p className="font-bold text-slate-900 text-base">مؤسسة الأفضل</p>
                  <p className="text-xs text-slate-500">BioFamily Jordan — تكنولوجيا المياه</p>
                  <p className="text-xs text-slate-400">الهاشمي الشمالي، شارع البطحاء، عمان</p>
                  <p className="text-xs text-slate-400" dir="ltr">+962 77 806 8705</p>
                </div>
              </div>
              <div className="text-end">
                <p className="text-[11px] tracking-wide text-slate-500 uppercase">Price Offer / عرض سعر</p>
                <p className="font-bold text-navy text-xl leading-tight">{quote.quoteNumber}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {isAr ? 'التاريخ' : 'Date'}: {fmtDate(quote.issuedAt)}
                </p>
                {quote.validUntil && (
                  <p className="text-xs text-slate-500">
                    {isAr ? 'صالح حتى' : 'Valid until'}: {fmtDate(quote.validUntil)}
                  </p>
                )}
              </div>
            </div>

            {/* Customer */}
            <div className="mb-6">
              <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">
                {isAr ? 'مقدم إلى' : 'Offer to'}
              </p>
              <p className="font-bold text-slate-900">{quote.customer.name}</p>
              {quote.customer.address && <p className="text-xs text-slate-600">{quote.customer.address}</p>}
              {quote.customer.phone && (
                <p className="text-xs text-slate-600" dir="ltr">{quote.customer.phone}</p>
              )}
              {quote.customer.email && (
                <p className="text-xs text-slate-600" dir="ltr">{quote.customer.email}</p>
              )}
            </div>

            {/* Lines */}
            <table className="w-full mb-5 border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="text-start px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 border border-slate-200">
                    {isAr ? 'الصنف' : 'Item'}
                  </th>
                  <th className="text-center px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 border border-slate-200 w-16">
                    {isAr ? 'الكمية' : 'Qty'}
                  </th>
                  <th className="text-end px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 border border-slate-200 w-28">
                    {isAr ? 'سعر الوحدة' : 'Unit price'}
                  </th>
                  <th className="text-end px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 border border-slate-200 w-28">
                    {isAr ? 'الإجمالي' : 'Total'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td className="px-3 py-2 border border-slate-200 text-slate-800">{item.name}</td>
                    <td className="px-3 py-2 border border-slate-200 text-center text-slate-700">{item.qty}</td>
                    <td className="px-3 py-2 border border-slate-200 text-end text-slate-700">{money(item.unit_price)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-end font-semibold text-slate-900">{money(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end mb-6">
              <div className="w-full sm:w-72 space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>{isAr ? 'المجموع الفرعي' : 'Subtotal'}</span>
                  <span>{money(quote.subtotal)}</span>
                </div>
                {quote.discount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>{isAr ? 'الخصم' : 'Discount'}</span>
                    <span>− {money(quote.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base text-slate-900 border-t-2 border-slate-800 pt-1.5">
                  <span>{isAr ? 'الإجمالي' : 'Total'}</span>
                  <span>{money(quote.total)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {quote.notes && (
              <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">
                  {isAr ? 'ملاحظات' : 'Notes'}
                </p>
                <p className="text-xs text-slate-700 whitespace-pre-wrap">{quote.notes}</p>
              </div>
            )}

            {/* Acceptance */}
            <div className="grid grid-cols-2 gap-8 mt-8 pt-4 border-t border-slate-200">
              <div>
                <p className="text-xs text-slate-500 mb-8">
                  {isAr ? 'موافقة العميل' : 'Customer approval'}
                </p>
                <div className="border-t border-slate-400 pt-1">
                  <p className="text-[11px] text-slate-400">
                    {isAr ? 'الاسم والتوقيع والتاريخ' : 'Name, signature & date'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-8">
                  {isAr ? 'عن الشركة' : 'For the company'}
                </p>
                <div className="border-t border-slate-400 pt-1">
                  <p className="text-[11px] text-slate-400">
                    {isAr ? 'الاسم والتوقيع' : 'Name & signature'}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-center text-[11px] text-slate-400 mt-6">
              {isAr
                ? 'شكراً لثقتكم — مؤسسة الأفضل / BioFamily Jordan'
                : 'Thank you for your business — BioFamily Jordan'}
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
