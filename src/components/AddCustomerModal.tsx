import { useMemo, useState } from 'react';
import {
  X, Loader2, User, Phone, Mail, FileText, CheckCircle, Building2, UserRound,
  Home, Upload, Copy, Check, AlertTriangle, Hash, Briefcase, FileBadge,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from './Toast';
import LocationPicker from './LocationPicker';
import {
  COUNTRY_CODES,
  INDUSTRIES,
  JORDAN_GOVERNORATES,
  PAYMENT_TERMS,
  areasFor,
  citiesFor,
  emptyCustomerForm,
  validateCustomer,
  type CustomerForm,
  type CustomerType,
} from '../lib/customerFields';
import { createCustomer } from '../lib/customerService';
import type { GeoPlace } from '../lib/geocoding';

interface Props {
  onClose: () => void;
  onCreated: () => void;
  /** Optional — renders the "import instead" shortcut in the header. */
  onOpenImport?: () => void;
}

export default function AddCustomerModal({ onClose, onCreated, onOpenImport }: Props) {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const isAr = i18n.language === 'ar';

  const [form, setForm]     = useState<CustomerForm>(emptyCustomerForm());
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState<{ tempPassword?: string; hasLogin: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const corporate = form.customer_type === 'corporate';
  const cities = useMemo(() => citiesFor(form.state), [form.state]);
  const areas  = useMemo(() => areasFor(form.city), [form.city]);

  function set<K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  function switchType(type: CustomerType) {
    setForm(prev => ({ ...prev, customer_type: type }));
    setErrors({});
  }

  /** Fills only the address fields the operator left empty. */
  function fillFromPlace(place: GeoPlace) {
    setForm(prev => ({
      ...prev,
      state:  prev.state  || place.state  || '',
      city:   prev.city   || place.city   || '',
      area:   prev.area   || place.area   || '',
      street: prev.street || place.street || '',
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const found = validateCustomer(form);
    if (found.length) {
      const map: Partial<Record<keyof CustomerForm, string>> = {};
      found.forEach(({ field, key }) => { map[field] = t(`customerForm.${key}`); });
      setErrors(map);
      showToast(t('customerForm.fixErrors'), 'warning');
      return;
    }

    setSaving(true);
    const result = await createCustomer(form, 'manual', isAr);

    if (!result.ok) {
      showToast(result.error ?? t('toast.error'), 'error');
      setSaving(false);
      return;
    }

    setDone({ tempPassword: result.tempPassword, hasLogin: result.hasLogin });
    showToast(t('customerForm.created'), 'success');
    onCreated();
  }

  async function copyPassword() {
    if (!done?.tempPassword) return;
    try {
      await navigator.clipboard.writeText(done.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(t('toast.error'), 'error');
    }
  }

  const inputClass = (field: keyof CustomerForm) =>
    `w-full border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${
      errors[field] ? 'border-red-300 bg-red-50/40' : 'border-slate-200'
    }`;

  const iconInputClass = (field: keyof CustomerForm) =>
    `w-full border rounded-xl ps-10 pe-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${
      errors[field] ? 'border-red-300 bg-red-50/40' : 'border-slate-200'
    }`;

  const FieldError = ({ field }: { field: keyof CustomerForm }) =>
    errors[field] ? (
      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> {errors[field]}
      </p>
    ) : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              {corporate ? <Building2 className="w-5 h-5 text-blue-600" /> : <User className="w-5 h-5 text-blue-600" />}
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">{t('customerForm.title')}</h2>
              <p className="text-xs text-slate-500">{t('customerForm.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenImport && !done && (
              <button
                type="button"
                onClick={onOpenImport}
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition"
              >
                <Upload className="w-3.5 h-3.5" />
                {t('customerForm.importInstead')}
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition">
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 gap-4 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <p className="font-semibold text-slate-900 text-lg">{t('customerForm.createdTitle')}</p>

            {done.hasLogin && done.tempPassword ? (
              <div className="w-full max-w-sm bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-start">
                <p className="text-xs font-semibold text-amber-900">{t('customerForm.tempPasswordTitle')}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800" dir="ltr">
                    {done.tempPassword}
                  </code>
                  <button
                    type="button"
                    onClick={copyPassword}
                    className="p-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition"
                    title={t('customerForm.copy')}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-amber-800">{t('customerForm.tempPasswordHint')}</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500 max-w-sm">{t('customerForm.noLoginCreated')}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setForm(emptyCustomerForm()); setDone(null); setSaving(false); }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                {t('customerForm.addAnother')}
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
          <form onSubmit={handleSubmit} className="p-5 space-y-5">

            {/* ── Record type ─────────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                {t('customerForm.recordType')} <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { type: 'individual' as const, icon: UserRound, label: t('customerForm.individual'), desc: t('customerForm.individualDesc') },
                  { type: 'corporate'  as const, icon: Building2, label: t('customerForm.corporate'),  desc: t('customerForm.corporateDesc') },
                ]).map(({ type, icon: Icon, label, desc }) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => switchType(type)}
                    className={`flex items-start gap-3 p-3 rounded-xl border-2 text-start transition ${
                      form.customer_type === type
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${form.customer_type === type ? 'text-blue-600' : 'text-slate-400'}`} />
                    <span>
                      <span className={`block text-sm font-semibold ${form.customer_type === type ? 'text-blue-900' : 'text-slate-700'}`}>{label}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Identity ────────────────────────────────────────────── */}
            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {corporate ? t('customerForm.companyDetails') : t('customerForm.personalDetails')}
              </h3>

              {corporate ? (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        {t('customerForm.companyName')} <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Building2 className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={form.company_name}
                          onChange={e => set('company_name', e.target.value)}
                          placeholder={t('customerForm.companyNamePlaceholder')}
                          className={iconInputClass('company_name')}
                        />
                      </div>
                      <FieldError field="company_name" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.tradeName')}</label>
                      <input
                        type="text"
                        value={form.trade_name}
                        onChange={e => set('trade_name', e.target.value)}
                        className={inputClass('trade_name')}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.industry')}</label>
                      <select
                        value={form.industry}
                        onChange={e => set('industry', e.target.value)}
                        className={inputClass('industry')}
                      >
                        <option value="">{t('customerForm.select')}</option>
                        {INDUSTRIES.map(o => (
                          <option key={o.value} value={o.value}>{isAr ? o.ar : o.en}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.branchCount')}</label>
                      <div className="relative">
                        <Hash className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="number"
                          min={1}
                          value={form.branch_count}
                          onChange={e => set('branch_count', e.target.value)}
                          placeholder="1"
                          className={iconInputClass('branch_count')}
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.commercialRegNo')}</label>
                      <div className="relative">
                        <FileBadge className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={form.commercial_reg_no}
                          onChange={e => set('commercial_reg_no', e.target.value)}
                          className={iconInputClass('commercial_reg_no')}
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.taxNumber')}</label>
                      <input
                        type="text"
                        value={form.tax_number}
                        onChange={e => set('tax_number', e.target.value)}
                        className={inputClass('tax_number')}
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.paymentTerms')}</label>
                      <select
                        value={form.payment_terms}
                        onChange={e => set('payment_terms', e.target.value)}
                        className={inputClass('payment_terms')}
                      >
                        <option value="">{t('customerForm.select')}</option>
                        {PAYMENT_TERMS.map(o => (
                          <option key={o.value} value={o.value}>{isAr ? o.ar : o.en}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.billingEmail')}</label>
                      <input
                        type="email"
                        value={form.billing_email}
                        onChange={e => set('billing_email', e.target.value)}
                        placeholder="billing@company.com"
                        className={inputClass('billing_email')}
                        dir="ltr"
                      />
                      <FieldError field="billing_email" />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4 space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('customerForm.contactPerson')}</h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                          {t('customerForm.contactPersonName')} <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <UserRound className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={form.contact_person_name}
                            onChange={e => set('contact_person_name', e.target.value)}
                            className={iconInputClass('contact_person_name')}
                          />
                        </div>
                        <FieldError field="contact_person_name" />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.contactPersonTitle')}</label>
                        <div className="relative">
                          <Briefcase className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            value={form.contact_person_title}
                            onChange={e => set('contact_person_title', e.target.value)}
                            className={iconInputClass('contact_person_title')}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.contactPersonPhone')}</label>
                        <input
                          type="tel"
                          value={form.contact_person_phone}
                          onChange={e => set('contact_person_phone', e.target.value)}
                          placeholder="+962 79 000 0000"
                          className={inputClass('contact_person_phone')}
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.contactPersonEmail')}</label>
                        <input
                          type="email"
                          value={form.contact_person_email}
                          onChange={e => set('contact_person_email', e.target.value)}
                          className={inputClass('contact_person_email')}
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    {t('customerForm.fullName')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={form.full_name}
                      onChange={e => set('full_name', e.target.value)}
                      placeholder={t('customerForm.fullNamePlaceholder')}
                      className={iconInputClass('full_name')}
                    />
                  </div>
                  <FieldError field="full_name" />
                </div>
              )}
            </section>

            {/* ── Contact ─────────────────────────────────────────────── */}
            <section className="space-y-4 border-t border-slate-100 pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('customerForm.contactDetails')}</h3>

              {/* Phone — mandatory, with dial-code picklist */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {t('customerForm.phone')} <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={form.country_code}
                    onChange={e => set('country_code', e.target.value)}
                    className="border border-slate-200 rounded-xl px-2 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none w-32 shrink-0"
                    dir="ltr"
                    aria-label={t('customerForm.countryCode')}
                  >
                    {COUNTRY_CODES.map(c => (
                      <option key={c.iso} value={c.dial}>{c.flag} {c.dial} {isAr ? c.ar : c.en}</option>
                    ))}
                  </select>
                  <div className="relative flex-1">
                    <Phone className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => set('phone', e.target.value)}
                      placeholder="79 123 4567"
                      className={iconInputClass('phone')}
                      dir="ltr"
                    />
                  </div>
                </div>
                <FieldError field="phone" />
              </div>

              {/* Email — optional; drives portal-account creation */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.email')}</label>
                <div className="relative">
                  <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="customer@example.com"
                    className={iconInputClass('email')}
                    dir="ltr"
                  />
                </div>
                <FieldError field="email" />
                <p className="text-xs text-slate-400 mt-1">{t('customerForm.emailHint')}</p>
              </div>
            </section>

            {/* ── Address ─────────────────────────────────────────────── */}
            <section className="space-y-4 border-t border-slate-100 pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('customerForm.address')}</h3>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.state')}</label>
                  <input
                    list="customer-states"
                    value={form.state}
                    onChange={e => set('state', e.target.value)}
                    placeholder={t('customerForm.statePlaceholder')}
                    className={inputClass('state')}
                  />
                  <datalist id="customer-states">
                    {JORDAN_GOVERNORATES.map(g => <option key={g.en} value={isAr ? g.ar : g.en} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    {t('customerForm.city')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    list="customer-cities"
                    value={form.city}
                    onChange={e => set('city', e.target.value)}
                    placeholder={t('customerForm.cityPlaceholder')}
                    className={inputClass('city')}
                  />
                  <datalist id="customer-cities">
                    {cities.map(c => <option key={c.en} value={isAr ? c.ar : c.en} />)}
                  </datalist>
                  <FieldError field="city" />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.area')}</label>
                  <input
                    list="customer-areas"
                    value={form.area}
                    onChange={e => set('area', e.target.value)}
                    placeholder={t('customerForm.areaPlaceholder')}
                    className={inputClass('area')}
                  />
                  <datalist id="customer-areas">
                    {areas.map(a => <option key={a.en} value={isAr ? a.ar : a.en} />)}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.street')}</label>
                  <input
                    type="text"
                    value={form.street}
                    onChange={e => set('street', e.target.value)}
                    placeholder={t('customerForm.streetPlaceholder')}
                    className={inputClass('street')}
                  />
                </div>
              </div>

              {/* Building type */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">{t('customerForm.buildingType')}</label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: 'villa'    as const, icon: Home,      label: t('customerForm.villa') },
                    { value: 'building' as const, icon: Building2, label: t('customerForm.building') },
                  ]).map(({ value, icon: Icon, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => set('building_type', form.building_type === value ? '' : value)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition ${
                        form.building_type === value
                          ? 'border-blue-600 bg-blue-50 text-blue-900'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {form.building_type === 'villa' && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.villaName')}</label>
                    <input
                      type="text"
                      value={form.villa_name}
                      onChange={e => set('villa_name', e.target.value)}
                      className={inputClass('villa_name')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.villaNumber')}</label>
                    <input
                      type="text"
                      value={form.villa_number}
                      onChange={e => set('villa_number', e.target.value)}
                      className={inputClass('villa_number')}
                      dir="ltr"
                    />
                  </div>
                </div>
              )}

              {form.building_type === 'building' && (
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.buildingName')}</label>
                    <input
                      type="text"
                      value={form.building_name}
                      onChange={e => set('building_name', e.target.value)}
                      className={inputClass('building_name')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.buildingNumber')}</label>
                    <input
                      type="text"
                      value={form.building_number}
                      onChange={e => set('building_number', e.target.value)}
                      className={inputClass('building_number')}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.flatNumber')}</label>
                    <input
                      type="text"
                      value={form.flat_number}
                      onChange={e => set('flat_number', e.target.value)}
                      className={inputClass('flat_number')}
                      dir="ltr"
                    />
                  </div>
                </div>
              )}

              <LocationPicker
                latitude={form.latitude}
                longitude={form.longitude}
                label={form.location_label}
                onChange={pin => setForm(prev => ({
                  ...prev,
                  latitude: pin.latitude,
                  longitude: pin.longitude,
                  location_label: pin.label,
                }))}
                onPlaceResolved={fillFromPlace}
              />
            </section>

            {/* ── Notes ───────────────────────────────────────────────── */}
            <div className="border-t border-slate-100 pt-5">
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                <FileText className="inline w-3.5 h-3.5 me-1 text-slate-400" />
                {t('customerForm.notes')}
              </label>
              <textarea
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder={t('customerForm.notesPlaceholder')}
                rows={2}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
              <p className="font-semibold">{t('customerForm.whatHappens')}</p>
              <p>✓ {t('customerForm.whatHappensRecord')}</p>
              {form.email.trim() ? (
                <>
                  <p>✓ {t('customerForm.whatHappensLogin')}</p>
                  <p>✓ {t('customerForm.whatHappensPassword')}</p>
                </>
              ) : (
                <p>✓ {t('customerForm.whatHappensNoLogin')}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold transition flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <User className="w-4 h-4" />}
                {t('customerForm.create')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
