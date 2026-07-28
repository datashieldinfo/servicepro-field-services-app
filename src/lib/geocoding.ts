/**
 * Map-pin helpers: browser geolocation + OpenStreetMap (Nominatim) search /
 * reverse-geocoding. No API key and no extra dependency required.
 *
 * Every call fails soft — the form always keeps a manual lat/lng entry path so
 * a blocked permission or an offline network never blocks customer creation.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export interface GeoPlace {
  label: string;
  lat: number;
  lng: number;
  state?: string;
  city?: string;
  area?: string;
  street?: string;
}

interface NominatimAddress {
  state?: string;
  region?: string;
  county?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  city_district?: string;
  road?: string;
  pedestrian?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

function toPlace(r: NominatimResult): GeoPlace {
  const a = r.address ?? {};
  return {
    label: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    state: a.state ?? a.region ?? a.county,
    city: a.city ?? a.town ?? a.village ?? a.municipality,
    area: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district,
    street: a.road ?? a.pedestrian,
  };
}

/** Free-text place search, biased to Jordan but not restricted to it. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url =
    `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=6` +
    `&countrycodes=jo&q=${encodeURIComponent(q)}`;

  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`);

  let results = (await res.json()) as NominatimResult[];

  // Nothing inside Jordan? retry worldwide before giving up.
  if (!results.length) {
    const wide = await fetch(
      `${NOMINATIM}/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`,
      { signal, headers: { Accept: 'application/json' } }
    );
    if (wide.ok) results = (await wide.json()) as NominatimResult[];
  }

  return results.map(toPlace);
}

export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<GeoPlace | null> {
  const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const json = (await res.json()) as NominatimResult & { error?: string };
  if (!json || json.error || !json.lat) return null;
  return toPlace(json);
}

export interface Coords { lat: number; lng: number; accuracy?: number }

/** Wraps navigator.geolocation in a promise with a hard timeout. */
export function locateMe(timeoutMs = 15000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('geolocation-unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      err => reject(new Error(err.code === err.PERMISSION_DENIED ? 'geolocation-denied' : 'geolocation-failed')),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/**
 * Accepts anything a user is likely to paste:
 *   "31.9539, 35.9106"  |  a Google Maps URL  |  an OSM URL  |  a geo: URI
 */
export function parseCoordinates(input: string): Coords | null {
  const text = (input || '').trim();
  if (!text) return null;

  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,          // .../@31.95,35.91,17z
    /[?&](?:q|ll|mlat|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // ...?q=31.95,35.91
    /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/,   // OSM hash
    /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,         // geo: URI
    /^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/, // plain pair
  ];

  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}
