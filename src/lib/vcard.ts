/**
 * Writing customers out as phone contacts.
 *
 * The import side of this app reads `.vcf` files; this is the mirror. Saving a
 * customer into the technician's own contact list is what makes their name show
 * on the phone when they ring — no native app, no permissions, nothing to
 * install. The card also carries a link back to the customer's 360 page, so the
 * record is one tap from the call.
 *
 * vCard 3.0 with CRLF line endings: the format both Android and iOS accept
 * without argument.
 */

export interface VCardCustomer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  customer_type?: string | null;
  company_name?: string | null;
  contact_person_name?: string | null;
  contact_person_phone?: string | null;
  /** Anything worth reading before answering — contract number, device model. */
  note?: string | null;
}

/** Prefixed so a work contact is obvious in a personal phone book. */
export const CONTACT_PREFIX = 'ServisGo';

const CRLF = '\r\n';

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 2426 folding: no line over 75 octets, continuations start with a space. */
function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join(CRLF);
}

/** The 360 link that ends up on the contact card. */
export function customerLink(customerId: string, origin?: string): string {
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return `${base}/lookup?c=${customerId}`;
}

/**
 * One contact card. The display name is prefixed so that when the phone rings,
 * it is obvious this is a ServisGo customer and not a personal contact.
 */
export function buildVCard(customer: VCardCustomer, origin?: string): string {
  const display = `${CONTACT_PREFIX} — ${customer.company_name || customer.name}`.trim();
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeValue(display)}`,
    /* N is family;given;middle;prefix;suffix — the whole name in the given slot
       keeps Arabic names intact rather than guessing where to split them. */
    `N:;${escapeValue(display)};;;`,
  ];

  if (customer.company_name) lines.push(`ORG:${escapeValue(customer.company_name)}`);
  if (customer.phone) lines.push(`TEL;TYPE=CELL,VOICE:${escapeValue(customer.phone)}`);
  if (customer.contact_person_phone) {
    lines.push(`TEL;TYPE=WORK,VOICE:${escapeValue(customer.contact_person_phone)}`);
  }
  if (customer.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeValue(customer.email)}`);
  if (customer.address) {
    /* ADR is post-office;extended;street;locality;region;code;country */
    lines.push(`ADR;TYPE=HOME:;;${escapeValue(customer.address)};;;;`);
  }

  lines.push(`URL:${escapeValue(customerLink(customer.id, origin))}`);

  const noteParts = [
    customer.contact_person_name ? `Contact: ${customer.contact_person_name}` : '',
    customer.note ?? '',
    `Open in ServisGo: ${customerLink(customer.id, origin)}`,
  ].filter(Boolean);
  lines.push(`NOTE:${escapeValue(noteParts.join('\n'))}`);

  lines.push(`CATEGORIES:${CONTACT_PREFIX}`);
  lines.push('END:VCARD');

  return lines.map(fold).join(CRLF) + CRLF;
}

/** Several customers in one file — what a new technician's phone imports once. */
export function buildVCardBook(customers: VCardCustomer[], origin?: string): string {
  return customers.map(c => buildVCard(c, origin)).join('');
}

/** Safe-ish file name from a customer name, without stripping Arabic. */
function fileNameFor(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '').trim();
  return `${cleaned || 'contact'}.vcf`;
}

/**
 * Hands the card to the phone. Android and iOS both react to a downloaded
 * `.vcf` by offering to add it to contacts; the Web Share API is tried first
 * where the browser supports sharing files, because that skips the downloads
 * folder entirely.
 */
export async function saveToPhoneContacts(
  customer: VCardCustomer,
  origin?: string
): Promise<'shared' | 'downloaded'> {
  const vcf = buildVCard(customer, origin);
  const fileName = fileNameFor(`${CONTACT_PREFIX} ${customer.company_name || customer.name}`);
  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });

  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  };

  if (typeof File !== 'undefined' && nav.share && nav.canShare) {
    const file = new File([blob], fileName, { type: 'text/vcard' });
    if (nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: customer.name });
        return 'shared';
      } catch {
        /* the user dismissed the sheet, or the platform refused — fall through */
      }
    }
  }

  downloadVCardFile(blob, fileName);
  return 'downloaded';
}

/** The whole book, always as a download — sharing 500 contacts is not a gesture. */
export function downloadVCardBook(customers: VCardCustomer[], origin?: string): void {
  const blob = new Blob([buildVCardBook(customers, origin)], { type: 'text/vcard;charset=utf-8' });
  downloadVCardFile(blob, `servisgo-customers-${new Date().toISOString().split('T')[0]}.vcf`);
}

function downloadVCardFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Give the browser a moment to start the download before revoking. */
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
