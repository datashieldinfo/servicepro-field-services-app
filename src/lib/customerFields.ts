/**
 * Shared definitions for the customer record (individual + corporate).
 *
 * Everything that describes "what a customer is" lives here so the create
 * modal, the import modal and any future edit screen stay in sync — one table
 * (`customers`), one shape, whatever role is using the UI.
 */

export type CustomerType = 'individual' | 'corporate';
export type BuildingType = 'villa' | 'building';
export type CustomerSource = 'manual' | 'excel' | 'vcf' | 'contacts';

export interface CustomerForm {
  customer_type: CustomerType;

  /* individual */
  full_name: string;

  /* corporate */
  company_name: string;
  trade_name: string;
  industry: string;
  commercial_reg_no: string;
  tax_number: string;
  branch_count: string;
  payment_terms: string;
  billing_email: string;
  contact_person_name: string;
  contact_person_title: string;
  contact_person_phone: string;
  contact_person_email: string;

  /* contact */
  email: string;
  country_code: string;
  phone: string;

  /** Gives the customer a login to the 360 portal (needs an email). */
  portal_access: boolean;

  /* address */
  state: string;
  city: string;
  area: string;
  street: string;
  building_type: BuildingType | '';
  villa_name: string;
  villa_number: string;
  building_name: string;
  building_number: string;
  flat_number: string;

  /* map pin */
  latitude: string;
  longitude: string;
  location_label: string;

  notes: string;
}

export function emptyCustomerForm(): CustomerForm {
  return {
    customer_type: 'individual',
    full_name: '',
    company_name: '',
    trade_name: '',
    industry: '',
    commercial_reg_no: '',
    tax_number: '',
    branch_count: '',
    payment_terms: '',
    billing_email: '',
    contact_person_name: '',
    contact_person_title: '',
    contact_person_phone: '',
    contact_person_email: '',
    email: '',
    country_code: DEFAULT_COUNTRY_CODE,
    phone: '',
    portal_access: false,
    state: '',
    city: '',
    area: '',
    street: '',
    building_type: '',
    villa_name: '',
    villa_number: '',
    building_name: '',
    building_number: '',
    flat_number: '',
    latitude: '',
    longitude: '',
    location_label: '',
    notes: '',
  };
}

/* ── Country dial codes ──────────────────────────────────────────────────── */

export interface CountryCode {
  iso: string;
  dial: string;
  flag: string;
  en: string;
  ar: string;
}

export const DEFAULT_COUNTRY_CODE = '+962';

export const COUNTRY_CODES: CountryCode[] = [
  { iso: 'JO', dial: '+962', flag: '🇯🇴', en: 'Jordan',               ar: 'الأردن' },
  { iso: 'SA', dial: '+966', flag: '🇸🇦', en: 'Saudi Arabia',         ar: 'السعودية' },
  { iso: 'AE', dial: '+971', flag: '🇦🇪', en: 'United Arab Emirates', ar: 'الإمارات' },
  { iso: 'QA', dial: '+974', flag: '🇶🇦', en: 'Qatar',                ar: 'قطر' },
  { iso: 'KW', dial: '+965', flag: '🇰🇼', en: 'Kuwait',               ar: 'الكويت' },
  { iso: 'BH', dial: '+973', flag: '🇧🇭', en: 'Bahrain',              ar: 'البحرين' },
  { iso: 'OM', dial: '+968', flag: '🇴🇲', en: 'Oman',                 ar: 'عُمان' },
  { iso: 'PS', dial: '+970', flag: '🇵🇸', en: 'Palestine',            ar: 'فلسطين' },
  { iso: 'LB', dial: '+961', flag: '🇱🇧', en: 'Lebanon',              ar: 'لبنان' },
  { iso: 'SY', dial: '+963', flag: '🇸🇾', en: 'Syria',                ar: 'سوريا' },
  { iso: 'IQ', dial: '+964', flag: '🇮🇶', en: 'Iraq',                 ar: 'العراق' },
  { iso: 'EG', dial: '+20',  flag: '🇪🇬', en: 'Egypt',                ar: 'مصر' },
  { iso: 'LY', dial: '+218', flag: '🇱🇾', en: 'Libya',                ar: 'ليبيا' },
  { iso: 'SD', dial: '+249', flag: '🇸🇩', en: 'Sudan',                ar: 'السودان' },
  { iso: 'YE', dial: '+967', flag: '🇾🇪', en: 'Yemen',                ar: 'اليمن' },
  { iso: 'TN', dial: '+216', flag: '🇹🇳', en: 'Tunisia',              ar: 'تونس' },
  { iso: 'DZ', dial: '+213', flag: '🇩🇿', en: 'Algeria',              ar: 'الجزائر' },
  { iso: 'MA', dial: '+212', flag: '🇲🇦', en: 'Morocco',              ar: 'المغرب' },
  { iso: 'TR', dial: '+90',  flag: '🇹🇷', en: 'Türkiye',              ar: 'تركيا' },
  { iso: 'GB', dial: '+44',  flag: '🇬🇧', en: 'United Kingdom',       ar: 'المملكة المتحدة' },
  { iso: 'US', dial: '+1',   flag: '🇺🇸', en: 'United States',        ar: 'الولايات المتحدة' },
  { iso: 'CA', dial: '+1',   flag: '🇨🇦', en: 'Canada',               ar: 'كندا' },
  { iso: 'DE', dial: '+49',  flag: '🇩🇪', en: 'Germany',              ar: 'ألمانيا' },
  { iso: 'FR', dial: '+33',  flag: '🇫🇷', en: 'France',               ar: 'فرنسا' },
  { iso: 'IT', dial: '+39',  flag: '🇮🇹', en: 'Italy',                ar: 'إيطاليا' },
  { iso: 'ES', dial: '+34',  flag: '🇪🇸', en: 'Spain',                ar: 'إسبانيا' },
  { iso: 'NL', dial: '+31',  flag: '🇳🇱', en: 'Netherlands',          ar: 'هولندا' },
  { iso: 'SE', dial: '+46',  flag: '🇸🇪', en: 'Sweden',               ar: 'السويد' },
  { iso: 'IN', dial: '+91',  flag: '🇮🇳', en: 'India',                ar: 'الهند' },
  { iso: 'PK', dial: '+92',  flag: '🇵🇰', en: 'Pakistan',             ar: 'باكستان' },
  { iso: 'PH', dial: '+63',  flag: '🇵🇭', en: 'Philippines',          ar: 'الفلبين' },
  { iso: 'ID', dial: '+62',  flag: '🇮🇩', en: 'Indonesia',            ar: 'إندونيسيا' },
  { iso: 'MY', dial: '+60',  flag: '🇲🇾', en: 'Malaysia',             ar: 'ماليزيا' },
  { iso: 'CN', dial: '+86',  flag: '🇨🇳', en: 'China',                ar: 'الصين' },
  { iso: 'KR', dial: '+82',  flag: '🇰🇷', en: 'South Korea',          ar: 'كوريا الجنوبية' },
  { iso: 'JP', dial: '+81',  flag: '🇯🇵', en: 'Japan',                ar: 'اليابان' },
  { iso: 'AU', dial: '+61',  flag: '🇦🇺', en: 'Australia',            ar: 'أستراليا' },
];

/* ── Jordan governorates / cities / Amman areas ──────────────────────────── */

export interface Governorate {
  en: string;
  ar: string;
  cities: { en: string; ar: string }[];
}

export const JORDAN_GOVERNORATES: Governorate[] = [
  {
    en: 'Amman', ar: 'العاصمة',
    cities: [
      { en: 'Amman', ar: 'عمّان' },
      { en: 'Wadi As-Seer', ar: 'وادي السير' },
      { en: 'Sahab', ar: 'سحاب' },
      { en: 'Naour', ar: 'ناعور' },
      { en: 'Al-Jizah', ar: 'الجيزة' },
      { en: 'Al-Muwaqqar', ar: 'الموقر' },
      { en: 'Marka', ar: 'ماركا' },
      { en: 'Al-Quwaysimah', ar: 'القويسمة' },
    ],
  },
  {
    en: 'Irbid', ar: 'إربد',
    cities: [
      { en: 'Irbid', ar: 'إربد' },
      { en: 'Ar-Ramtha', ar: 'الرمثا' },
      { en: 'Al-Husn', ar: 'الحصن' },
      { en: 'Bani Kinanah', ar: 'بني كنانة' },
      { en: 'At-Taybeh', ar: 'الطيبة' },
      { en: 'Al-Mazar Ash-Shamali', ar: 'المزار الشمالي' },
    ],
  },
  {
    en: 'Zarqa', ar: 'الزرقاء',
    cities: [
      { en: 'Zarqa', ar: 'الزرقاء' },
      { en: 'Russeifa', ar: 'الرصيفة' },
      { en: 'Al-Hashimiyah', ar: 'الهاشمية' },
      { en: 'Azraq', ar: 'الأزرق' },
      { en: 'Dhulail', ar: 'الضليل' },
    ],
  },
  {
    en: 'Balqa', ar: 'البلقاء',
    cities: [
      { en: 'As-Salt', ar: 'السلط' },
      { en: 'Al-Fuheis', ar: 'الفحيص' },
      { en: 'Mahis', ar: 'ماحص' },
      { en: 'Deir Alla', ar: 'دير علا' },
      { en: 'Ain Al-Basha', ar: 'عين الباشا' },
      { en: 'South Shuna', ar: 'الشونة الجنوبية' },
    ],
  },
  {
    en: 'Mafraq', ar: 'المفرق',
    cities: [
      { en: 'Mafraq', ar: 'المفرق' },
      { en: 'Rehab', ar: 'رحاب' },
      { en: 'Sabha', ar: 'صبحا' },
      { en: 'Umm Al-Jimal', ar: 'أم الجمال' },
    ],
  },
  {
    en: 'Jerash', ar: 'جرش',
    cities: [
      { en: 'Jerash', ar: 'جرش' },
      { en: 'Souf', ar: 'سوف' },
      { en: 'Burma', ar: 'برما' },
    ],
  },
  {
    en: 'Ajloun', ar: 'عجلون',
    cities: [
      { en: 'Ajloun', ar: 'عجلون' },
      { en: 'Kufranjah', ar: 'كفرنجة' },
      { en: 'Anjara', ar: 'عنجرة' },
      { en: 'Sakhra', ar: 'صخرة' },
    ],
  },
  {
    en: 'Madaba', ar: 'مادبا',
    cities: [
      { en: 'Madaba', ar: 'مادبا' },
      { en: 'Dhiban', ar: 'ذيبان' },
      { en: "Ma'in", ar: 'ماعين' },
      { en: 'Mulaih', ar: 'مليح' },
    ],
  },
  {
    en: 'Karak', ar: 'الكرك',
    cities: [
      { en: 'Karak', ar: 'الكرك' },
      { en: 'Al-Qasr', ar: 'القصر' },
      { en: 'Al-Mazar Al-Janubi', ar: 'المزار الجنوبي' },
      { en: 'Ghor As-Safi', ar: 'غور الصافي' },
    ],
  },
  {
    en: 'Tafilah', ar: 'الطفيلة',
    cities: [
      { en: 'Tafilah', ar: 'الطفيلة' },
      { en: 'Busaira', ar: 'بصيرا' },
      { en: 'Al-Hasa', ar: 'الحسا' },
    ],
  },
  {
    en: "Ma'an", ar: 'معان',
    cities: [
      { en: "Ma'an", ar: 'معان' },
      { en: 'Wadi Musa (Petra)', ar: 'وادي موسى (البتراء)' },
      { en: 'Shobak', ar: 'الشوبك' },
      { en: 'Al-Husseiniyah', ar: 'الحسينية' },
      { en: 'Al-Jafr', ar: 'الجفر' },
    ],
  },
  {
    en: 'Aqaba', ar: 'العقبة',
    cities: [
      { en: 'Aqaba', ar: 'العقبة' },
      { en: 'Al-Quwayrah', ar: 'القويرة' },
      { en: 'Wadi Rum', ar: 'وادي رم' },
      { en: 'Ad-Disah', ar: 'الديسة' },
    ],
  },
];

/** Neighbourhoods suggested when the city is Amman. */
export const AMMAN_AREAS: { en: string; ar: string }[] = [
  { en: 'Abdoun', ar: 'عبدون' },
  { en: 'Sweifieh', ar: 'الصويفية' },
  { en: 'Khalda', ar: 'خلدا' },
  { en: "Tla' Al-Ali", ar: 'تلاع العلي' },
  { en: 'Al-Jubeiha', ar: 'الجبيهة' },
  { en: 'Shmeisani', ar: 'الشميساني' },
  { en: 'Al-Abdali', ar: 'العبدلي' },
  { en: 'Jabal Amman', ar: 'جبل عمّان' },
  { en: 'Jabal Al-Hussein', ar: 'جبل الحسين' },
  { en: 'Ar-Rabieh', ar: 'الرابية' },
  { en: 'Deir Ghbar', ar: 'دير غبار' },
  { en: 'Um Uthaina', ar: 'أم أذينة' },
  { en: 'Um As-Summaq', ar: 'أم السماق' },
  { en: 'Dabouq', ar: 'دابوق' },
  { en: 'Marj Al-Hamam', ar: 'مرج الحمام' },
  { en: 'Al-Hashmi Ash-Shamali', ar: 'الهاشمي الشمالي' },
  { en: 'Tabarbour', ar: 'طبربور' },
  { en: 'Shafa Badran', ar: 'شفا بدران' },
  { en: 'Abu Nsair', ar: 'أبو نصير' },
  { en: 'Sweileh', ar: 'صويلح' },
  { en: 'Al-Bayader', ar: 'البيادر' },
  { en: 'Al-Muqabalain', ar: 'المقابلين' },
  { en: 'An-Nuzha', ar: 'النزهة' },
  { en: 'Wadi Saqra', ar: 'وادي صقرة' },
  { en: 'Airport Road', ar: 'طريق المطار' },
];

export function citiesFor(state: string): { en: string; ar: string }[] {
  const gov = JORDAN_GOVERNORATES.find(g => g.en === state || g.ar === state);
  return gov ? gov.cities : JORDAN_GOVERNORATES.flatMap(g => g.cities);
}

export function areasFor(city: string): { en: string; ar: string }[] {
  return city === 'Amman' || city === 'عمّان' || city === 'عمان' ? AMMAN_AREAS : [];
}

/* ── Corporate picklists ─────────────────────────────────────────────────── */

export const INDUSTRIES = [
  { value: 'restaurant',   en: 'Restaurant / Café',        ar: 'مطعم / مقهى' },
  { value: 'hotel',        en: 'Hotel / Hospitality',      ar: 'فندق / ضيافة' },
  { value: 'hospital',     en: 'Hospital / Clinic',        ar: 'مستشفى / عيادة' },
  { value: 'school',       en: 'School / University',      ar: 'مدرسة / جامعة' },
  { value: 'office',       en: 'Office / Corporate',       ar: 'مكتب / شركة' },
  { value: 'factory',      en: 'Factory / Industrial',     ar: 'مصنع / صناعي' },
  { value: 'retail',       en: 'Retail / Supermarket',     ar: 'تجزئة / سوبرماركت' },
  { value: 'gym',          en: 'Gym / Sports Club',        ar: 'نادي رياضي' },
  { value: 'government',   en: 'Government / Public',      ar: 'حكومي / قطاع عام' },
  { value: 'ngo',          en: 'NGO / Non-profit',         ar: 'منظمة غير ربحية' },
  { value: 'other',        en: 'Other',                    ar: 'أخرى' },
];

export const PAYMENT_TERMS = [
  { value: 'prepaid',  en: 'Prepaid',           ar: 'دفع مسبق' },
  { value: 'on_visit', en: 'Cash on visit',     ar: 'نقداً عند الزيارة' },
  { value: 'net15',    en: 'Net 15 days',       ar: 'خلال 15 يوم' },
  { value: 'net30',    en: 'Net 30 days',       ar: 'خلال 30 يوم' },
  { value: 'net60',    en: 'Net 60 days',       ar: 'خلال 60 يوم' },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Digits only, leading zeros of the local trunk prefix removed. */
export function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/[^\d]/g, '');
  return digits.replace(/^0+/, '');
}

/** "962" / "00962" / "+962 " → "+962" */
export function normalizeDial(value: string): string {
  const digits = (value || '').replace(/[^\d]/g, '').replace(/^00/, '');
  return digits ? `+${digits}` : DEFAULT_COUNTRY_CODE;
}

/** Splits an international number into a known dial code + local part. */
export function splitPhone(raw: string): { country_code: string; phone: string } {
  const trimmed = (raw || '').trim().replace(/[\s()-]/g, '');
  if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
    const intl = trimmed.startsWith('00') ? `+${trimmed.slice(2)}` : trimmed;
    const match = [...COUNTRY_CODES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find(c => intl.startsWith(c.dial));
    if (match) return { country_code: match.dial, phone: normalizePhone(intl.slice(match.dial.length)) };
  }
  return { country_code: DEFAULT_COUNTRY_CODE, phone: normalizePhone(trimmed) };
}

export function fullPhone(countryCode: string, phone: string): string {
  const local = normalizePhone(phone);
  return local ? `${countryCode}${local}` : '';
}

/** Minimal sanity check — 6..15 digits after normalisation (ITU E.164 range). */
export function isValidPhone(phone: string): boolean {
  const local = normalizePhone(phone);
  return local.length >= 6 && local.length <= 15;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** The name that goes into `customers.name` regardless of record type. */
export function customerDisplayName(f: Pick<CustomerForm, 'customer_type' | 'full_name' | 'company_name'>): string {
  return (f.customer_type === 'corporate' ? f.company_name : f.full_name).trim();
}

/**
 * Builds the one-line address kept in `customers.address` so existing lists,
 * job cards and printed reports keep rendering something readable.
 */
export function composeAddress(f: Partial<CustomerForm>, isAr = false): string {
  const parts: string[] = [];

  if (f.building_type === 'villa') {
    const villa = [f.villa_name, f.villa_number && `${isAr ? 'رقم' : 'No.'} ${f.villa_number}`]
      .filter(Boolean).join(' ');
    if (villa) parts.push(`${isAr ? 'فيلا' : 'Villa'} ${villa}`.trim());
  } else if (f.building_type === 'building') {
    const bldg = [f.building_name, f.building_number && `${isAr ? 'رقم' : 'No.'} ${f.building_number}`]
      .filter(Boolean).join(' ');
    if (bldg) parts.push(`${isAr ? 'بناية' : 'Building'} ${bldg}`.trim());
    if (f.flat_number) parts.push(`${isAr ? 'شقة' : 'Flat'} ${f.flat_number}`);
  }

  // Only add the "St." suffix when the value doesn't already carry one.
  if (f.street) {
    const hasSuffix = /(street|st\.?|road|rd\.?|ave\.?|avenue|شارع|طريق)\s*$|^\s*(شارع|طريق)/i.test(f.street);
    parts.push(hasSuffix ? f.street : `${f.street}${isAr ? ' ش' : ' St.'}`);
  }
  if (f.area)   parts.push(f.area);
  if (f.city)   parts.push(f.city);
  if (f.state && f.state !== f.city) parts.push(f.state);

  return parts.filter(Boolean).join(isAr ? '، ' : ', ');
}

export function mapsUrl(lat: string | number, lng: string | number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Form → `customers` row. Blank strings are kept so the row is fully defined. */
export function toCustomerRow(f: CustomerForm, source: CustomerSource, isAr = false) {
  const corporate = f.customer_type === 'corporate';
  const lat = parseFloat(f.latitude);
  const lng = parseFloat(f.longitude);

  return {
    customer_type: f.customer_type,
    name: customerDisplayName(f),
    email: f.email.trim(),
    portal_access: f.portal_access,
    country_code: f.country_code,
    phone: fullPhone(f.country_code, f.phone),
    address: composeAddress(f, isAr),
    state: f.state.trim(),
    city: f.city.trim(),
    area: f.area.trim(),
    street: f.street.trim(),
    building_type: f.building_type || null,
    villa_name: f.building_type === 'villa' ? f.villa_name.trim() : '',
    villa_number: f.building_type === 'villa' ? f.villa_number.trim() : '',
    building_name: f.building_type === 'building' ? f.building_name.trim() : '',
    building_number: f.building_type === 'building' ? f.building_number.trim() : '',
    flat_number: f.building_type === 'building' ? f.flat_number.trim() : '',
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    location_label: f.location_label.trim(),
    notes: f.notes.trim(),
    company_name: corporate ? f.company_name.trim() : '',
    trade_name: corporate ? f.trade_name.trim() : '',
    industry: corporate ? f.industry : '',
    commercial_reg_no: corporate ? f.commercial_reg_no.trim() : '',
    tax_number: corporate ? f.tax_number.trim() : '',
    branch_count: corporate && f.branch_count ? parseInt(f.branch_count, 10) || null : null,
    payment_terms: corporate ? f.payment_terms : '',
    billing_email: corporate ? f.billing_email.trim() : '',
    contact_person_name: corporate ? f.contact_person_name.trim() : '',
    contact_person_title: corporate ? f.contact_person_title.trim() : '',
    contact_person_phone: corporate ? f.contact_person_phone.trim() : '',
    contact_person_email: corporate ? f.contact_person_email.trim() : '',
    source,
  };
}

export interface ValidateOptions {
  /** Bulk imports rarely carry a contact person — only the form demands one. */
  requireContactPerson?: boolean;
  requireCity?: boolean;
}

/**
 * Form → `customers` row for an UPDATE. `source` is left out on purpose:
 * it records how the record was first captured and must survive edits.
 */
export function toCustomerUpdate(f: CustomerForm, isAr = false) {
  const { source, ...row } = toCustomerRow(f, 'manual', isAr);
  void source;
  return row;
}

/** `customers` row → form state, for the edit screens. */
export function fromCustomerRow(row: Record<string, unknown>): CustomerForm {
  const form = emptyCustomerForm();
  const str = (key: string) => (row[key] == null ? '' : String(row[key]));

  form.customer_type = str('customer_type') === 'corporate' ? 'corporate' : 'individual';
  form.company_name  = str('company_name');
  form.full_name     = str('full_name') || (form.customer_type === 'individual' ? str('name') : '');
  if (form.customer_type === 'corporate' && !form.company_name) form.company_name = str('name');

  const stored = str('phone');
  const split = splitPhone(stored);
  form.country_code = str('country_code') ? normalizeDial(str('country_code')) : split.country_code;
  form.phone = stored.startsWith('+') || stored.startsWith('00')
    ? split.phone
    : normalizePhone(stored);

  const copy: (keyof CustomerForm)[] = [
    'email', 'state', 'city', 'area', 'street', 'villa_name', 'villa_number',
    'building_name', 'building_number', 'flat_number', 'location_label', 'notes',
    'trade_name', 'industry', 'commercial_reg_no', 'tax_number', 'payment_terms',
    'billing_email', 'contact_person_name', 'contact_person_title',
    'contact_person_phone', 'contact_person_email',
  ];
  copy.forEach(key => { (form as unknown as Record<string, string>)[key] = str(key); });

  form.portal_access = row.portal_access === true || row.user_id != null;

  const buildingType = str('building_type');
  form.building_type = buildingType === 'villa' || buildingType === 'building' ? buildingType : '';
  form.branch_count = row.branch_count == null ? '' : String(row.branch_count);
  form.latitude  = row.latitude  == null ? '' : String(row.latitude);
  form.longitude = row.longitude == null ? '' : String(row.longitude);

  return form;
}

/** Field-level validation shared by the create form and the importer. */
export function validateCustomer(
  f: CustomerForm,
  { requireContactPerson = true, requireCity = true }: ValidateOptions = {}
): { field: keyof CustomerForm; key: string }[] {
  const errors: { field: keyof CustomerForm; key: string }[] = [];

  if (f.customer_type === 'corporate') {
    if (!f.company_name.trim()) errors.push({ field: 'company_name', key: 'errCompanyName' });
    if (requireContactPerson && !f.contact_person_name.trim()) {
      errors.push({ field: 'contact_person_name', key: 'errContactName' });
    }
  } else if (!f.full_name.trim()) {
    errors.push({ field: 'full_name', key: 'errFullName' });
  }

  if (!f.phone.trim()) errors.push({ field: 'phone', key: 'errPhoneRequired' });
  else if (!isValidPhone(f.phone)) errors.push({ field: 'phone', key: 'errPhoneInvalid' });

  if (f.email.trim() && !isValidEmail(f.email)) errors.push({ field: 'email', key: 'errEmailInvalid' });
  // Portal access is an account, and an account needs an email to sign in with.
  if (f.portal_access && !f.email.trim()) errors.push({ field: 'email', key: 'errEmailForPortal' });
  if (f.billing_email.trim() && !isValidEmail(f.billing_email)) errors.push({ field: 'billing_email', key: 'errEmailInvalid' });

  if (requireCity && !f.city.trim()) errors.push({ field: 'city', key: 'errCity' });

  return errors;
}
