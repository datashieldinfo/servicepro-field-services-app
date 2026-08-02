/**
 * The device catalogue every screen picks from.
 *
 * This list was written out four times — in the installation modal, the device
 * editor, the full customer edit page and the Back Office — so adding a model
 * meant finding all four.
 */

export const DEVICE_BRANDS = [
  'BioFamily 4-Stage',
  'BioFamily 7-Stage',
  'Ruhens Cooler',
  'Family Cooler',
  'Other',
];

/** Warranty options offered at install time, in months. */
export const WARRANTY_MONTHS = [12, 24, 36];

/**
 * What the device is fitted to serve. The same brand goes into a flat and into
 * a plant, but not with the same filters, the same interval or the same price —
 * so every device, and every contract covering one, states which it is.
 */
export type UsageType = 'home' | 'industrial';

export const USAGE_TYPES: UsageType[] = ['home', 'industrial'];

export const USAGE_TONE: Record<UsageType, string> = {
  home: 'bg-sky-50 text-sky-700 border-sky-200',
  industrial: 'bg-amber-50 text-amber-800 border-amber-200',
};

export interface DeviceRecord {
  id: string;
  customer_id?: string;
  device_brand: string;
  device_model: string | null;
  serial_number: string | null;
  installation_date: string | null;
  warranty_expires: string | null;
  location_in_premises: string | null;
  usage_type?: UsageType;
}
