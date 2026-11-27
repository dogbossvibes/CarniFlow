// Aktuelles Wetter über die ANYVO-Funktion `track-weather` (MET Norway, CC BY 4.0).
// Ersetzt die früheren direkten Open-Meteo-Abrufe (Lizenz dort nur nicht-kommerziell).
// Datenschutz: der Standort wird schon in der App auf ~1 km gerundet; MET sieht
// weder IP-Adresse noch Konto. Fehler → null, damit nie eine Aufnahme blockiert.
//
// Gespeicherte Daten bleiben im bisherigen Format: MET-Symbole werden auf den
// WMO-Code abgebildet, den Regenmodus, Ablenkungen und Bezeichnungen erwarten.

export interface MetCurrent {
  temperature: number | null;   // °C
  humidity: number | null;      // %
  windSpeed: number | null;     // km/h
  windGust: number | null;      // km/h
  windDirection: number | null; // Grad, woher
  cloudCover: number | null;    // %
  symbol: string | null;        // MET-Symbolcode
  wmoCode: number | null;       // abgeleiteter WMO-Code
}

const HOUR_MS = 3_600_000;
const DEFAULT_TIMEOUT_MS = 10_000;

const round2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;

// MET-Symbol ohne Tageszeit-Endung → WMO-Code (wie Open-Meteo ihn lieferte).
// Schneeregen (sleet) zählt als Regen, damit der Regenmodus wie bisher greift.
const SYMBOL_TO_WMO: Record<string, number> = {
  clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
  lightrain: 61, rain: 63, heavyrain: 65,
  lightsleet: 61, sleet: 63, heavysleet: 65,
  lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
  lightsleetshowers: 80, sleetshowers: 81, heavysleetshowers: 82,
  lightsnow: 71, snow: 73, heavysnow: 75,
  lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86,
};

export function metSymbolToWmo(symbol: string | null | undefined): number | null {
  if (typeof symbol !== 'string' || !symbol) return null;
  const base = symbol.replace(/_(day|night|polartwilight)$/, '').toLowerCase();
  if (base.includes('thunder')) return 95;
  return SYMBOL_TO_WMO[base] ?? null;
}

/** Stunde, in die `nowMs` fällt (sonst die früheste Stunde danach), aus der Funktionsantwort. */
export function pickCurrentHour(raw: unknown, nowMs: number): MetCurrent | null {
  const list = (raw as { hours?: unknown } | null)?.hours;
  if (!Array.isArray(list)) return null;
  let best: { t: number; r: Record<string, unknown> } | null = null;
  for (const h of list) {
    if (!h || typeof h !== 'object') continue;
    const r = h as Record<string, unknown>;
    const t = typeof r.time === 'string' ? Date.parse(r.time) : NaN;
    if (!Number.isFinite(t) || t + HOUR_MS <= nowMs) continue;
    if (!best || t < best.t) best = { t, r };
  }
  if (!best) return null;
  const r = best.r;
  const symbol = typeof r.symbol === 'string' ? r.symbol.slice(0, 40) : null;
  return {
    temperature: num(r.temperature, -100, 100),
    humidity: num(r.humidity, 0, 100),
    windSpeed: num(r.windSpeed, 0, 500),
    windGust: num(r.windGust, 0, 500),
    windDirection: num(r.windDirection, 0, 360),
    cloudCover: num(r.cloudCover, 0, 100),
    symbol,
    wmoCode: metSymbolToWmo(symbol),
  };
}

/** Aktuelles Wetter für lat/lng. null bei Fehler, Zeitüberschreitung oder ohne Netz. */
export async function fetchMetCurrent(lat: number, lng: number, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<MetCurrent | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Erst hier laden: Supabase braucht die App-Umgebung, reine Tests nicht.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabase } = require('@/lib/supabase') as typeof import('@/lib/supabase');
    const call = supabase.functions.invoke('track-weather', { body: { lat: round2(lat), lng: round2(lng) } });
    const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); });
    const res = await Promise.race([call, timeout]);
    if (!res || res.error || !res.data) return null;
    return pickCurrentHour(res.data, Date.now());
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
