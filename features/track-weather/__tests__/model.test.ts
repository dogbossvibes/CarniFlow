import {
  HOUR_MS, OBSERVED_GROUND_HOURS, observedGroundFromCondition, findBestWindow, isDaylightHour, levelFromPoints, mergeHourHistory, pickReasons, rateHour,
  rateTrackingWeather, recentRain, sunTimes, type HourRating, type WeatherHour,
} from '../model';

// Bern, Mittwoch 2026-04-15 (MESZ = UTC+2)
const BERN = { lat: 46.95, lng: 7.45 };
const TZ = 120;
const at = (localHour: number) => Date.UTC(2026, 3, 15, localHour - 2);

const hour = (timeMs: number, over: Partial<WeatherHour> = {}): WeatherHour => ({
  timeMs, temperature: 12, humidity: 70, windSpeed: 6, windGust: 15, cloudCover: 70, uvIndex: 3,
  precipitation: 0, thunderProbability: null, symbol: 'cloudy', ...over,
});
const ctx = { recentRainMm: null, localHour: 9, daylight: true };
const keys = (r: HourRating) => r.reasons.map(x => x.key);

describe('rateHour – Einzelregeln', () => {
  it('ruhiges, mildes, feuchtes Wetter ist gut', () => {
    const r = rateHour(hour(at(9), { windSpeed: 4, humidity: 80 }), ctx);
    expect(r.level).toBe('good');
    expect(keys(r)).toEqual(expect.arrayContaining(['calm', 'mild', 'humid']));
  });

  it('Wind steigert stufenweise', () => {
    expect(rateHour(hour(at(9), { windSpeed: 15 }), ctx).points).toBe(1);
    expect(rateHour(hour(at(9), { windSpeed: 25 }), ctx).level).toBe('medium');
    expect(rateHour(hour(at(9), { windSpeed: 35 }), ctx).points).toBe(3);
  });

  it('Sturmböen, Hitze und Gewitter sind immer schwierig', () => {
    expect(rateHour(hour(at(9), { windGust: 55 }), ctx).level).toBe('hard');
    expect(rateHour(hour(at(9), { temperature: 30 }), ctx).level).toBe('hard');
    expect(rateHour(hour(at(9), { symbol: 'heavyrainandthunder' }), ctx).level).toBe('hard');
    expect(rateHour(hour(at(9), { thunderProbability: 40 }), ctx).level).toBe('hard');
  });

  it('Regen kurz zuvor hilft, trockener sonniger Boden nicht', () => {
    const wet = rateHour(hour(at(9), { windSpeed: 15 }), { ...ctx, recentRainMm: 2 });
    expect(keys(wet)).toContain('wetGround');
    expect(wet.points).toBe(0);
    const dry = rateHour(hour(at(9), { cloudCover: 10 }), { ...ctx, recentRainMm: 0 });
    expect(keys(dry)).toContain('dryGround');
  });

  it('starker Regen erschwert, leichter nicht', () => {
    expect(keys(rateHour(hour(at(9), { precipitation: 0.4 }), ctx))).not.toContain('rain');
    expect(rateHour(hour(at(9), { precipitation: 5 }), ctx).points).toBe(2);
  });

  it('trockene Luft und Mittagssonne zählen', () => {
    const r = rateHour(hour(at(13), { humidity: 35, cloudCover: 10, uvIndex: 6 }), { ...ctx, localHour: 13 });
    expect(keys(r)).toEqual(expect.arrayContaining(['dryAir', 'strongSun']));
    expect(r.level).toBe('medium');
  });

  it('fehlende Werte bleiben neutral', () => {
    const r = rateHour({ timeMs: at(9), temperature: null, humidity: null, windSpeed: null, windGust: null, cloudCover: null, uvIndex: null, precipitation: null, thunderProbability: null, symbol: null }, ctx);
    expect(r).toMatchObject({ points: 0, level: 'good', reasons: [] });
  });

  it('Punkte zu Stufe', () => {
    expect(levelFromPoints(1, false)).toBe('good');
    expect(levelFromPoints(2, false)).toBe('medium');
    expect(levelFromPoints(4, false)).toBe('hard');
    expect(levelFromPoints(0, true)).toBe('hard');
  });
});

describe('Sonne und Tageslicht', () => {
  it('Bern Mitte April: Aufgang ~06:40, Untergang ~20:10 Ortszeit', () => {
    const s = sunTimes(at(12), BERN.lat, BERN.lng)!;
    const local = (ms: number) => new Date(ms + TZ * 60_000).getUTCHours() + new Date(ms + TZ * 60_000).getUTCMinutes() / 60;
    expect(local(s.sunrise)).toBeGreaterThan(6.3);
    expect(local(s.sunrise)).toBeLessThan(7.1);
    expect(local(s.sunset)).toBeGreaterThan(19.8);
    expect(local(s.sunset)).toBeLessThan(20.6);
  });
  it('Nachtstunden sind kein Tageslicht', () => {
    expect(isDaylightHour(at(2), BERN.lat, BERN.lng)).toBe(false);
    expect(isDaylightHour(at(12), BERN.lat, BERN.lng)).toBe(true);
  });
});

describe('recentRain', () => {
  it('summiert die letzten 12 h; ohne Vergangenheit unbekannt', () => {
    const now = at(10);
    expect(recentRain([hour(now)], now)).toBeNull();
    expect(recentRain([hour(now - 2 * HOUR_MS, { precipitation: 0.8 }), hour(now)], now)).toBe(0.8);
    const dryHistory = Array.from({ length: 8 }, (_, i) => hour(now - (i + 1) * HOUR_MS));
    expect(recentRain([...dryHistory, hour(now)], now)).toBe(0);
    expect(recentRain([hour(now - 13 * HOUR_MS, { precipitation: 5 }), hour(now)], now)).toBeNull();
  });
});

describe('findBestWindow', () => {
  const r = (h: number, level: HourRating['level'], points: number, daylight = true): HourRating => ({ timeMs: at(h), level, points, daylight, reasons: [] });

  it('wählt das früheste beste Fenster mit mind. 2 h', () => {
    const rated = [r(10, 'medium', 2), r(11, 'hard', 5), r(12, 'hard', 5), r(13, 'good', 0), r(14, 'good', 0), r(15, 'good', 1), r(16, 'medium', 2)];
    expect(findBestWindow(rated, at(10))).toEqual({ startMs: at(13), endMs: at(16), level: 'good', startsNow: false });
  });
  it('kein Fenster nur aus Einzelstunden oder Nacht', () => {
    expect(findBestWindow([r(10, 'good', 0), r(11, 'hard', 5), r(12, 'good', 0)], at(10))?.level).toBe('hard');
    expect(findBestWindow([r(22, 'good', 0, false), r(23, 'good', 0, false)], at(22))).toBeNull();
  });
  it('erkennt «jetzt»', () => {
    expect(findBestWindow([r(10, 'good', 0), r(11, 'good', 0)], at(10))?.startsNow).toBe(true);
  });
});

describe('rateTrackingWeather', () => {
  it('Szenario Mockup: jetzt windig, am späten Nachmittag gut', () => {
    const hours = Array.from({ length: 14 }, (_, i) => {
      const h = 10 + i;
      const windy = h < 16;
      return hour(at(h), { windSpeed: windy ? 24 : 6, windGust: windy ? 45 : 14 });
    });
    const res = rateTrackingWeather(hours, at(10) + 20 * 60_000, BERN, TZ)!;
    // Wind 24 km/h (+2) und Böen 45 km/h (+1) → mittel
    expect(res.level).toBe('medium');
    expect(res.reasons.map(x => x.key)).toEqual(['windStrong', 'gusts']);
    expect(res.bestWindow).toMatchObject({ startMs: at(16), level: 'good', startsNow: false });
    expect(res.hours).toHaveLength(12);
  });

  it('ohne Daten für die laufende Stunde: keine Bewertung', () => {
    expect(rateTrackingWeather([hour(at(14))], at(10), BERN, TZ)).toBeNull();
    expect(rateTrackingWeather([], at(10), BERN, TZ)).toBeNull();
  });

  it('bei «gut» stehen hilfreiche Gründe vorne', () => {
    const rating = rateHour(hour(at(9), { windSpeed: 3 }), { ...ctx, recentRainMm: 3 });
    expect(pickReasons(rating)[0].key).toBe('wetGround');
  });
});

describe('mergeHourHistory', () => {
  it('behält frühere Stunden bis 24 h, neue Werte haben Vorrang', () => {
    const now = at(12);
    const prev = [hour(now - 30 * HOUR_MS), hour(now - 3 * HOUR_MS, { precipitation: 1 }), hour(now, { temperature: 5 })];
    const merged = mergeHourHistory(prev, [hour(now, { temperature: 9 }), hour(now + HOUR_MS)], now);
    expect(merged.map(h => h.timeMs)).toEqual([now - 3 * HOUR_MS, now, now + HOUR_MS]);
    expect(merged[1].temperature).toBe(9);
  });
});

describe('Beschaffenheit vor Ort (Lege-Screen)', () => {
  it('übersetzt die Lege-Screen-Werte', () => {
    expect(observedGroundFromCondition('Nass')).toBe('wet');
    expect(observedGroundFromCondition('Trocken')).toBe('dry');
    expect(observedGroundFromCondition('Gefroren')).toBe('frozen');
    expect(observedGroundFromCondition('Schnee')).toBe('snow');
    expect(observedGroundFromCondition('Normal')).toBeNull();
    expect(observedGroundFromCondition(null)).toBeNull();
    expect(observedGroundFromCondition('unbekannt')).toBeNull();
  });

  it('ersetzt die Schätzung aus dem Regenverlauf', () => {
    const wetHistory = { ...ctx, recentRainMm: 3 };
    expect(keys(rateHour(hour(at(9)), { ...wetHistory, ground: 'dry' }))).toEqual(expect.arrayContaining(['dryGround']));
    expect(keys(rateHour(hour(at(9)), { ...wetHistory, ground: 'dry' }))).not.toContain('wetGround');
    expect(keys(rateHour(hour(at(9), { cloudCover: 10 }), { ...ctx, recentRainMm: 0, ground: 'wet' }))).toEqual(expect.arrayContaining(['wetGround']));
    expect(keys(rateHour(hour(at(9), { cloudCover: 10 }), { ...ctx, recentRainMm: 0, ground: 'wet' }))).not.toContain('dryGround');
  });

  it('gefrorener Boden erschwert, Schnee bleibt neutral', () => {
    const frozen = rateHour(hour(at(9)), { ...ctx, ground: 'frozen' });
    expect(keys(frozen)).toContain('frozenGround');
    expect(frozen.level).toBe('medium');
    const snow = rateHour(hour(at(9)), { ...ctx, recentRainMm: 3, ground: 'snow' });
    expect(snow.reasons.some(r => r.key === 'wetGround' || r.key === 'dryGround' || r.key === 'frozenGround')).toBe(false);
  });

  it('gilt nur für die nächsten Stunden, nicht für den ganzen Tag', () => {
    const hours = Array.from({ length: 10 }, (_, i) => hour(at(9 + i)));
    const res = rateTrackingWeather(hours, at(9), BERN, TZ, 'frozen')!;
    expect(res.level).toBe('medium');
    expect(res.hours.filter(h => h.reasons.some(r => r.key === 'frozenGround'))).toHaveLength(OBSERVED_GROUND_HOURS);
    expect(res.reasons.map(r => r.key)).toContain('frozenGround');
    // ohne Beobachtung unverändert
    expect(rateTrackingWeather(hours, at(9), BERN, TZ)!.level).toBe('good');
  });
});
