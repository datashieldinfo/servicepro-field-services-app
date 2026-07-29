import { useEffect, useRef, useState } from 'react';
import { Crosshair, Loader2, MapPin, Search, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { locateMe, parseCoordinates, reverseGeocode, searchPlaces, type GeoPlace } from '../lib/geocoding';
import { mapsUrl } from '../lib/customerFields';

interface Props {
  latitude: string;
  longitude: string;
  label: string;
  onChange: (pin: { latitude: string; longitude: string; label: string }) => void;
  /** Called with the resolved place so the form can fill empty address fields. */
  onPlaceResolved?: (place: GeoPlace) => void;
}

export default function LocationPicker({ latitude, longitude, label, onChange, onPlaceResolved }: Props) {
  const { t } = useTranslation();

  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<GeoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError]       = useState('');
  const [manual, setManual]     = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const hasPin = latitude !== '' && longitude !== '';

  /* debounced place search */
  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      setError('');
      try {
        setResults(await searchPlaces(query, controller.signal));
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError(t('customerForm.geoSearchFailed'));
      } finally {
        setSearching(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [query, t]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function applyPlace(place: GeoPlace) {
    onChange({ latitude: place.lat.toFixed(6), longitude: place.lng.toFixed(6), label: place.label });
    onPlaceResolved?.(place);
    setResults([]);
    setQuery('');
  }

  async function handleLocateMe() {
    setLocating(true);
    setError('');
    try {
      const coords = await locateMe();
      const place = await reverseGeocode(coords.lat, coords.lng).catch(() => null);
      if (place) {
        applyPlace({ ...place, lat: coords.lat, lng: coords.lng });
      } else {
        onChange({
          latitude: coords.lat.toFixed(6),
          longitude: coords.lng.toFixed(6),
          label: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
        });
      }
    } catch (err) {
      const code = (err as Error).message;
      setError(
        code === 'geolocation-denied'      ? t('customerForm.geoDenied')
        : code === 'geolocation-unsupported' ? t('customerForm.geoUnsupported')
        : t('customerForm.geoFailed')
      );
    } finally {
      setLocating(false);
    }
  }

  async function handleManualPin() {
    const coords = parseCoordinates(manual);
    if (!coords) {
      setError(t('customerForm.geoBadCoords'));
      return;
    }
    setError('');
    setManual('');
    const place = await reverseGeocode(coords.lat, coords.lng).catch(() => null);
    if (place) applyPlace({ ...place, lat: coords.lat, lng: coords.lng });
    else onChange({
      latitude: coords.lat.toFixed(6),
      longitude: coords.lng.toFixed(6),
      label: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
    });
  }

  const bbox = hasPin
    ? [
        (parseFloat(longitude) - 0.004).toFixed(6),
        (parseFloat(latitude) - 0.003).toFixed(6),
        (parseFloat(longitude) + 0.004).toFixed(6),
        (parseFloat(latitude) + 0.003).toFixed(6),
      ].join('%2C')
    : '';

  return (
    <div className="border border-slate-200 rounded-xl p-3 space-y-3 bg-slate-50/60">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-blue-600" />
          {t('customerForm.pinLocation')}
        </p>
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={locating}
          className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg transition"
        >
          {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
          {t('customerForm.useMyLocation')}
        </button>
      </div>

      {/* search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('customerForm.searchPlacePlaceholder')}
          className="w-full border border-slate-200 rounded-xl ps-10 pe-9 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
        />
        {searching && <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}

        {results.length > 0 && (
          <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
            {results.map((place, i) => (
              <li key={`${place.lat}-${place.lng}-${i}`}>
                <button
                  type="button"
                  onClick={() => applyPlace(place)}
                  className="w-full text-start px-3 py-2 text-xs hover:bg-slate-50 transition flex gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span className="text-slate-700">{place.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* manual coordinates / map link */}
      <div className="flex gap-2">
        <input
          type="text"
          value={manual}
          onChange={e => setManual(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleManualPin(); } }}
          placeholder={t('customerForm.pasteCoordsPlaceholder')}
          dir="ltr"
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none"
        />
        <button
          type="button"
          onClick={handleManualPin}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
        >
          {t('customerForm.setPin')}
        </button>
      </div>

      {error && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      {hasPin && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <iframe
            title="map-preview"
            loading="lazy"
            className="w-full h-40 border-0"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`}
          />
          <div className="p-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 truncate">{label || t('customerForm.pinSet')}</p>
              <p className="text-[11px] text-slate-500" dir="ltr">{latitude}, {longitude}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href={mapsUrl(latitude, longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition"
                title={t('customerForm.openInMaps')}
              >
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>
              <button
                type="button"
                onClick={() => onChange({ latitude: '', longitude: '', label: '' })}
                className="p-1.5 rounded-lg border border-slate-200 hover:bg-red-50 transition"
                title={t('customerForm.clearPin')}
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
