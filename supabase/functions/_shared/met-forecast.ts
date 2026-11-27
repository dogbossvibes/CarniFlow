// Fährtenwetter — reine Hilfsfunktionen für die Edge Function `track-weather`.
// Kein Deno-/Netzwerkcode, damit Jest sie direkt prüfen kann.
//
// Quelle: MET Norway Locationforecast 2.0 (api.met.no), Daten CC BY 4.0.
// Bedingungen: eindeutiger User-Agent, höchstens 4 Dezimalen, Expires beachten,
// mobile Apps fragen nicht direkt ab (darum dieser Proxy).

export const MET_FORECAST_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
export const MET_USER_AGENT = 'ANYVO/1.0 (+https://www.anyvo.app)';
/** Standort wird auf ~1 km gerundet, bevor er den Server verlässt. */
export const COORD_DECIMALS = 2;
/** Stündlicher Teil reicht bei MET rund 60 h; das deckt heute bis übermorgen. */
export const MAX_HOURS = 72;
export const MIN_CACHE_SECONDS = 15 * 60;
export const MAX_CACHE_SECONDS = 2 * 60 * 60;

export interface TrackWeatherHour {
  /** Beginn der Stunde, ISO-Zeit (UTC). */
  time: string;
  temperature: number | null;   // °C
  humidity: number | null;      // %
  windSpeed: number | null;     // km/h (Mittel)
  windGust: number | null;      // km/h
  windDirection: number | null; // Grad, woher
  cloudCover: number | null;    // %
  uvIndex: number | null;       // UV bei klarem Himmel
  precipitation: number | null; // mm in dieser Stunde
  thunderProbability: number | null; // %
  symbol: string | null;        // MET-Symbolcode, z. B. "rainshowers_day"
}

export interface TrackWeatherResponse {
  lat: number;
  lng: number;
  hours: TrackWeatherHour[];
  source: 'met.no';
}

export function roundCoord(value: number): number {
  const f = 10 ** COORD_DECIMALS;
  return Math.round(value * f) / f;
}

/** Prüft und rundet die Anfrage. Ungültig → null (Antwort 400). */
export function parseTrackWeatherRequest(raw: unknown): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: roundCoord(lat), lng: roundCoord(lng) };
}

export function cellKey(lat: number, lng: number): string {
  return `${lat.toFixed(COORD_DECIMALS)},${lng.toFixed(COORD_DECIMALS)}`;
}

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

const round1 = (v: number | null): number | null => (v == null ? null : Math.round(v * 10) / 10);
const msToKmh = (v: number | null): number | null => (v == null ? null : Math.round(v * 3.6 * 10) / 10);

/** MET-Antwort → Stundenliste ab der laufenden Stunde (max. 24). Fehlende Werte bleiben null, nie 0. */
export function mapMetForecast(body: unknown, nowMs: number): TrackWeatherHour[] {
  const series = (body as { properties?: { timeseries?: unknown } } | null)?.properties?.timeseries;
  if (!Array.isArray(series)) return [];
  const hourStart = nowMs - (nowMs % 3_600_000);
  const out: TrackWeatherHour[] = [];
  for (const entry of series) {
    if (out.length >= MAX_HOURS) break;
    if (!entry || typeof entry !== 'object') continue;
    const time = (entry as { time?: unknown }).time;
    if (typeof time !== 'string') continue;
    const t = Date.parse(time);
    if (!Number.isFinite(t) || t < hourStart) continue;
    const data = (entry as { data?: Record<string, any> }).data ?? {};
    const next1 = data.next_1_hours;
    // Nur der stündliche Teil der Vorhersage (danach 6-h-Schritte).
    if (!next1 || typeof next1 !== 'object') break;
    const d = data.instant?.details ?? {};
    const n = next1.details ?? {};
    const symbol = typeof next1.summary?.symbol_code === 'string' ? String(next1.summary.symbol_code).slice(0, 40) : null;
    out.push({
      time: new Date(t).toISOString(),
      temperature: round1(num(d.air_temperature, -80, 60)),
      humidity: round1(num(d.relative_humidity, 0, 100)),
      windSpeed: msToKmh(num(d.wind_speed, 0, 120)),
      windGust: msToKmh(num(d.wind_speed_of_gust, 0, 150)),
      windDirection: num(d.wind_from_direction, 0, 360),
      cloudCover: round1(num(d.cloud_area_fraction, 0, 100)),
      uvIndex: round1(num(d.ultraviolet_index_clear_sky, 0, 20)),
      precipitation: round1(num(n.precipitation_amount, 0, 300)),
      thunderProbability: round1(num(n.probability_of_thunder, 0, 100)),
      symbol,
    });
  }
  return out;
}

/** Cache-Dauer aus dem Expires-Header von MET, begrenzt auf 15 min bis 2 h. */
export function cacheSecondsFromExpires(expires: string | null, nowMs: number): number {
  const t = expires ? Date.parse(expires) : NaN;
  const s = Number.isFinite(t) ? Math.round((t - nowMs) / 1000) : MIN_CACHE_SECONDS;
  return Math.min(MAX_CACHE_SECONDS, Math.max(MIN_CACHE_SECONDS, s));
}
