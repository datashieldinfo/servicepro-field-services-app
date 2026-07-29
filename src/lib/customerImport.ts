/**
 * Bulk-import helpers for customers: Excel/CSV template + parser, vCard (.vcf)
 * parser, and the (progressively-enhanced) mobile Contact Picker.
 *
 * All parsing is done in the browser with zero dependencies.
 */

import {
  DEFAULT_COUNTRY_CODE,
  emptyCustomerForm,
  normalizeDial,
  normalizePhone,
  splitPhone,
  type BuildingType,
  type CustomerForm,
  type CustomerType,
} from './customerFields';

export { splitPhone } from './customerFields';

/* ── Template ────────────────────────────────────────────────────────────── */

/** Column order of the downloadable template — also the accepted CSV headers. */
export const TEMPLATE_COLUMNS: (keyof CustomerForm)[] = [
  'customer_type',
  'full_name',
  'company_name',
  'trade_name',
  'industry',
  'commercial_reg_no',
  'tax_number',
  'branch_count',
  'payment_terms',
  'contact_person_name',
  'contact_person_title',
  'contact_person_phone',
  'contact_person_email',
  'billing_email',
  'email',
  'country_code',
  'phone',
  'state',
  'city',
  'area',
  'street',
  'building_type',
  'villa_name',
  'villa_number',
  'building_name',
  'building_number',
  'flat_number',
  'latitude',
  'longitude',
  'notes',
];

const TEMPLATE_SAMPLE_ROWS: string[][] = [
  [
    'individual', 'Mohammad Ahmad', '', '', '', '', '', '', '', '', '', '', '', '',
    'mohammad@example.com', '+962', '791234567',
    'Amman', 'Amman', 'Abdoun', 'Zahran', 'villa', 'Al Ahmad', '12', '', '', '',
    '31.9539', '35.9106', 'Gate on the north side',
  ],
  [
    'corporate', '', 'Blue Water Restaurants', 'Blue Water', 'restaurant', 'CR-123456', 'TX-99887', '3', 'net30',
    'Lina Nabulsi', 'Procurement Manager', '+962795550001', 'lina@bluewater.jo', 'billing@bluewater.jo',
    'info@bluewater.jo', '+962', '65550001',
    'Amman', 'Amman', 'Sweifieh', 'Wakalat', 'building', '', '', 'Blue Tower', '45', '3',
    '', '', 'Invoice monthly',
  ],
];

/** UTF-8 byte-order mark (escaped so linters stay happy). */
const BOM = '\uFEFF';

function csvEscape(value: string): string {
  const v = value ?? '';
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** UTF-8 BOM so Excel opens Arabic correctly on double-click. */
export function buildTemplateCsv(): string {
  const rows = [TEMPLATE_COLUMNS as string[], ...TEMPLATE_SAMPLE_ROWS];
  return BOM + rows.map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

export function downloadTemplate(filename = 'customers-import-template.csv') {
  const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── CSV parsing ─────────────────────────────────────────────────────────── */

/** RFC4180-ish parser: quoted fields, escaped quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(new RegExp(`^${BOM}`), '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }

  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

function headerKey(header: string): keyof CustomerForm | null {
  const norm = header.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const direct = TEMPLATE_COLUMNS.find(c => c === norm);
  if (direct) return direct;

  const aliases: Record<string, keyof CustomerForm> = {
    name: 'full_name',
    customer_name: 'full_name',
    type: 'customer_type',
    record_type: 'customer_type',
    mobile: 'phone',
    phone_number: 'phone',
    telephone: 'phone',
    dial_code: 'country_code',
    country: 'country_code',
    governorate: 'state',
    province: 'state',
    neighbourhood: 'area',
    neighborhood: 'area',
    district: 'area',
    company: 'company_name',
    organization: 'company_name',
    lat: 'latitude',
    lng: 'longitude',
    long: 'longitude',
    apartment: 'flat_number',
    flat: 'flat_number',
    remarks: 'notes',
  };
  return aliases[norm] ?? null;
}

export interface ParsedRow extends CustomerForm {
  _row: number;
}

export function rowsFromCsv(text: string): { rows: ParsedRow[]; unknownHeaders: string[] } {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], unknownHeaders: [] };

  const headers = table[0];
  const mapped = headers.map(headerKey);
  const unknownHeaders = headers.filter((h, i) => h.trim() !== '' && mapped[i] === null);

  const rows: ParsedRow[] = table.slice(1).map((cells, idx) => {
    const form = emptyCustomerForm();
    const provided = new Set<keyof CustomerForm>();

    mapped.forEach((key, i) => {
      if (!key) return;
      const value = (cells[i] ?? '').trim();
      if (!value) return;
      provided.add(key);

      if (key === 'customer_type') {
        const t = value.toLowerCase();
        form.customer_type = (t.startsWith('corp') || t.includes('شرك') ? 'corporate' : 'individual') as CustomerType;
      } else if (key === 'building_type') {
        const t = value.toLowerCase();
        form.building_type = (t.startsWith('vil') || t.includes('فيلا') ? 'villa' : 'building') as BuildingType;
      } else {
        (form as unknown as Record<string, string>)[key] = value;
      }
    });

    if (form.phone) {
      const raw = form.phone.trim();
      if (raw.startsWith('+') || raw.startsWith('00')) {
        // Already international — the number itself decides the dial code.
        const split = splitPhone(raw);
        form.country_code = split.country_code;
        form.phone = split.phone;
      } else {
        form.country_code = provided.has('country_code') ? normalizeDial(form.country_code) : DEFAULT_COUNTRY_CODE;
        form.phone = normalizePhone(raw);
      }
    }
    if (!form.full_name && form.customer_type === 'individual' && form.company_name) {
      form.full_name = form.company_name;
    }

    return { ...form, _row: idx + 2 };
  });

  return { rows, unknownHeaders };
}

/* ── vCard (.vcf) parsing ────────────────────────────────────────────────── */

function decodeQuotedPrintable(input: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '=' && /[0-9A-Fa-f]{2}/.test(input.substr(i + 1, 2))) {
      bytes.push(parseInt(input.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(input.charCodeAt(i));
    }
  }
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return input;
  }
}

interface VCardLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseVCardLines(card: string): VCardLine[] {
  // 1) join quoted-printable soft breaks, 2) unfold RFC-2425 continuations
  const joined = card.replace(/=\r?\n/g, '').replace(/\r?\n[ \t]/g, '');

  return joined.split(/\r?\n/).flatMap(raw => {
    const line = raw.trim();
    const colon = line.indexOf(':');
    if (colon < 0) return [];

    const head = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const [nameWithGroup, ...paramParts] = head.split(';');
    const name = nameWithGroup.includes('.')
      ? nameWithGroup.split('.').slice(1).join('.').toUpperCase()
      : nameWithGroup.toUpperCase();

    const params: Record<string, string> = {};
    for (const part of paramParts) {
      const [k, v] = part.includes('=') ? part.split('=') : ['TYPE', part];
      params[k.toUpperCase()] = (v ?? '').toUpperCase();
    }

    if ((params.ENCODING ?? '').includes('QUOTED-PRINTABLE')) value = decodeQuotedPrintable(value);
    return [{ name, params, value }];
  });
}

function unescapeVCard(v: string): string {
  return v.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

export function rowsFromVcf(text: string): ParsedRow[] {
  const cards = text.split(/BEGIN:VCARD/i).slice(1);

  return cards.map((raw, idx) => {
    const lines = parseVCardLines(raw);
    const form = emptyCustomerForm();
    const extraPhones: string[] = [];

    for (const { name, params, value } of lines) {
      const v = unescapeVCard(value);
      if (!v) continue;

      switch (name) {
        case 'FN':
          form.full_name = form.full_name || v;
          break;
        case 'N': {
          if (form.full_name) break;
          const [family = '', given = '', middle = ''] = v.split(';');
          form.full_name = [given, middle, family].filter(Boolean).join(' ').trim();
          break;
        }
        case 'TEL': {
          const split = splitPhone(v);
          if (!form.phone) {
            form.country_code = split.country_code;
            form.phone = split.phone;
          } else if (split.phone !== form.phone) {
            extraPhones.push(`${split.country_code}${split.phone}`);
          }
          break;
        }
        case 'EMAIL':
          if (!form.email) form.email = v;
          break;
        case 'ORG':
          form.company_name = v.split(';').filter(Boolean).join(' — ');
          break;
        case 'TITLE':
          form.contact_person_title = v;
          break;
        case 'ADR': {
          // pobox;ext;street;locality;region;postalcode;country
          const [, ext = '', street = '', locality = '', region = ''] = v.split(';');
          form.street = form.street || unescapeVCard(street);
          form.city = form.city || unescapeVCard(locality);
          form.state = form.state || unescapeVCard(region);
          form.area = form.area || unescapeVCard(ext);
          break;
        }
        case 'NOTE':
          form.notes = form.notes ? `${form.notes} — ${v}` : v;
          break;
        case 'GEO': {
          const coords = v.replace(/^geo:/i, '').split(/[;,]/);
          if (coords.length === 2) {
            form.latitude = coords[0].trim();
            form.longitude = coords[1].trim();
          }
          break;
        }
        default:
          break;
      }
      void params;
    }

    if (!form.full_name && form.company_name) {
      form.customer_type = 'corporate';
      form.contact_person_name = '';
    }
    if (extraPhones.length) {
      const label = `Other phones: ${extraPhones.join(', ')}`;
      form.notes = form.notes ? `${form.notes} — ${label}` : label;
    }

    return { ...form, _row: idx + 1 };
  }).filter(r => r.full_name || r.company_name || r.phone);
}

/* ── Mobile contact picker (Android Chrome / supported browsers) ─────────── */

interface ContactsManagerLike {
  select: (props: string[], options?: { multiple?: boolean }) => Promise<Array<{
    name?: string[];
    email?: string[];
    tel?: string[];
    address?: Array<{ region?: string; city?: string; addressLine?: string[] }>;
  }>>;
  getProperties?: () => Promise<string[]>;
}

function contactsManager(): ContactsManagerLike | null {
  const nav = navigator as Navigator & { contacts?: ContactsManagerLike };
  return typeof window !== 'undefined' && nav.contacts && 'ContactsManager' in window ? nav.contacts : null;
}

export function contactPickerSupported(): boolean {
  return contactsManager() !== null;
}

/** Opens the OS contact sheet; returns rows in the same shape as the parsers. */
export async function rowsFromDeviceContacts(): Promise<ParsedRow[]> {
  const manager = contactsManager();
  if (!manager) throw new Error('contacts-unsupported');

  const available = manager.getProperties ? await manager.getProperties() : ['name', 'tel', 'email', 'address'];
  const props = ['name', 'tel', 'email', 'address'].filter(p => available.includes(p));

  const picked = await manager.select(props, { multiple: true });

  return picked.map((c, idx) => {
    const form = emptyCustomerForm();
    form.full_name = c.name?.[0]?.trim() ?? '';
    form.email = c.email?.[0]?.trim() ?? '';

    if (c.tel?.length) {
      const split = splitPhone(c.tel[0]);
      form.country_code = split.country_code;
      form.phone = split.phone;
    }
    const addr = c.address?.[0];
    if (addr) {
      form.state = addr.region ?? '';
      form.city = addr.city ?? '';
      form.street = addr.addressLine?.join(' ') ?? '';
    }
    return { ...form, _row: idx + 1 };
  }).filter(r => r.full_name || r.phone);
}
