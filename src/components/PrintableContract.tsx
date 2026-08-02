import { createPortal } from 'react-dom';
import { X, Printer, MessageCircle, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Logo from './Logo';
import { fmtDate } from '../lib/format';
import { contractClauses, TERMS_VERSION } from '../lib/contractTerms';
import type { UsageType } from '../lib/deviceFields';

export interface ContractDeviceLine {
  device_brand: string;
  device_model: string | null;
  serial_number: string | null;
  location_in_premises: string | null;
  installation_date?: string | null;
  filter_category: UsageType;
}

export interface ContractDocument {
  contractNumber: string;
  planType: string;
  filterCategory: UsageType;
  visitsIncluded: number;
  priceJod: number;
  startDate: string;
  endDate: string;
  autoRenew: boolean;
  status: string;
  notes?: string | null;
  customer: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    customer_type?: string | null;
    company_name?: string | null;
    tax_number?: string | null;
  };
  devices: ContractDeviceLine[];
}

interface Props {
  contract: ContractDocument;
  onClose: () => void;
}

/**
 * The contract as it goes on paper: the two parties, what is covered, the
 * devices it covers, the terms it is signed under, and two signature blocks.
 *
 * Rendered into <body> like the invoice and the price offer, because the print
 * rule in index.css hides every sibling of the overlay being printed.
 */
export default function PrintableContract({ contract, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const clauses = contractClauses();

  const money = (n: number) => `${Number(n ?? 0).toFixed(2)} ${t('invoice.jod')}`;
  const shareText = encodeURIComponent(
    isAr
      ? `عقد الصيانة رقم ${contract.contractNumber}\nالخطة: ${t(`contract.plan_${contract.planType}`)}\nالمدة: ${fmtDate(contract.startDate)} — ${fmtDate(contract.endDate)}\nعدد الزيارات: ${contract.visitsIncluded}\nالقيمة: ${money(contract.priceJod)}\nمؤسسة الأفضل لتكنولوجيا المياه`
      : `Maintenance contract ${contract.contractNumber}\nPlan: ${t(`contract.plan_${contract.planType}`)}\nPeriod: ${fmtDate(contract.startDate)} — ${fmtDate(contract.endDate)}\nVisits: ${contract.visitsIncluded}\nValue: ${money(contract.priceJod)}\nBest Co. Water Technology`
  );
  const customerDigits = (contract.customer.phone ?? '').replace(/\D/g, '');

  const cell = 'px-3 py-2 border border-slate-200';
  const head = 'text-start px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 border border-slate-200';

  return createPortal(
    <>
      <style>{`
        @media print {
          #contract-card {
            box-shadow: none !important;
            border: none !important;
            max-width: 100% !important;
            border-radius: 0 !important;
          }
          #contract-terms { break-before: auto; }
          #contract-terms li { break-inside: avoid; }
          #contract-signatures { break-inside: avoid; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>

      <div
        id="print-contract-overlay"
        data-print-overlay
        className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center p-4 overflow-y-auto"
        onClick={onClose}
      >
        <div
          id="contract-card"
          className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden my-4"
          onClick={e => e.stopPropagation()}
        >
          {/* Action bar — never printed */}
          <div className="no-print flex items-center justify-between bg-slate-800 px-5 py-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-white text-slate-800 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-100 transition"
              >
                <Printer className="w-4 h-4" />
                {t('contract.print')}
              </button>
              {customerDigits && (
                <a
                  href={`https://wa.me/${customerDigits}?text=${shareText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t('getApp.share.whatsapp')}
                </a>
              )}
              {contract.customer.email && (
                <a
                  href={`mailto:${contract.customer.email}?subject=${encodeURIComponent(
                    isAr ? `عقد صيانة ${contract.contractNumber}` : `Maintenance contract ${contract.contractNumber}`
                  )}&body=${shareText}`}
                  className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition"
                >
                  <Mail className="w-4 h-4" />
                  {t('getApp.share.email')}
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
          <div className="p-7 font-sans text-sm text-slate-800" dir={isAr ? 'rtl' : 'ltr'}>

            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-6 pb-4 border-b-2 border-slate-800">
              <div className="flex items-center gap-3">
                <Logo compact />
                <div>
                  <p className="font-bold text-slate-900 text-base">مؤسسة الأفضل لتكنولوجيا المياه</p>
                  <p className="text-xs text-slate-500">Best Co. Water Technology — BioFamily &amp; Ruhens</p>
                  <p className="text-xs text-slate-400">الهاشمي الشمالي، شارع البطحاء، عمان</p>
                  <p className="text-xs text-slate-400" dir="ltr">+962 77 806 8705</p>
                </div>
              </div>
              <div className="text-end shrink-0">
                <p className="text-[11px] tracking-wide text-slate-500 uppercase">
                  {isAr ? 'عقد صيانة / Maintenance contract' : 'Maintenance contract / عقد صيانة'}
                </p>
                <p className="font-bold text-navy text-xl leading-tight">{contract.contractNumber}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {t('contract.printedOn')}: {fmtDate(new Date().toISOString())}
                </p>
              </div>
            </div>

            {/* The two parties */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{t('contract.firstParty')}</p>
                <p className="font-bold text-slate-900">مؤسسة الأفضل لتكنولوجيا المياه</p>
                <p className="text-xs text-slate-600">{t('contract.firstPartyRole')}</p>
                <p className="text-xs text-slate-500 mt-1">الهاشمي الشمالي، شارع البطحاء، عمان — الأردن</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{t('contract.secondParty')}</p>
                <p className="font-bold text-slate-900">
                  {contract.customer.company_name || contract.customer.name}
                </p>
                <p className="text-xs text-slate-600">{t('contract.secondPartyRole')}</p>
                {contract.customer.address && (
                  <p className="text-xs text-slate-500 mt-1">{contract.customer.address}</p>
                )}
                {contract.customer.phone && (
                  <p className="text-xs text-slate-500" dir="ltr">{contract.customer.phone}</p>
                )}
                {contract.customer.tax_number && (
                  <p className="text-xs text-slate-500">
                    {t('customerForm.taxNumber')}: {contract.customer.tax_number}
                  </p>
                )}
              </div>
            </div>

            {/* What was agreed */}
            <table className="w-full mb-6 border-collapse">
              <tbody>
                <tr>
                  <th className={`${head} w-40`}>{t('contract.plan')}</th>
                  <td className={cell}>{t(`contract.plan_${contract.planType}`)}</td>
                  <th className={`${head} w-40`}>{t('contract.filterCategory')}</th>
                  <td className={cell}>{t(`device.usage_${contract.filterCategory}`)}</td>
                </tr>
                <tr>
                  <th className={head}>{t('contract.startDate')}</th>
                  <td className={cell}>{fmtDate(contract.startDate)}</td>
                  <th className={head}>{t('contract.endDate')}</th>
                  <td className={cell}>{fmtDate(contract.endDate)}</td>
                </tr>
                <tr>
                  <th className={head}>{t('contract.visitsIncluded')}</th>
                  <td className={cell}>{contract.visitsIncluded}</td>
                  <th className={head}>{t('contract.price')}</th>
                  <td className={`${cell} font-bold`}>{money(contract.priceJod)}</td>
                </tr>
                <tr>
                  <th className={head}>{t('contract.autoRenew')}</th>
                  <td className={cell}>{contract.autoRenew ? t('common.yes') : t('common.no')}</td>
                  <th className={head}>{t('common.status')}</th>
                  <td className={cell}>{t(`contract.status_${contract.status}`)}</td>
                </tr>
              </tbody>
            </table>

            {/* Devices covered */}
            <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{t('contract.coveredDevices')}</p>
            {contract.devices.length === 0 ? (
              <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-3 mb-6">
                {t('contract.noDevicesOnContract')}
              </p>
            ) : (
              <table className="w-full mb-6 border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className={head}>{t('install.brand')}</th>
                    <th className={head}>{t('install.model')}</th>
                    <th className={head}>{t('install.serial')}</th>
                    <th className={head}>{t('install.location')}</th>
                    <th className={head}>{t('contract.filterCategory')}</th>
                  </tr>
                </thead>
                <tbody>
                  {contract.devices.map((d, index) => (
                    <tr key={`${d.serial_number ?? d.device_brand}-${index}`}>
                      <td className={cell}>{d.device_brand}</td>
                      <td className={cell}>{d.device_model || '—'}</td>
                      <td className={cell} dir="ltr">{d.serial_number || '—'}</td>
                      <td className={cell}>{d.location_in_premises || '—'}</td>
                      <td className={cell}>{t(`device.usage_${d.filter_category}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {contract.notes && (
              <div className="mb-6 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{t('common.notes')}</p>
                <p className="text-xs text-slate-700 whitespace-pre-wrap">{contract.notes}</p>
              </div>
            )}

            {/* Terms */}
            <div id="contract-terms" className="mb-6">
              <p className="font-bold text-slate-900 mb-2 pb-1 border-b border-slate-300">
                {t('contract.termsTitle')}
              </p>
              <ol className="list-decimal space-y-1.5 ps-5 text-[11.5px] leading-relaxed text-slate-700">
                {clauses.map((clause, index) => (
                  <li key={index}>{isAr ? clause.ar : clause.en}</li>
                ))}
              </ol>
            </div>

            {/* Signatures */}
            <div id="contract-signatures" className="grid grid-cols-2 gap-8 mt-8 pt-4 border-t border-slate-200">
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">{t('contract.firstParty')}</p>
                <p className="text-[11px] text-slate-500 mb-10">مؤسسة الأفضل لتكنولوجيا المياه</p>
                <div className="border-t border-slate-400 pt-1">
                  <p className="text-[11px] text-slate-400">{t('contract.signatureLine')}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">{t('contract.secondParty')}</p>
                <p className="text-[11px] text-slate-500 mb-10">
                  {contract.customer.company_name || contract.customer.name}
                </p>
                <div className="border-t border-slate-400 pt-1">
                  <p className="text-[11px] text-slate-400">{t('contract.signatureLine')}</p>
                </div>
              </div>
            </div>

            <p className="text-center text-[10px] text-slate-400 mt-6">
              {t('contract.termsVersion', { version: TERMS_VERSION })} · {contract.contractNumber}
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
