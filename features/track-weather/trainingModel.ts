// Trainingswetter — reine, testbare Bewertung «Passt das Wetter heute fürs Training?».
// Gilt für jedes Training draussen (Unterordnung, Schutzdienst, Spaziergang mit Übungen).
// Die Fährte hat ihre eigene Bewertung in model.ts, weil dort Wind, Feuchte und
// Boden die Spur verändern; hier zählen Hund und Mensch: Hitze, heisser Boden
// für die Pfoten, Gewitter, Sturm, Regen und starke Sonne. Mantrailing hat
// eigene Regeln (rateMantrailHour), weil Wind, Boden und Sonne anders wirken.
//
// Schwellen sind Startwerte aus der Praxis, keine Wissenschaft. Fehlende Werte
// bleiben unbekannt und zählen weder positiv noch negativ.

import {
  DAYS_AHEAD, HOUR_MS, WINDOW_LOOKAHEAD_HOURS, isDaylightHour, isThunder, levelFromPoints, outlookDays, pickReasons, findBestWindow,
  type DayOutlook, type HourRating, type Reason, type ReasonKey, type TrackWeatherLevel, type TrackWeatherWindow, type WeatherHour,
} from './model';

const HARD = 10;

export interface TrainingWeatherRating {
  level: TrackWeatherLevel;
  /** Höchstens zwei Gründe für die Anzeige, wichtigster zuerst. */
  reasons: Reason[];
  bestWindow: TrackWeatherWindow | null;
  /** Bewertete nächste Stunden (für den Stundenbalken), ab der laufenden Stunde. */
  hours: HourRating[];
  current: WeatherHour;
  /** Heute, morgen, übermorgen (nur vollständig bekannte Tage). */
  days: DayOutlook[];
}

/** Bewertet eine Stunde fürs allgemeine Training. */
export function rateTrainingHour(h: WeatherHour, ctx: { localHour: number; daylight: boolean }): HourRating {
  const reasons: Reason[] = [];
  const add = (key: ReasonKey, weight: number, values: Record<string, number> = {}) => reasons.push({ key, weight, values });
  const r = Math.round;

  // Gefahr zuerst
  if (isThunder(h)) add('tThunder', HARD);
  if (h.windGust != null && h.windGust > 60) add('tStorm', HARD, { gust: r(h.windGust) });
  if (h.temperature != null && h.temperature > 28) add('tHeat', HARD, { temp: r(h.temperature) });

  const midday = ctx.daylight && ctx.localHour >= 11 && ctx.localHour < 17;
  const sunny = h.cloudCover != null && h.cloudCover < 40;

  // Temperatur
  if (h.temperature != null) {
    const t = h.temperature;
    if (t > 25 && t <= 28) add('tWarm', 2, { temp: r(t) });
    else if (t > 21 && t <= 25) add('tWarm', 1, { temp: r(t) });
    else if (t < -10) add('tCold', 2, { temp: r(t) });
    else if (t < -3) add('tCold', 1, { temp: r(t) });
    else if (t >= 3 && t <= 21) add('tMild', 0, { temp: r(t) });
    // Asphalt und Steine werden in der Sonne viel heisser als die Luft.
    if (t > 22 && t <= 28 && sunny && midday) add('tHotPaws', 1);
  }

  // Niederschlag
  if (h.precipitation != null) {
    const mm = Math.round(h.precipitation * 10) / 10;
    if (h.precipitation > 4) add('tHeavyRain', 2, { mm });
    else if (h.precipitation >= 1) add('tRain', 1, { mm });
    else if (h.precipitation === 0) add('tDry', 0);
  }

  // Wind (fürs Training weniger kritisch als für die Spur)
  if (h.windSpeed != null && h.windSpeed > 40) add('tWind', 2, { wind: r(h.windSpeed) });
  else if (h.windGust != null && h.windGust > 45 && h.windGust <= 60) add('tGusts', 1, { gust: r(h.windGust) });

  // Starke Sonne am Mittag
  if (midday && h.uvIndex != null && h.uvIndex >= 6 && (h.cloudCover == null || h.cloudCover < 60)) add('tSun', 1, { uv: r(h.uvIndex) });

  const hard = reasons.some(x => x.weight >= HARD);
  const points = Math.max(0, reasons.filter(x => x.weight < HARD).reduce((s, x) => s + x.weight, 0));
  return { timeMs: h.timeMs, points: Math.round(points * 100) / 100, level: levelFromPoints(points, hard), daylight: ctx.daylight, reasons };
}

type HourRater = (h: WeatherHour, ctx: { localHour: number; daylight: boolean }) => HourRating;

/** Gemeinsamer Ablauf: jetzt, bestes Fenster (12 h), Stundenbalken und die nächsten Tage. */
function rateWith(
  rate: HourRater, hours: WeatherHour[], nowMs: number, coords: { lat: number; lng: number }, timeZoneOffsetMin: number,
): TrainingWeatherRating | null {
  const sorted = [...hours].filter(h => Number.isFinite(h.timeMs)).sort((a, b) => a.timeMs - b.timeMs);
  const currentHourMs = nowMs - (((nowMs % HOUR_MS) + HOUR_MS) % HOUR_MS);
  const future = sorted.filter(h => h.timeMs >= currentHourMs);
  const current = future[0];
  if (!current || current.timeMs > currentHourMs + HOUR_MS) return null;
  const rated = future.slice(0, DAYS_AHEAD * 24 + 24).map(h => rate(h, {
    localHour: new Date(h.timeMs + timeZoneOffsetMin * 60_000).getUTCHours(),
    daylight: isDaylightHour(h.timeMs, coords.lat, coords.lng),
  }));
  return {
    level: rated[0].level,
    reasons: pickReasons(rated[0]),
    bestWindow: findBestWindow(rated, current.timeMs),
    hours: rated.slice(0, WINDOW_LOOKAHEAD_HOURS),
    current,
    days: outlookDays(rated, currentHourMs, coords, timeZoneOffsetMin),
  };
}

/** Gesamtbewertung fürs Training. */
export function rateTrainingWeather(
  hours: WeatherHour[], nowMs: number, coords: { lat: number; lng: number }, timeZoneOffsetMin: number,
): TrainingWeatherRating | null {
  return rateWith(rateTrainingHour, hours, nowMs, coords, timeZoneOffsetMin);
}

/**
 * Mantrailing: der Hund sucht den Geruch eines Menschen, oft auf Asphalt und in
 * Siedlungen. Anders als bei der Fährte zählt der Boden kaum, und leichter bis
 * mittlerer Wind ist normal (der Geruch liegt versetzt, der Hund arbeitet daneben).
 * Wärme, Mittagssonne (Geruch steigt auf und verwirbelt) und warmer Asphalt lassen
 * den Geruch schnell verfliegen; feuchte Luft und leichter Regen halten ihn,
 * starker Regen wäscht aus. Startwerte aus der Praxis, keine Wissenschaft.
 */
export function rateMantrailHour(h: WeatherHour, ctx: { localHour: number; daylight: boolean }): HourRating {
  const reasons: Reason[] = [];
  const add = (key: ReasonKey, weight: number, values: Record<string, number> = {}) => reasons.push({ key, weight, values });
  const r = Math.round;

  if (isThunder(h)) add('tThunder', HARD);
  if (h.windGust != null && h.windGust > 60) add('tStorm', HARD, { gust: r(h.windGust) });
  if (h.temperature != null && h.temperature > 28) add('tHeat', HARD, { temp: r(h.temperature) });

  const midday = ctx.daylight && ctx.localHour >= 11 && ctx.localHour < 17;
  const sunny = h.cloudCover != null && h.cloudCover < 40;

  // Wind
  if (h.windSpeed != null) {
    const w = h.windSpeed;
    if (w > 30) add('mWindStrong', 2, { wind: r(w) });
    else if (w > 5) add('mWindDrift', 0, { wind: r(w) });
  }
  if (h.windGust != null && h.windGust > 45 && h.windGust <= 60) add('tGusts', 1, { gust: r(h.windGust) });

  // Temperatur
  if (h.temperature != null) {
    const t = h.temperature;
    if (t > 24 && t <= 28) add('mWarm', 2, { temp: r(t) });
    else if (t > 20 && t <= 24) add('mWarm', 1, { temp: r(t) });
    else if (t < -5) add('tCold', 1, { temp: r(t) });
    else if (t >= 0 && t <= 15) add('mCool', 0, { temp: r(t) });
    if (t > 20 && t <= 28 && sunny && midday) add('mHotAsphalt', 1);
  }

  // Niederschlag
  if (h.precipitation != null) {
    if (h.precipitation > 4) add('mHeavyRain', 2, { mm: Math.round(h.precipitation * 10) / 10 });
    else if (h.precipitation >= 0.1) add('mDrizzle', 0);
  }

  // Luftfeuchte
  if (h.humidity != null) {
    if (h.humidity < 40) add('mDryAir', 1, { rh: r(h.humidity) });
    else if (h.humidity >= 70) add('mHumid', 0, { rh: r(h.humidity) });
  }

  // Mittagssonne: Wärme hebt den Geruch an
  if (midday && sunny) add('mThermal', 1);

  const hard = reasons.some(x => x.weight >= HARD);
  const points = Math.max(0, reasons.filter(x => x.weight < HARD).reduce((s, x) => s + x.weight, 0));
  return { timeMs: h.timeMs, points: Math.round(points * 100) / 100, level: levelFromPoints(points, hard), daylight: ctx.daylight, reasons };
}

/** Gesamtbewertung fürs Mantrailing. */
export function rateMantrailWeather(
  hours: WeatherHour[], nowMs: number, coords: { lat: number; lng: number }, timeZoneOffsetMin: number,
): TrainingWeatherRating | null {
  return rateWith(rateMantrailHour, hours, nowMs, coords, timeZoneOffsetMin);
}
