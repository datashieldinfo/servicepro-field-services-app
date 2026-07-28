import { useMemo } from 'react';
import {
  User, Phone, Mail, FileText, Building2, UserRound, Home, AlertTriangle,
  Hash, Briefcase, FileBadge, KeyRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LocationPicker from './LocationPicker';
import {
  COUNTRY_CODES,
  INDUSTRIES,
  JORDAN_GOVERNORATES,
  PAYMENT_TERMS,
  areasFor,
  citiesFor,
  type CustomerForm,
  type CustomerType,
} from '../lib/customerFields';
import type { GeoPlace } from '../lib/geocoding';

interface Props {
  form: CustomerForm;
  errors: Partial<Record<keyof CustomerForm, string>>;
  onChange: (patch: Partial<CustomerForm>) => void;
  /** Create flow explains that an email triggers a portal login; edit does not. */
  showEmailHint?: boolean;
}

/**
 * The customer record fieldset — record type, identity, contact, structured
 * address, map pin and notes.
 *
 * Rendered by both `AddCustomerModal` and `CustomerFullEditPage` so creating
 * and editing a customer are literally the same form, for every role.
 */
export default function CustomerFields({ form, errors, onChange, showEmailHint = false }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const corporate = form.customer_type === 'corporate';
  const cities = useMemo(() => citiesFor(form.state), [form.state]);
  const areas  = useMemo(() => areasFor(form.city), [form.city]);

  /** Fills only the address fields the operator left empty. */
  function fillFromPlace(place: GeoPlace) {
    onChange({
      state:  form.state  || place.state  || '',
      city:   form.city   || place.city   || '',
      area:   form.area   || place.area   || '',
      street: form.street || place.street || '',
    });
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
    <div className="space-y-5">

      {/* ── Record type ─────────────────────────────────────────────────── */}
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
              onClick={() => onChange({ customer_type: type as CustomerType })}
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

      {/* ── Identity ────────────────────────────────────────────────────── */}
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
                    onChange={e => onChange({ company_name: e.target.value })}
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
                  onChange={e => onChange({ trade_name: e.target.value })}
                  className={inputClass('trade_name')}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.industry')}</label>
                <select
                  value={form.industry}
                  onChange={e => onChange({ industry: e.target.value })}
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
                    onChange={e => onChange({ branch_count: e.target.value })}
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
                    onChange={e => onChange({ commercial_reg_no: e.target.value })}
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
                  onChange={e => onChange({ tax_number: e.target.value })}
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
                  onChange={e => onChange({ payment_terms: e.target.value })}
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
                  onChange={e => onChange({ billing_email: e.target.value })}
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
                      onChange={e => onChange({ contact_person_name: e.target.value })}
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
                      onChange={e => onChange({ contact_person_title: e.target.value })}
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
                    onChange={e => onChange({ contact_person_phone: e.target.value })}
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
                    onChange={e => onChange({ contact_person_email: e.target.value })}
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
                onChange={e => onChange({ full_name: e.target.value })}
                placeholder={t('customerForm.fullNamePlaceholder')}
                className={iconInputClass('full_name')}
              />
            </div>
            <FieldError field="full_name" />
          </div>
        )}
      </section>

      {/* ── Contact ─────────────────────────────────────────────────────── */}
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
              onChange={e => onChange({ country_code: e.target.value })}
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
                onChange={e => onChange({ phone: e.target.value })}
                placeholder="79 123 4567"
                className={iconInputClass('phone')}
                dir="ltr"
              />
            </div>
          </div>
          <FieldError field="phone" />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.email')}</label>
          <div className="relative">
            <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              value={form.email}
              onChange={e => onChange({ email: e.target.value })}
              placeholder="customer@example.com"
              className={iconInputClass('email')}
              dir="ltr"
            />
          </div>
          <FieldError field="email" />
          {showEmailHint && <p className="text-xs text-slate-400 mt-1">{t('customerForm.emailHint')}</p>}
        </div>

        {showEmailHint && (
          <label
            className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition sm:col-span-2 ${
              form.portal_access ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-slate-50/60'
            }`}
          >
            <input
              type="checkbox"
              checked={form.portal_access}
              onChange={e => onChange({ portal_access: e.target.checked })}
              className="w-4 h-4 mt-0.5 accent-blue-600"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                <KeyRound className={`w-4 h-4 ${form.portal_access ? 'text-blue-600' : 'text-slate-400'}`} />
                {t('customerForm.portalAccess')}
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">{t('customerForm.portalAccessHint')}</span>
            </span>
          </label>
        )}
      </section>

      {/* ── Address ─────────────────────────────────────────────────────── */}
      <section className="space-y-4 border-t border-slate-100 pt-5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('customerForm.address')}</h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.state')}</label>
            <input
              list="customer-states"
              value={form.state}
              onChange={e => onChange({ state: e.target.value })}
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
              onChange={e => onChange({ city: e.target.value })}
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
              onChange={e => onChange({ area: e.target.value })}
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
              onChange={e => onChange({ street: e.target.value })}
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
                onClick={() => onChange({ building_type: form.building_type === value ? '' : value })}
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
                onChange={e => onChange({ villa_name: e.target.value })}
                className={inputClass('villa_name')}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.villaNumber')}</label>
              <input
                type="text"
                value={form.villa_number}
                onChange={e => onChange({ villa_number: e.target.value })}
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
                onChange={e => onChange({ building_name: e.target.value })}
                className={inputClass('building_name')}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.buildingNumber')}</label>
              <input
                type="text"
                value={form.building_number}
                onChange={e => onChange({ building_number: e.target.value })}
                className={inputClass('building_number')}
                dir="ltr"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">{t('customerForm.flatNumber')}</label>
              <input
                type="text"
                value={form.flat_number}
                onChange={e => onChange({ flat_number: e.target.value })}
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
          onChange={pin => onChange({
            latitude: pin.latitude,
            longitude: pin.longitude,
            location_label: pin.label,
          })}
          onPlaceResolved={fillFromPlace}
        />
      </section>

      {/* ── Notes ───────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 pt-5">
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          <FileText className="inline w-3.5 h-3.5 me-1 text-slate-400" />
          {t('customerForm.notes')}
        </label>
        <textarea
          value={form.notes}
          onChange={e => onChange({ notes: e.target.value })}
          placeholder={t('customerForm.notesPlaceholder')}
          rows={2}
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
    </div>
  );
}
