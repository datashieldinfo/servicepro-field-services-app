/**
 * Formatting and browser helpers that every screen needs.
 *
 * Each of these existed three or four times over, copied between dashboards
 * and drifting apart as it went — one date formatter returned '—' for a bad
 * date, another returned the raw string; one CSV export quoted its cells,
 * another did not.
 */

/** A date as dd/mm/yyyy, or an em dash when there is nothing to show. */
export function fmtDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
}

/** Date and time together, for anything scheduled at an hour. */
export function fmtDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

/** The long, localised form used on the technician and customer screens. */
export function fmtLongDate(value: string | null | undefined, isAr: boolean): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

/** Just the time, for a day's schedule. */
export function fmtTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * How long ago something happened, as the i18n key and count to render it
 * with — the helper stays out of the translation layer so it can live in lib.
 */
export function timeAgo(value?: string | null): { key: string; count: number } | null {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return null;

  const diff = Date.now() - then;
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return { key: 'time.daysAgo', count: days };

  const hours = Math.floor(diff / 3_600_000);
  if (hours > 0) return { key: 'time.hoursAgo', count: hours };

  return { key: 'time.minutesAgo', count: Math.max(1, Math.floor(diff / 60_000)) };
}

/** Digits only — what `wa.me` and `tel:` want. */
export function phoneDigits(phone?: string | null): string {
  return (phone ?? '').replace(/\D/g, '');
}

/** A WhatsApp deep link with the message already typed out. */
export function whatsAppLink(phone: string | null | undefined, text = ''): string {
  const base = `https://wa.me/${phoneDigits(phone)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Opens WhatsApp in a new tab. */
export function shareOnWhatsApp(phone: string | null | undefined, text = ''): void {
  window.open(whatsAppLink(phone, text), '_blank', 'noopener');
}

/** A `mailto:` link with subject and body escaped. */
export function mailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${email.trim()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Downloads a table as CSV. Cells are quoted and inner quotes doubled, and the
 * file carries a BOM so Excel opens Arabic correctly.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
): void {
  const escape = (v: string | number | null | undefined) =>
    `"${String(v ?? '').replace(/"/g, '""')}"`;

  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
