import { getDiscipline, DISCIPLINES } from '@/constants/disciplines';
import { ALLE_SPARTEN } from '@/constants/sparten';
import {
  corridorStats, distanceToPolylineM, emptyMantrailData, isMantrailSession, mantrailStats, MANTRAIL_CATEGORY,
  MANTRAIL_CORRIDOR_M, parseMantrailData, pathLengthM, trailAgeMinutes, type MantrailData,
} from '../model';

const data = (over: Partial<MantrailData> = {}): MantrailData => ({ ...emptyMantrailData(), ...over });

describe('Sparte Mantrailing', () => {
  it('ist eine eigene Sparte mit dem Label aus «Meine Sparten»', () => {
    const d = getDiscipline('mantrailing')!;
    expect(d.label).toBe(MANTRAIL_CATEGORY);
    expect(ALLE_SPARTEN.some(s => s.label === d.label)).toBe(true);
    expect(d.exercises[d.exercises.length - 1]).toBe('Eigene Übung');
    expect(d.exercises).toEqual(expect.arrayContaining(['Negativtrail', 'Doppelblind']));
  });
  it('ändert keine bestehende Sparte, «Eigene Kategorie» bleibt zuletzt', () => {
    expect(DISCIPLINES.map(x => x.key)).toEqual(['faehrte', 'unterordnung', 'schutzdienst', 'obedience', 'agility', 'rally', 'mondioring', 'mantrailing', 'eigene']);
    expect(getDiscipline('faehrte')!.label).toBe('Fährte');
  });
});

describe('Angaben lesen', () => {
  it('liest vollständige Angaben', () => {
    const d = data({ trailAgeMinutes: 130, scentArticle: 'sock', environment: 'residential', doubleBlind: true, result: 'found',
      windLay: { fromDeg: 225, speedKmh: 12, source: 'weather' }, trailSource: 'transfer' });
    expect(parseMantrailData(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('verwirft Unbekanntes und unpassende Ergebnisse', () => {
    expect(parseMantrailData(null)).toBeNull();
    expect(parseMantrailData({ version: 2 })).toBeNull();
    const odd = parseMantrailData({ version: 1, scentArticle: 'hut', environment: 'mond', trailAgeMinutes: -5, result: 'found', negative: true, trailSource: 'x' })!;
    expect(odd).toMatchObject({ scentArticle: null, environment: null, trailAgeMinutes: null, result: null, trailSource: 'none' });
    expect(parseMantrailData({ version: 1, result: 'negative_correct' })!.result).toBeNull();   // ohne Negativtrail
    expect(parseMantrailData({ version: 1, negative: true, result: 'negative_correct' })!.result).toBe('negative_correct');
    expect(parseMantrailData({ version: 1, windLay: { fromDeg: 400, speedKmh: 10 } })!.windLay).toEqual({ fromDeg: null, speedKmh: 10, source: 'weather' });
  });
});

describe('Trail-Alter', () => {
  it('Ende Trailer → Start Hund in Minuten', () => {
    expect(trailAgeMinutes(0, 130 * 60000)).toBe(130);
    expect(trailAgeMinutes(10, 5)).toBeNull();
    expect(trailAgeMinutes(null, 5)).toBeNull();
    expect(trailAgeMinutes(0, 15 * 24 * 3600000)).toBeNull();
  });
});

describe('Typ-Trennung', () => {
  it('nur type = mantrail ist Mantrailing', () => {
    expect(isMantrailSession({ type: 'mantrail' })).toBe(true);
    expect(isMantrailSession({ type: 'track' })).toBe(false);
    expect(isMantrailSession(null)).toBe(false);
  });
});

describe('Korridor-Auswertung (fest 25 m)', () => {
  // Gerade Trailer-Spur nach Osten; 1e-4° Länge ≈ 7.6 m auf 47° Breite.
  const trailer = Array.from({ length: 11 }, (_, i) => ({ lat: 47, lng: 7 + i * 1e-4 }));
  it('Abstand Punkt → Linie', () => {
    expect(distanceToPolylineM({ lat: 47, lng: 7.0005 }, trailer)!).toBeLessThan(0.5);
    const north = distanceToPolylineM({ lat: 47.0002, lng: 7.0005 }, trailer)!;
    expect(north).toBeGreaterThan(21); expect(north).toBeLessThan(23.5);
    expect(distanceToPolylineM({ lat: 47, lng: 7 }, [])).toBeNull();
  });
  it('Anteil in der Nähe und grösste Abweichung', () => {
    const dog = [
      ...trailer.slice(0, 6),
      { lat: 47.0004, lng: 7.0006 },   // ≈ 44 m daneben
      ...trailer.slice(7),
    ];
    const st = corridorStats(dog, trailer);
    expect(MANTRAIL_CORRIDOR_M).toBe(25);
    expect(st.nearShare).toBeCloseTo(10 / 11, 2);
    expect(st.maxDeviationM).toBeGreaterThan(40);
    expect(st.trailerLengthM).toBe(Math.round(pathLengthM(trailer)));
  });
  it('ohne Trailer-Spur: nur Länge, keine Quote', () => {
    expect(corridorStats(trailer, null)).toMatchObject({ nearShare: null, maxDeviationM: null, trailerLengthM: null });
    expect(corridorStats(trailer, null).dogLengthM).toBeGreaterThan(70);
  });
});

describe('Statistik', () => {
  it('Fundquote ohne Negativtrails, Negativ-Trefferquote getrennt', () => {
    const st = mantrailStats([
      { data: data({ result: 'found', trailAgeMinutes: 60, environment: 'city' }), lengthM: 800 },
      { data: data({ result: 'not_found', trailAgeMinutes: 180, environment: 'city' }), lengthM: 1200 },
      { data: data({ result: 'found', trailAgeMinutes: 30, environment: 'forest' }), lengthM: 400 },
      { data: data({ negative: true, result: 'negative_correct' }), lengthM: 300 },
      { data: data({ negative: true, result: 'negative_false' }), lengthM: 200 },
      { data: data({ result: null }), lengthM: null },
      { data: data({ result: 'found' }), lengthM: 5000, deleted: true },
    ]);
    expect(st).toEqual({
      trails: 6, foundRate: 0.67, negativeCorrectRate: 0.5, avgAgeMinutes: 90, maxAgeMinutes: 180, longestM: 1200,
      byEnvironment: { city: 2, forest: 1 },
    });
  });
  it('leer', () => {
    expect(mantrailStats([])).toMatchObject({ trails: 0, foundRate: null, negativeCorrectRate: null, longestM: null });
  });
});

describe('Übergabe im Gruppentraining (PR B2)', () => {
  it('gibt nur Angaben der Leger:in weiter, nie Ergebnis, Anzeige oder Doppelblind', () => {
    const { sharedTrailDetails, parseSharedTrailDetails, emptyMantrailData } = jest.requireActual<typeof import('../model')>('../model');
    const full = { ...emptyMantrailData(), scentArticle: 'gauze' as const, environment: 'city' as const, negative: true,
      result: 'found' as const, indication: 'Hinsetzen', doubleBlind: true, revealedEarly: true, trailAgeMinutes: 90 };
    const shared = sharedTrailDetails(full)!;
    expect(Object.keys(shared).sort()).toEqual(['environment', 'negative', 'scentArticle', 'scentArticleLabel', 'scentContaminated', 'surface', 'version', 'windLay']);
    expect(parseSharedTrailDetails(JSON.parse(JSON.stringify(shared)))).toEqual(shared);
    expect(parseSharedTrailDetails({ version: 2, negative: true })).toBeNull();
    expect(parseSharedTrailDetails({ version: 1, scentArticle: 'bomb', negative: 'yes' })).toMatchObject({ scentArticle: null, negative: false });
    expect(sharedTrailDetails(null)).toBeNull();
  });
});
