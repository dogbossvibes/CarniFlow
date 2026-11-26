// Fährtenwetter — reine, testbare Bewertung «Ist heute ein guter Fährtentag?».
// Keine Netzwerk-, Speicher- oder UI-Logik. Fehlende Messwerte bleiben unbekannt
// und zählen weder positiv noch negativ.
//
// Die Schwellen sind Startwerte aus der Fährtenpraxis, keine Wissenschaft:
// Wind verweht und trocknet die Spur, Wärme und Sonne lassen den Geruch schnell
// verfliegen und belasten den Hund, feuchter Boden und feuchte Luft halten die
// Spur. Starker Regen wäscht aus, Gewitter und Sturm sind ein Sicherheitsthema.

export type TrackWeatherLevel = 'good' | 'medium' | 'hard';

export interface WeatherHour {
  timeMs: number;               // Beginn der Stunde
  temperature: number | null;   // °C
  humidity: number | null;      // %
  windSpeed: number | null;     // km/h
  windGust: number | null;      // km/h
  cloudCover: number | null;    // %
  uvIndex: number | null;       // UV bei klarem Himmel
  precipitation: number | null; // mm in der Stunde
  thunderProbability: number | null; // %
  symbol: string | null;
}

export type ReasonKey =
  | 'storm' | 'thunder' | 'heat'
  | 'windStrong' | 'windModerate' | 'gusts'
  | 'warm' | 'frost' | 'cold'
  | 'heavyRain' | 'rain'
  | 'dryGround' | 'dryAir' | 'strongSun'
  | 'calm' | 'wetGround' | 'humid' | 'mild';

export interface Reason {
  key: ReasonKey;
  /** >0 erschwert, <0 hilft, 0 = nur hilfreicher Hinweis. Harte Gründe haben Gewicht 10. */
  weight: number;
  values: Record<string, number>;
}

export interface HourRating {
  timeMs: number;
  points: number;
  level: TrackWeatherLevel;
  daylight: boolean;
  reasons: Reason[];
}

export interface TrackWeatherWindow {
  startMs: number;
  endMs: number;
  level: TrackWeatherLevel;
  /** true, wenn das Fenster in der laufenden Stunde beginnt. */
  startsNow: boolean;
}

export interface TrackWeatherRating {
  level: TrackWeatherLevel;
  /** Höchstens zwei Gründe für die Anzeige, wichtigster zuerst. */
  reasons: Reason[];
  bestWindow: TrackWeatherWindow | null;
  /** Bewertete nächste Stunden (für den Stundenbalken), ab der laufenden Stunde. */
  hours: HourRating[];
  current: WeatherHour;
}

export const HOUR_MS = 3_600_000;
export const WINDOW_LOOKAHEAD_HOURS = 12;
export const MIN_WINDOW_HOURS = 2;
const HARD = 10;

/** Gründe, die für die Fährte sprechen. */
export const HELPFUL_REASONS: ReadonlySet<ReasonKey> = new Set<ReasonKey>(['calm', 'wetGround', 'humid', 'mild']);

export const LEVEL_RANK: Record<TrackWeatherLevel, number> = { good: 0, medium: 1, hard: 2 };

const rounded = (v: number) => Math.round(v);

export function levelFromPoints(points: number, hard: boolean): TrackWeatherLevel {
  if (hard || points >= 4) return 'hard';
  if (points >= 2) return 'medium';
  return 'good';
}

export function isThunder(h: Pick<WeatherHour, 'symbol' | 'thunderProbability'>): boolean {
  if (typeof h.symbol === 'string' && h.symbol.includes('thunder')) return true;
  return typeof h.thunderProbability === 'number' && h.thunderProbability >= 30;
}

/**
 * Bewertet eine Stunde.
 * @param recentRainMm Regen der letzten 12 h inkl. dieser Stunde; null = unbekannt.
 * @param localHour   Stunde 0–23 in Ortszeit (für die Mittagssonne).
 */
export function rateHour(h: WeatherHour, ctx: { recentRainMm: number | null; localHour: number; daylight: boolean }): HourRating {
  const reasons: Reason[] = [];
  const add = (key: ReasonKey, weight: number, values: Record<string, number> = {}) => reasons.push({ key, weight, values });

  // Gefahr zuerst
  if (isThunder(h)) add('thunder', HARD);
  if (h.windGust != null && h.windGust > 50) add('storm', HARD, { gust: rounded(h.windGust) });
  if (h.temperature != null && h.temperature > 28) add('heat', HARD, { temp: rounded(h.temperature) });

  // Wind
  if (h.windSpeed != null) {
    const w = h.windSpeed;
    if (w > 30) add('windStrong', 3, { wind: rounded(w) });
    else if (w > 20) add('windStrong', 2, { wind: rounded(w) });
    else if (w > 10) add('windModerate', 1, { wind: rounded(w) });
    else if (w <= 5) add('calm', 0, { wind: rounded(w) });
  }
  if (h.windGust != null && h.windGust > 35 && h.windGust <= 50) add('gusts', 1, { gust: rounded(h.windGust) });

  // Temperatur
  if (h.temperature != null) {
    const t = h.temperature;
    if (t > 24 && t <= 28) add('warm', 2, { temp: rounded(t) });
    else if (t > 18 && t <= 24) add('warm', 1, { temp: rounded(t) });
    else if (t < -5) add('frost', 2, { temp: rounded(t) });
    else if (t < 0) add('cold', 1, { temp: rounded(t) });
    else if (t >= 5 && t <= 18) add('mild', 0, { temp: rounded(t) });
  }

  // Niederschlag jetzt
  if (h.precipitation != null) {
    if (h.precipitation > 4) add('heavyRain', 2, { mm: Math.round(h.precipitation * 10) / 10 });
    else if (h.precipitation >= 1) add('rain', 1, { mm: Math.round(h.precipitation * 10) / 10 });
  }

  // Boden: Regen kurz zuvor hält die Spur, lange trocken mit Sonne nicht
  const sunny = h.cloudCover != null && h.cloudCover < 30;
  if (ctx.recentRainMm != null) {
    if (ctx.recentRainMm >= 0.5 && (h.precipitation == null || h.precipitation <= 4)) add('wetGround', -1);
    else if (ctx.recentRainMm === 0 && sunny && ctx.daylight) add('dryGround', 1);
  }

  // Luftfeuchte
  if (h.humidity != null) {
    if (h.humidity < 40) add('dryAir', 1, { rh: rounded(h.humidity) });
    else if (h.humidity < 60) add('dryAir', 0.5, { rh: rounded(h.humidity) });
    else if (h.humidity >= 75) add('humid', 0, { rh: rounded(h.humidity) });
  }

  // Sonne um die Mittagszeit
  if (ctx.daylight && ctx.localHour >= 11 && ctx.localHour < 16) {
    const strongUv = h.uvIndex != null && h.uvIndex >= 5 && (h.cloudCover == null || h.cloudCover < 60);
    if (strongUv || (h.cloudCover != null && h.cloudCover < 20)) add('strongSun', 1);
  }

  const hard = reasons.some(r => r.weight >= HARD);
  const points = Math.max(0, reasons.filter(r => r.weight < HARD).reduce((s, r) => s + r.weight, 0));
  return { timeMs: h.timeMs, points: Math.round(points * 100) / 100, level: levelFromPoints(points, hard), daylight: ctx.daylight, reasons };
}

// ── Sonnenauf- und -untergang (NOAA-Näherung, auf wenige Minuten genau) ──

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Sonnenauf-/untergang (UTC-ms) für den Tag von `dayMs`. null = Polartag/-nacht. */
export function sunTimes(dayMs: number, lat: number, lng: number): { sunrise: number; sunset: number } | null {
  const d = new Date(dayMs);
  const startOfUtcDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dayOfYear = Math.floor((startOfUtcDay - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000);
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + 0.5);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const cosH = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(decl)) - Math.tan(rad(lat)) * Math.tan(decl);
  if (cosH > 1 || cosH < -1) return null;
  const ha = deg(Math.acos(cosH));
  const sunriseMin = 720 - 4 * (lng + ha) - eqTime;
  const sunsetMin = 720 - 4 * (lng - ha) - eqTime;
  return { sunrise: startOfUtcDay + sunriseMin * 60_000, sunset: startOfUtcDay + sunsetMin * 60_000 };
}

/** Stunde gilt als Tageslicht, wenn ihre Mitte zwischen Auf- und Untergang liegt. */
export function isDaylightHour(hourStartMs: number, lat: number, lng: number): boolean {
  const mid = hourStartMs + HOUR_MS / 2;
  const s = sunTimes(mid, lat, lng);
  if (!s) {
    // Polartag (Sommer) vs. Polarnacht: grob über die Jahreszeit
    const month = new Date(mid).getUTCMonth();
    const summer = month >= 3 && month <= 8;
    return lat >= 0 ? summer : !summer;
  }
  return mid >= s.sunrise && mid <= s.sunset;
}

/** Regen der 12 h bis einschliesslich `hourMs`; null, wenn keine früheren Stunden bekannt sind. */
export function recentRain(hours: WeatherHour[], hourMs: number): number | null {
  const from = hourMs - 11 * HOUR_MS;
  const relevant = hours.filter(h => h.timeMs >= from && h.timeMs <= hourMs);
  const known = relevant.filter(h => h.precipitation != null);
  const sum = Math.round(known.reduce((s, h) => s + (h.precipitation as number), 0) * 10) / 10;
  if (sum >= 0.5) return sum;
  // «Trocken» nur behaupten, wenn genug Vergangenheit bekannt ist (mind. 6 frühere Stunden).
  return known.filter(h => h.timeMs < hourMs).length >= 6 ? sum : null;
}

/**
 * Bestes Fenster in den nächsten 12 h: die beste Stufe, die mindestens 2
 * zusammenhängende Tagesstunden erreichen; davon das früheste, so lang wie die
 * Stufe hält.
 */
export function findBestWindow(rated: HourRating[], currentHourMs: number): TrackWeatherWindow | null {
  const span = rated.filter(r => r.timeMs >= currentHourMs && r.timeMs < currentHourMs + WINDOW_LOOKAHEAD_HOURS * HOUR_MS);
  const runFor = (maxRank: number): { a: number; b: number } | null => {
    let a = -1;
    for (let i = 0; i <= span.length; i++) {
      const ok = i < span.length && span[i].daylight && LEVEL_RANK[span[i].level] <= maxRank
        && (a < 0 || span[i].timeMs === span[i - 1].timeMs + HOUR_MS);
      if (ok) { if (a < 0) a = i; continue; }
      if (a >= 0 && i - a >= MIN_WINDOW_HOURS) return { a, b: i - 1 };
      // Stunde passt nicht (oder Lücke): neuer Versuch ab hier
      a = i < span.length && span[i].daylight && LEVEL_RANK[span[i].level] <= maxRank ? i : -1;
    }
    return null;
  };
  for (const level of ['good', 'medium', 'hard'] as TrackWeatherLevel[]) {
    const run = runFor(LEVEL_RANK[level]);
    if (!run) continue;
    const startMs = span[run.a].timeMs;
    return { startMs, endMs: span[run.b].timeMs + HOUR_MS, level, startsNow: startMs === currentHourMs };
  }
  return null;
}

/** Die zwei aussagekräftigsten Gründe: harte und erschwerende zuerst, bei «gut» die hilfreichen. */
export function pickReasons(rating: HourRating): Reason[] {
  const negative = rating.reasons.filter(r => r.weight > 0).sort((a, b) => b.weight - a.weight);
  const positive = rating.reasons.filter(r => HELPFUL_REASONS.has(r.key)).sort((a, b) => a.weight - b.weight);
  if (rating.level === 'good') return [...positive, ...negative].slice(0, 2);
  return [...negative, ...positive].slice(0, 2);
}

/**
 * Gesamtbewertung für «jetzt» plus bestes Fenster.
 * @param hours Bekannte Stunden (Vergangenheit aus dem lokalen Verlauf + Vorhersage), beliebige Reihenfolge.
 * @param timeZoneOffsetMin Versatz der Ortszeit zu UTC in Minuten (z. B. +60 für MEZ).
 */
export function rateTrackingWeather(
  hours: WeatherHour[], nowMs: number, coords: { lat: number; lng: number }, timeZoneOffsetMin: number,
): TrackWeatherRating | null {
  const sorted = [...hours].filter(h => Number.isFinite(h.timeMs)).sort((a, b) => a.timeMs - b.timeMs);
  const currentHourMs = nowMs - (((nowMs % HOUR_MS) + HOUR_MS) % HOUR_MS);
  const future = sorted.filter(h => h.timeMs >= currentHourMs);
  const current = future[0];
  if (!current || current.timeMs > currentHourMs + HOUR_MS) return null; // keine Daten für jetzt
  const rated = future.slice(0, 24).map(h => {
    const localHour = new Date(h.timeMs + timeZoneOffsetMin * 60_000).getUTCHours();
    return rateHour(h, { recentRainMm: recentRain(sorted, h.timeMs), localHour, daylight: isDaylightHour(h.timeMs, coords.lat, coords.lng) });
  });
  const now = rated[0];
  return {
    level: now.level,
    reasons: pickReasons(now),
    bestWindow: findBestWindow(rated, current.timeMs),
    hours: rated.slice(0, WINDOW_LOOKAHEAD_HOURS),
    current,
  };
}

/** Lokaler Verlauf: frühere Stunden (≤ 24 h) behalten, neue Vorhersage hat Vorrang. */
export function mergeHourHistory(previous: WeatherHour[], fresh: WeatherHour[], nowMs: number): WeatherHour[] {
  const keepFrom = nowMs - 24 * HOUR_MS;
  const byTime = new Map<number, WeatherHour>();
  for (const h of previous) if (h.timeMs >= keepFrom && Number.isFinite(h.timeMs)) byTime.set(h.timeMs, h);
  for (const h of fresh) if (Number.isFinite(h.timeMs)) byTime.set(h.timeMs, h);
  return [...byTime.values()].sort((a, b) => a.timeMs - b.timeMs).slice(-60);
}
