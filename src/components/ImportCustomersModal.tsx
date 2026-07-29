import { useMemo, useRef, useState } from 'react';
import {
  X, Upload, Download, FileSpreadsheet, Contact, Loader2, CheckCircle,
  AlertTriangle, Smartphone, Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from './Toast';
import {
  COUNTRY_CODES,
  validateCustomer,
  type CustomerForm,
  type CustomerSource,
  type CustomerType,
} from '../lib/customerFields';
import {
  contactPickerSupported,
  downloadTemplate,
  rowsFromCsv,
  rowsFromDeviceContacts,
  rowsFromVcf,
  type ParsedRow,
} from '../lib/customerImport';
import { createCustomersBulk, type BulkResult } from '../lib/customerService';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

type Tab = 'excel' | 'vcf' | 'contacts';

export default function ImportCustomersModal({ onClose, onImported }: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [tab, setTab]             = useState<Tab>('excel');
  const [rows, setRows]           = useState<ParsedRow[]>([]);
  const [skipped, setSkipped]     = useState<Set<number>>(new Set());
  const [unknownHeaders, setUnknownHeaders] = useState<string[]>([]);
  const [fileName, setFileName]   = useState('');
  const [parsing, setParsing]     = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult]       = useState<BulkResult | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const contactsAvailable = useMemo(contactPickerSupported, []);

  // Imported rows only need a name and a valid phone — city / contact person
  // can be completed later from the customer record.
  const rowErrors = useMemo(
    () => rows.map(r =>
      validateCustomer(r, { requireContactPerson: false, requireCity: false })
        .map(e => t(`customerForm.${e.key}`))
    ),
    [rows, t]
  );
  const selectedCount = rows.filter((_, i) => !skipped.has(i) && rowErrors[i].length === 0).length;

  function reset() {
    setRows([]);
    setSkipped(new Set());
    setUnknownHeaders([]);
    setFileName('');
    setResult(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (/\.xlsx?$/i.test(file.name)) {
      showToast(t('customerImport.xlsxNotSupported'), 'warning');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setParsing(true);
    reset();
    try {
      const text = await file.text();
      if (tab === 'vcf') {
        setRows(rowsFromVcf(text));
      } else {
        const parsed = rowsFromCsv(text);
        setRows(parsed.rows);
        setUnknownHeaders(parsed.unknownHeaders);
      }
      setFileName(file.name);
    } catch {
      showToast(t('customerImport.parseFailed'), 'error');
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDeviceContacts() {
    setParsing(true);
    reset();
    try {
      const picked = await rowsFromDeviceContacts();
      setRows(picked);
      setFileName(t('customerImport.deviceContacts'));
      if (!picked.length) showToast(t('customerImport.noRows'), 'warning');
    } catch (err) {
      showToast(
        (err as Error).message === 'contacts-unsupported'
          ? t('customerImport.contactsUnsupported')
          : t('customerImport.contactsFailed'),
        'warning'
      );
    } finally {
      setParsing(false);
    }
  }

  function updateRow(index: number, patch: Partial<CustomerForm>) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function applyTypeToAll(type: CustomerType) {
    setRows(prev => prev.map(r => ({
      ...r,
      customer_type: type,
      company_name: type === 'corporate' && !r.company_name ? r.full_name : r.company_name,
      contact_person_name: type === 'corporate' && !r.contact_person_name ? r.full_name : r.contact_person_name,
      full_name: type === 'individual' && !r.full_name ? r.company_name : r.full_name,
    })));
  }

  async function handleImport() {
    const payload = rows.filter((_, i) => !skipped.has(i) && rowErrors[i].length === 0);
    if (!payload.length) {
      showToast(t('customerImport.nothingToImport'), 'warning');
      return;
    }

    setImporting(true);
    const source: CustomerSource = tab === 'excel' ? 'excel' : tab === 'vcf' ? 'vcf' : 'contacts';
    const res = await createCustomersBulk(payload, source, isAr);
    setResult(res);
    setImporting(false);

    if (res.inserted) {
      showToast(t('customerImport.importedCount', { count: res.inserted }), 'success');
      onImported();
    }
    if (res.failed.length && !res.inserted) {
      showToast(t('customerImport.importFailed'), 'error');
    }
  }

  const tabs: { id: Tab; icon: typeof FileSpreadsheet; label: string }[] = [
    { id: 'excel',    icon: FileSpreadsheet, label: t('customerImport.tabExcel') },
    { id: 'vcf',      icon: Contact,         label: t('customerImport.tabVcf') },
    { id: 'contacts', icon: Smartphone,      label: t('customerImport.tabContacts') },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <Upload className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">{t('customerImport.title')}</h2>
              <p className="text-xs text-slate-500">{t('customerImport.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {result ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 gap-4 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="font-semibold text-slate-900 text-lg">
              {t('customerImport.importedCount', { count: result.inserted })}
            </p>

            {result.failed.length > 0 && (
              <div className="w-full max-w-md bg-red-50 border border-red-100 rounded-xl p-3 text-start space-y-1 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-red-800">
                  {t('customerImport.failedCount', { count: result.failed.length })}
                </p>
                {result.failed.map((f, i) => (
                  <p key={i} className="text-[11px] text-red-700">• {f.name}: {f.error}</p>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={reset}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                {t('customerImport.importMore')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">

            {/* Source tabs */}
            <div className="flex gap-2 flex-wrap">
              {tabs.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setTab(id); reset(); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition ${
                    tab === id ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Source panel */}
            {tab === 'contacts' ? (
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center space-y-3">
                <Smartphone className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm text-slate-600">{t('customerImport.contactsDesc')}</p>
                {contactsAvailable ? (
                  <button
                    type="button"
                    onClick={handleDeviceContacts}
                    disabled={parsing}
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition"
                  >
                    {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                    {t('customerImport.pickContacts')}
                  </button>
                ) : (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 inline-flex items-start gap-1.5 text-start">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {t('customerImport.contactsUnsupported')}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {tab === 'excel' && (
                  <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-wrap">
                    <p className="text-xs text-slate-600">{t('customerImport.templateHint')}</p>
                    <button
                      type="button"
                      onClick={() => downloadTemplate()}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t('customerImport.downloadTemplate')}
                    </button>
                  </div>
                )}

                <label className="block border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition">
                  <input
                    ref={fileRef}
                    type="file"
                    accept={tab === 'excel' ? '.csv,text/csv,.xlsx,.xls' : '.vcf,text/vcard,text/x-vcard'}
                    onChange={handleFile}
                    className="hidden"
                  />
                  {parsing ? (
                    <Loader2 className="w-8 h-8 text-blue-500 mx-auto animate-spin" />
                  ) : (
                    <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                  )}
                  <p className="text-sm font-semibold text-slate-700 mt-2">
                    {tab === 'excel' ? t('customerImport.chooseCsv') : t('customerImport.chooseVcf')}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {tab === 'excel' ? t('customerImport.csvHint') : t('customerImport.vcfHint')}
                  </p>
                </label>
              </div>
            )}

            {unknownHeaders.length > 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {t('customerImport.unknownHeaders', { headers: unknownHeaders.join(', ') })}
              </p>
            )}

            {/* Preview */}
            {rows.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm font-semibold text-slate-700">
                    {t('customerImport.previewTitle', { file: fileName, count: rows.length })}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{t('customerImport.setAllAs')}</span>
                    <select
                      onChange={e => e.target.value && applyTypeToAll(e.target.value as CustomerType)}
                      defaultValue=""
                      className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">{t('customerForm.select')}</option>
                      <option value="individual">{t('customerForm.individual')}</option>
                      <option value="corporate">{t('customerForm.corporate')}</option>
                    </select>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr className="text-slate-500">
                        <th className="p-2 w-8"></th>
                        <th className="p-2 text-start font-semibold">{t('customerImport.colName')}</th>
                        <th className="p-2 text-start font-semibold">{t('customerImport.colPhone')}</th>
                        <th className="p-2 text-start font-semibold">{t('customerImport.colCity')}</th>
                        <th className="p-2 text-start font-semibold">{t('customerImport.colType')}</th>
                        <th className="p-2 text-start font-semibold">{t('customerImport.colStatus')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row, i) => {
                        const errs = rowErrors[i];
                        const off = skipped.has(i);
                        return (
                          <tr key={i} className={off ? 'opacity-40' : errs.length ? 'bg-red-50/40' : ''}>
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={!off}
                                onChange={() => setSkipped(prev => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i); else next.add(i);
                                  return next;
                                })}
                                className="w-4 h-4 accent-blue-600"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                value={row.customer_type === 'corporate' ? row.company_name : row.full_name}
                                onChange={e => updateRow(i, row.customer_type === 'corporate'
                                  ? { company_name: e.target.value }
                                  : { full_name: e.target.value })}
                                className="w-40 border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                            </td>
                            <td className="p-2">
                              <div className="flex gap-1">
                                <select
                                  value={row.country_code}
                                  onChange={e => updateRow(i, { country_code: e.target.value })}
                                  className="border border-slate-200 rounded-lg px-1 py-1 w-16 focus:ring-2 focus:ring-blue-500 outline-none"
                                  dir="ltr"
                                >
                                  {COUNTRY_CODES.map(c => (
                                    <option key={c.iso} value={c.dial}>{c.dial}</option>
                                  ))}
                                </select>
                                <input
                                  value={row.phone}
                                  onChange={e => updateRow(i, { phone: e.target.value })}
                                  className="w-28 border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
                                  dir="ltr"
                                />
                              </div>
                            </td>
                            <td className="p-2">
                              <input
                                value={row.city}
                                onChange={e => updateRow(i, { city: e.target.value })}
                                className="w-28 border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
                              />
                            </td>
                            <td className="p-2">
                              <select
                                value={row.customer_type}
                                onChange={e => updateRow(i, { customer_type: e.target.value as CustomerType })}
                                className="border border-slate-200 rounded-lg px-1 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
                              >
                                <option value="individual">{t('customerForm.individual')}</option>
                                <option value="corporate">{t('customerForm.corporate')}</option>
                              </select>
                            </td>
                            <td className="p-2">
                              {errs.length ? (
                                <span className="text-red-600">{errs[0]}</span>
                              ) : (
                                <span className="text-green-600">{t('customerImport.ready')}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-slate-500">{t('customerImport.noLoginNote')}</p>

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
                    onClick={handleImport}
                    disabled={importing || selectedCount === 0}
                    className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
                  >
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {t('customerImport.importAction', { count: selectedCount })}
                  </button>
                </div>
              </div>
            )}

            {rows.length === 0 && fileName && !parsing && (
              <p className="text-xs text-slate-500 text-center">{t('customerImport.noRows')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
