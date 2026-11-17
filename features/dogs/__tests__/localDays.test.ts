import { relDate } from '@/features/tracking/components/FaehrtenChrome';
import { localDayKey, parseDay } from '@/features/dogs/dateInput';
import { dayStreak } from '@/features/tracking/utils/trackScore';
import { computeUnitStats } from '@/services/trainingUnitStats';

// Läuft unter TZ=Europe/Zurich (jest.config) bzw. wird hier zeitzonen-unabhängig formuliert:
// erwartet wird immer der LOKALE Kalendertag des Zeitstempels.
const localIso = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).toISOString();
const pad = (n: number) => String(n).padStart(2, '0');
const day = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

describe('localDayKey', () => {
  it('reines Datum bleibt unverändert', () => {
    expect(localDayKey('2026-11-17')).toBe('2026-11-17');
  });
  it('Zeitstempel kurz nach Mitternacht zählt zum lokalen Tag, nicht zum UTC-Vortag', () => {
    expect(localDayKey(localIso(2026, 11, 17, 0, 30))).toBe('2026-11-17');
    expect(localDayKey(localIso(2026, 7, 1, 1, 30))).toBe('2026-07-01');
  });
  it('ungültig oder leer → null, wirft nie', () => {
    expect(localDayKey(null)).toBeNull();
    expect(localDayKey('')).toBeNull();
    expect(localDayKey('kein datum')).toBeNull();
  });
});

describe('parseDay', () => {
  it('liest ein reines Datum als lokalen Tag (nicht UTC-Mitternacht)', () => {
    const d = parseDay('2026-03-01');
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 2, 1]);
  });
  it('fällt bei anderen Formaten auf new Date zurück', () => {
    expect(parseDay('2026-03-01T10:00:00.000Z').getTime()).toBe(Date.parse('2026-03-01T10:00:00.000Z'));
  });
});

describe('dayStreak (Fährten)', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 10, 17, 0, 30)); });
  afterEach(() => { jest.useRealTimers(); });
  it('Fährte heute um 00:20 zählt für heute', () => {
    expect(dayStreak([localIso(2026, 11, 17, 0, 20)])).toBe(1);
  });
  it('mehrere Tage am Stück, gemischt reines Datum und Zeitstempel', () => {
    expect(dayStreak([localIso(2026, 11, 17, 0, 10), '2026-11-16', localIso(2026, 11, 15, 23, 50)])).toBe(3);
  });
});

describe('Wochenstatistik über die Zeitumstellung', () => {
  afterEach(() => { jest.useRealTimers(); });
  it('Einheit am Montag nach der Frühlingsumstellung zählt genau einmal, in ihrer Woche', () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 3, 1, 12)); // 1. April 2026
    // Umstellung: So 29.3.2026. Montag danach: 30.3.2026.
    const unit = { session_date: '2026-03-30', duration_sec: 600 } as never;
    const stats = computeUnitStats([unit]);
    const total = stats.weekly.reduce((a, w) => a + w.count, 0);
    expect(total).toBe(1);
    expect(stats.weekly[stats.weekly.length - 1].count).toBe(1);
  });
  it('Einheit am Sonntag der Umstellung zählt in die Woche davor', () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 3, 1, 12));
    const stats = computeUnitStats([{ session_date: '2026-03-29', duration_sec: 600 } as never]);
    expect(stats.weekly[stats.weekly.length - 2].count).toBe(1);
    expect(stats.weekly.reduce((a, w) => a + w.count, 0)).toBe(1);
  });
  it('day() Hilfe ist konsistent', () => { expect(day(new Date(2026, 0, 2))).toBe('2026-01-02'); });
});

describe('relDate (Fährten-Liste)', () => {
  afterEach(() => jest.useRealTimers());
  it('zeigt ein reines Datum von heute als «Heute», unabhängig von der Zeitzone', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 10, 18, 0, 30));
    expect(relDate('2026-11-18')).toBe('Heute');
    expect(relDate('2026-11-17')).toBe('Gestern');
  });
});
