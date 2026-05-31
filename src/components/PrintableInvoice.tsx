import { X, Printer, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';

export interface InvoiceData {
  invoiceNumber: string;
  issuedAt: string;
  customer: { name: string; address: string; phone: string };
  technicianName: string;
  serviceType: string;
  serviceDate: string;
  parts: { name: string; quantity: number; unitPrice: number }[];
  laborCost: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
}

interface Props {
  invoice: InvoiceData;
  onClose: () => void;
}

const METHOD_LABEL: Record<string, { en: string; ar: string }> = {
  cash:          { en: 'Cash',           ar: 'نقداً' },
  bank_transfer: { en: 'Bank Transfer',  ar: 'تحويل بنكي' },
  cliq:          { en: 'Cliq',           ar: 'كليك' },
  other:         { en: 'Other',          ar: 'أخرى' },
};

export default function PrintableInvoice({ invoice, onClose }: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const method = METHOD_LABEL[invoice.paymentMethod] ?? { en: invoice.paymentMethod, ar: invoice.paymentMethod };
  const isPaid = invoice.paymentStatus === 'paid';

  const dateStr = new Date(invoice.serviceDate).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
  const issuedStr = new Date(invoice.issuedAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  function handlePrint() {
    window.print();
  }

  const whatsappText = encodeURIComponent(
    `فاتورة رقم ${invoice.invoiceNumber}\nالعميل: ${invoice.customer.name}\nالإجمالي: ${invoice.totalAmount.toFixed(2)} JOD\nالحالة: ${isPaid ? 'مدفوعة ✓' : 'معلقة'}`
  );

  return (
    <>
      {/* Print-only styles injected via a style tag */}
      <style>{`
        @media print {
          body > *:not(#print-invoice-overlay) { display: none !important; }
          #print-invoice-overlay { position: static !important; background: white !important; padding: 0 !important; }
          .no-print { display: none !important; }
          #invoice-card { box-shadow: none !important; border: none !important; max-width: 100% !important; }
        }
      `}</style>

      <div
        id="print-invoice-overlay"
        className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        <div
          id="invoice-card"
          className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Action bar */}
          <div className="no-print flex items-center justify-between bg-slate-800 px-5 py-3">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-white text-slate-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 transition"
              >
                <Printer className="w-4 h-4" />
                {isAr ? 'طباعة' : 'Print'}
              </button>
              <a
                href={`https://wa.me/962778068705?text=${whatsappText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
              >
                <MessageCircle className="w-4 h-4" />
                {isAr ? 'واتساب' : 'WhatsApp'}
              </a>
            </div>
            <button onClick={onClose} className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition">
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Invoice content */}
          <div className="p-6 font-sans text-sm" dir="ltr">
            {/* Header */}
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <Logo compact />
                <div>
                  <p className="font-bold text-slate-900 text-base">مؤسسة الأفضل</p>
                  <p className="text-xs text-slate-500">BioFamily Jordan — تكنولوجيا المياه</p>
                  <p className="text-xs text-slate-400">الهاشمي الشمالي، شارع البطحاء، عمان</p>
                </div>
              </div>
              <div className="text-end">
                <p className="text-xs text-slate-500">INVOICE / فاتورة</p>
                <p className="font-bold text-navy text-lg">{invoice.invoiceNumber}</p>
                <p className="text-xs text-slate-400">{issuedStr}</p>
              </div>
            </div>

            {/* Customer info */}
            <div className="grid grid-cols-2 gap-4 mb-5 pb-4 border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">Bill To / إلى</p>
                <p className="font-semibold text-slate-900">{invoice.customer.name}</p>
                <p className="text-xs text-slate-600 mt-0.5">{invoice.customer.address}</p>
                <p className="text-xs text-slate-600 font-mono" dir="ltr">{invoice.customer.phone}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-1 uppercase tracking-wide">Service Info</p>
                <p className="text-xs text-slate-600"><span className="font-medium">Tech:</span> {invoice.technicianName}</p>
                <p className="text-xs text-slate-600 mt-0.5"><span className="font-medium">Service:</span> {invoice.serviceType}</p>
                <p className="text-xs text-slate-600 mt-0.5"><span className="font-medium">Date:</span> {dateStr}</p>
              </div>
            </div>

            {/* Items table */}
            <div className="mb-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Items / البنود</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 rounded-lg">
                    <th className="text-start px-3 py-2 font-semibold text-slate-600 rounded-s-lg">Description</th>
                    <th className="text-center px-2 py-2 font-semibold text-slate-600">Qty</th>
                    <th className="text-end px-3 py-2 font-semibold text-slate-600">Price</th>
                    <th className="text-end px-3 py-2 font-semibold text-slate-600 rounded-e-lg">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {invoice.parts.map((part, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-slate-700">{part.name}</td>
                      <td className="px-2 py-2 text-center text-slate-600">{part.quantity}</td>
                      <td className="px-3 py-2 text-end text-slate-600">{part.unitPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-end font-medium text-slate-800">{(part.quantity * part.unitPrice).toFixed(2)}</td>
                    </tr>
                  ))}
                  {invoice.laborCost > 0 && (
                    <tr>
                      <td className="px-3 py-2 text-slate-700">Labor / عمالة</td>
                      <td className="px-2 py-2 text-center text-slate-600">1</td>
                      <td className="px-3 py-2 text-end text-slate-600">{invoice.laborCost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-end font-medium text-slate-800">{invoice.laborCost.toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Total */}
            <div className="bg-navy rounded-xl px-4 py-3 mb-4">
              <div className="flex items-center justify-between text-white">
                <span className="font-bold">TOTAL / الإجمالي</span>
                <span className="text-2xl font-bold">{invoice.totalAmount.toFixed(2)} JOD</span>
              </div>
            </div>

            {/* Payment info */}
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-slate-100">
              <div>
                <p className="text-xs text-slate-500">Payment / الدفع</p>
                <p className="font-semibold text-slate-900">{method.en} / {method.ar}</p>
              </div>
              <div className="text-end">
                <p className="text-xs text-slate-500">Status / الحالة</p>
                <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-bold ${isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {isPaid ? 'PAID ✓' : 'PENDING'}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="text-center space-y-1">
              <p className="font-medium text-slate-700">Thank you for your business!</p>
              <p className="text-slate-500">شكراً لثقتكم بنا</p>
              <p className="text-xs text-slate-400 mt-2">مؤسسة الأفضل لتكنولوجيا المياه — 0778068705</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
