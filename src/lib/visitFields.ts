/**
 * Shared definitions for a visit (an `appointments` row).
 *
 * A visit now has a *type*, may point at a specific device, and carries an
 * explicit customer confirmation. Everything that schedules a visit — the
 * office, the manager, the post-creation chooser — goes through this module so
 * the same rules apply everywhere.
 */

export type VisitType =
  | 'installation'
  | 'preventive_maintenance'
  | 'scheduled_visit'
  | 'repair'
  | 'emergency'
  | 'survey';

export type ConfirmationChannel = 'phone' | 'whatsapp' | 'portal' | 'email' | 'in_person';

export interface VisitTypeDef {
  value: VisitType;
  /** Fallback text written to the legacy `service_type` column. */
  serviceLabel: string;
  /** Tailwind classes for the badge. */
  badge: string;
  dot: string;
  /** A device must already exist to book this type. */
  needsDevice: boolean;
  /** The technician registers a new device during this visit. */
  registersDevice: boolean;
}

export const VISIT_TYPES: VisitTypeDef[] = [
  {
    value: 'installation',
    serviceLabel: 'Installation',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
    needsDevice: false,
    registersDevice: true,
  },
  {
    value: 'preventive_maintenance',
    serviceLabel: 'Preventive Maintenance',
    badge: 'bg-green-50 text-green-700 border-green-200',
    dot: 'bg-green-500',
    needsDevice: true,
    registersDevice: false,
  },
  {
    value: 'scheduled_visit',
    serviceLabel: 'Scheduled Visit',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
    needsDevice: false,
    registersDevice: false,
  },
  {
    value: 'repair',
    serviceLabel: 'Repair',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    needsDevice: true,
    registersDevice: false,
  },
  {
    value: 'emergency',
    serviceLabel: 'Emergency',
    badge: 'bg-red-50 text-red-700 border-red-200',
    dot: 'bg-red-500',
    needsDevice: false,
    registersDevice: false,
  },
  {
    value: 'survey',
    serviceLabel: 'Site Survey',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-500',
    needsDevice: false,
    registersDevice: false,
  },
];

export const CONFIRMATION_CHANNELS: ConfirmationChannel[] = [
  'phone', 'whatsapp', 'portal', 'email', 'in_person',
];

export function visitTypeDef(value: string): VisitTypeDef {
  return VISIT_TYPES.find(v => v.value === value) ?? VISIT_TYPES[2];
}

/** Maps the legacy service-request trigger types onto a visit type. */
export const TRIGGER_TO_VISIT_TYPE: Record<string, VisitType> = {
  schedule: 'scheduled_visit',
  part_due: 'preventive_maintenance',
  complaint: 'repair',
  followup: 'scheduled_visit',
  test_fail: 'repair',
  warranty: 'repair',
  emergency: 'emergency',
  unknown_history: 'survey',
  customer_request: 'scheduled_visit',
};

export interface VisitForm {
  customer_id: string;
  visit_type: VisitType;
  device_id: string;
  technician_id: string;
  /** `datetime-local` value, e.g. 2026-07-30T09:00 */
  scheduled_at: string;
  status: string;
  address: string;
  notes: string;
  confirmed: boolean;
  confirmation_channel: ConfirmationChannel | '';
}

export function emptyVisitForm(overrides: Partial<VisitForm> = {}): VisitForm {
  return {
    customer_id: '',
    visit_type: 'scheduled_visit',
    device_id: '',
    technician_id: '',
    scheduled_at: '',
    status: 'pending',
    address: '',
    notes: '',
    confirmed: false,
    confirmation_channel: '',
    ...overrides,
  };
}

/** Form → `appointments` row. */
export function toAppointmentRow(form: VisitForm, createdBy?: string | null) {
  const confirmedAt = form.confirmed ? new Date().toISOString() : null;

  return {
    customer_id: form.customer_id,
    technician_id: form.technician_id || null,
    visit_type: form.visit_type,
    service_type: visitTypeDef(form.visit_type).serviceLabel,
    device_id: form.device_id || null,
    scheduled_at: form.scheduled_at,
    status: form.status,
    address: form.address.trim(),
    notes: form.notes.trim(),
    confirmed: form.confirmed,
    confirmed_at: confirmedAt,
    confirmed_by: form.confirmed ? createdBy ?? null : null,
    confirmation_channel: form.confirmed ? form.confirmation_channel || 'phone' : null,
    created_by: createdBy ?? null,
  };
}

export function validateVisit(form: VisitForm): { field: keyof VisitForm; key: string }[] {
  const errors: { field: keyof VisitForm; key: string }[] = [];

  if (!form.customer_id) errors.push({ field: 'customer_id', key: 'errCustomer' });
  if (!form.scheduled_at) errors.push({ field: 'scheduled_at', key: 'errDate' });
  if (form.confirmed && !form.confirmation_channel) {
    errors.push({ field: 'confirmation_channel', key: 'errChannel' });
  }
  return errors;
}

/**
 * How many months until the next visit of this kind is normally due.
 * Used to pre-fill the next-visit date; the office can always override.
 */
export const DEFAULT_FOLLOWUP_MONTHS: Record<VisitType, number> = {
  installation: 3,
  preventive_maintenance: 3,
  scheduled_visit: 3,
  repair: 1,
  emergency: 1,
  survey: 0,
};

export const CONTRACT_PLAN_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  biannual: 6,
  annual: 12,
};

/** Local-time `datetime-local` string, N months out at 09:00. */
export function suggestNextVisitDate(months: number, from = new Date()): string {
  if (months <= 0) return '';
  const next = new Date(from);
  next.setMonth(next.getMonth() + months);
  next.setHours(9, 0, 0, 0);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:${pad(next.getMinutes())}`;
}
