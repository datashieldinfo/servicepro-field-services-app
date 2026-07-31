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

export interface DeviceRecord {
  id: string;
  customer_id?: string;
  device_brand: string;
  device_model: string | null;
  serial_number: string | null;
  installation_date: string | null;
  warranty_expires: string | null;
  location_in_premises: string | null;
}
