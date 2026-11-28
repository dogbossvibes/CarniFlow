import { rateTrainingHour, rateTrainingWeather } from '../trainingModel';
import { doesTracking } from '../trackingDogs';
import type { WeatherHour } from '../model';

const H = 3_600_000;
const base: WeatherHour = {
  timeMs: Date.UTC(2026, 3, 15, 8), temperature: 14, humidity: 70, windSpeed: 8, windGust: 15,
  cloudCover: 70, uvIndex: 2, precipitation: 0, thunderProbability: null, symbol: 'cloudy',
};
const day = { localHour: 10, daylight: true };
const keys = (h: Partial<WeatherHour>, ctx = day) => rateTrainingHour({ ...base, ...h }, ctx).reasons.map(r => r.key);

describe('Trainingswetter: Stunde', () => {
  it('mild und trocken → gut, mit hilfreichen Gründen', () => {
    const r = rateTrainingHour(base, day);
    expect(r.level).toBe('good');
    expect(r.reasons.map(x => x.key)).toEqual(expect.arrayContaining(['tMild', 'tDry']));
  });
  it('Hitze, Gewitter und Sturm sind hart', () => {
    expect(rateTrainingHour({ ...base, temperature: 30 }, day).level).toBe('hard');
    expect(rateTrainingHour({ ...base, symbol: 'rainandthunder' }, day).level).toBe('hard');
    expect(rateTrainingHour({ ...base, windGust: 70 }, day).level).toBe('hard');
  });
  it('warm mit Mittagssonne: Pfoten-Hinweis, mittel', () => {
    const r = rateTrainingHour({ ...base, temperature: 26, cloudCover: 10, uvIndex: 7 }, { localHour: 13, daylight: true });
    expect(r.reasons.map(x => x.key)).toEqual(expect.arrayContaining(['tWarm', 'tHotPaws', 'tSun']));
    expect(r.level).toBe('hard'); // 2 + 1 + 1 Punkte
    expect(rateTrainingHour({ ...base, temperature: 23 }, day).level).toBe('good');
  });
  it('Wind stört das Training weniger als die Fährte', () => {
    expect(rateTrainingHour({ ...base, windSpeed: 25, windGust: 40 }, day).level).toBe('good');
    expect(keys({ windSpeed: 45 })).toContain('tWind');
  });
  it('fehlende Werte zählen nicht', () => {
    const r = rateTrainingHour({ ...base, temperature: null, precipitation: null, windSpeed: null, windGust: null, uvIndex: null, cloudCover: null }, day);
    expect(r.level).toBe('good');
    expect(r.reasons).toEqual([]);
  });
  it('Regen: leicht → mittel erst zusammen mit anderem', () => {
    expect(keys({ precipitation: 2 })).toContain('tRain');
    expect(rateTrainingHour({ ...base, precipitation: 6 }, day).level).toBe('medium');
  });
});

describe('Trainingswetter: Gesamt', () => {
  const now = Date.UTC(2026, 3, 15, 6, 10); // 08:10 MESZ
  const hours = Array.from({ length: 72 }, (_, i) => ({ ...base, timeMs: Date.UTC(2026, 3, 15, 6) + i * H }));
  it('liefert jetzt, Fenster und Tage', () => {
    const r = rateTrainingWeather(hours, now, { lat: 46.95, lng: 7.44 }, 120);
    expect(r?.level).toBe('good');
    expect(r?.bestWindow?.startsNow).toBe(true);
    expect(r?.days.map(d => d.offset)).toEqual([0, 1, 2]);
  });
  it('ohne Daten für jetzt → null', () => {
    expect(rateTrainingWeather(hours.slice(5), now, { lat: 46.95, lng: 7.44 }, 120)).toBeNull();
  });
});

describe('Fährten-Teil nur bei Fährtenhunden', () => {
  const now = Date.UTC(2026, 10, 28);
  it('Profil-Sparte oder Titel', () => {
    expect(doesTracking([{ discipline: 'IGP', titles: null }], [], now)).toBe(true);
    expect(doesTracking([{ discipline: null, titles: ['FH 2'] }], [], now)).toBe(true);
    expect(doesTracking([{ discipline: 'Obedience', titles: ['BH'] }], [], now)).toBe(false);
  });
  it('Fährte oder Fährten-Übung in den letzten 90 Tagen', () => {
    expect(doesTracking([], [{ source: 'track', session_date: '2026-11-01' }], now)).toBe(true);
    expect(doesTracking([], [{ source: 'session', session_date: '2026-11-20', exercises: [{ discipline: 'Fährte' }] }], now)).toBe(true);
    expect(doesTracking([], [{ source: 'track', session_date: '2026-05-01' }], now)).toBe(false);
    expect(doesTracking([], [{ source: 'session', session_date: 'kaputt' }], now)).toBe(false);
  });
});
