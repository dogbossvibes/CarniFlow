// Kunden-Fährtendiagnose (rein): Zusammenfassung nur aus vorhandenen Werten, Export aus
// gespeicherten Daten ohne Live-Mitschnitt, Datenschutz wie der bestehende Support-Export.
import {
  buildCustomerDiagnosisSummary, buildPersistedSupportExport, formatDiagnosisValue, layPointsFromDetail, markersFromDetail, runFromDetail,
} from '@/features/tracking/utils/customerTrackDiagnosis';
import { translate, type AppLocale } from '@/i18n';
import type { TranslationKey } from '@/i18n/de-CH';
import { assertSupportPrivacy } from '@/features/tracking/utils/supportDiagnostics';


jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const T0 = Date.parse('2026-10-04T08:00:00.000Z');
const lay = (n = 5, acc = 4) => Array.from({ length: n }, (_, i) => ({
  latitude: 47.3 + i * 1e-4, longitude: 8.5, accuracy: acc, point_type: 'lay', timestamp: new Date(T0 + i * 1000).toISOString(),
}));
const markers = [
  { id: '11111111-2222-3333-4444-555555555555', marker_type: 'winkel', angle_kind: 'rechts', latitude: 47.3002, longitude: 8.5, distance_from_start: 22, created_at: new Date(T0 + 2000).toISOString() },
  { id: 'aaaaaaaa-2222-3333-4444-555555555555', marker_type: 'gegenstand', material: 'holz', latitude: 47.3004, longitude: 8.5, distance_from_start: 44, created_at: new Date(T0 + 4000).toISOString() },
];
const layOnly = (over: Record<string, unknown> = {}) => ({
  id: '99999999-2222-3333-4444-555555555555', user_id: 'user-uuid', dog_id: 'dog-uuid', status: 'completed',
  distance_meters: 48.4, corners_total: 1, articles_total: 1, points: lay(), markers, runs: [], track_data: {}, ...over,
});
const searched = (over: Record<string, unknown> = {}) => layOnly({
  articles_found: 1,
  runs: [{ id: 'run-uuid', duration_seconds: 125, distance_meters: 51, average_deviation_meters: 1.24, run_points: [
    { lat: 47.3, lng: 8.50001, t: T0 + 60_000 }, { lat: 47.3002, lng: 8.50001, t: T0 + 61_000 }, { lat: 47.3004, lng: 8.50001, t: T0 + 62_000 },
  ] }],
  track_data: { run: { analytics: { version: 3 }, total_objects: 1, started_at: '2026-10-04T08:01:00Z' } },
  ...over,
});
// Werte werden wie in der UI übersetzt (Standard: Deutsch).
const tFor = (locale: AppLocale) => (k: TranslationKey, p?: Record<string, string | number>) => translate(k, p, locale);
const row = (s: ReturnType<typeof buildCustomerDiagnosisSummary>, key: string, locale: AppLocale = 'de') => {
  const r = s.rows.find(x => x.key === key);
  return r ? formatDiagnosisValue(r.value, tFor(locale)) : undefined;
};
const label = (s: ReturnType<typeof buildCustomerDiagnosisSummary>, key: string, locale: AppLocale = 'de') => {
  const r = s.rows.find(x => x.key === key);
  return r ? translate(r.labelKey, undefined, locale) : undefined;
};

describe('buildCustomerDiagnosisSummary', () => {
  it('Lay-only: GPS-Qualität, Strecke, Winkel, Gegenstände, „Noch nicht abgesucht" — keine Suchzeilen', () => {
    const s = buildCustomerDiagnosisSummary(layOnly());
    expect(s.kind).toBe('lay_only');
    expect(s.hasLayGeometry).toBe(true);
    expect(row(s, 'gps')).toBe('Gut · ±4 m');
    expect(label(s, 'gps')).toBe('GPS-Qualität beim Legen');
    expect(row(s, 'distance')).toBe('48 m');
    expect(row(s, 'corners')).toBe('1');
    expect(row(s, 'objects')).toBe('1');
    expect(row(s, 'search')).toBe('Noch nicht abgesucht');
    for (const k of ['searchDuration', 'searchTrack', 'deviation', 'analysis']) expect(row(s, k)).toBeUndefined();
  });
  it('Search-Track: Suchdauer, Suchspur, Funde, Abweichung, Detailanalyse', () => {
    const s = buildCustomerDiagnosisSummary(searched());
    expect(s.kind).toBe('searched');
    expect(row(s, 'search')).toBe('Abgesucht');
    expect(row(s, 'searchDuration')).toBe('2:05 min');
    expect(row(s, 'searchTrack')).toBe('Aufgezeichnet · 3 Punkte');
    expect(row(s, 'objects')).toBe('1 von 1 gefunden');
    expect(row(s, 'deviation')).toBe('1.2 m');
    expect(row(s, 'analysis')).toBe('Vorhanden');
  });
  it('fehlende optionale Felder: kein Crash, keine erfundenen Werte', () => {
    const s = buildCustomerDiagnosisSummary({ points: [], markers: [], runs: [{ run_points: [] }] });
    expect(s.hasLayGeometry).toBe(false);
    expect(row(s, 'gps')).toBeUndefined();
    expect(row(s, 'distance')).toBeUndefined();
    expect(row(s, 'searchDuration')).toBeUndefined();
    expect(row(s, 'searchTrack')).toBe('Keine verwertbare Suchspur');
    expect(row(s, 'analysis')).toBe('Nicht vorhanden');
    expect(() => buildCustomerDiagnosisSummary(null)).not.toThrow();
    expect(buildCustomerDiagnosisSummary(undefined).rows.map(r => r.key)).toEqual(['search']);
  });
  it('Suchpunkte (point_type search) zählen nicht als gelegte Punkte', () => {
    const d = layOnly({ points: [...lay(2), { latitude: 1, longitude: 1, point_type: 'search', accuracy: 50, timestamp: T0 }] });
    expect(layPointsFromDetail(d)).toHaveLength(2);
    expect(row(buildCustomerDiagnosisSummary(d), 'layPoints')).toBe('2');
  });
});

describe('buildPersistedSupportExport', () => {
  it('Lay-only: relativer Export, als persisted markiert, ohne Suche', () => {
    const d = layOnly();
    const e = buildPersistedSupportExport({ layPoints: layPointsFromDetail(d), markers: markersFromDetail(d), run: runFromDetail(d) })!;
    expect(e.exportType).toBe('support');
    expect(e.diagnosticsSource).toBe('persisted');
    expect(e.pointCount).toBe(5);
    expect(e.points[0]).toMatchObject({ x: 0, y: 0, tMs: 0 });
    expect(e.markers.map(m => m.type)).toEqual(['winkel', 'gegenstand']);
    expect(e.persistedSearch).toBeUndefined();
    expect(e.qaCaptureAvailable).toBe(false);
    expect('searchDiagnostics' in e).toBe(false);
  });
  it('Search-Track: Suchspur relativ zum ersten gelegten Punkt, Zeit relativ zum ersten Suchpunkt, nur Zahlen', () => {
    const d = searched();
    const e = buildPersistedSupportExport({ layPoints: layPointsFromDetail(d), markers: markersFromDetail(d), run: runFromDetail(d) })!;
    expect(e.persistedSearch).toMatchObject({ pointCount: 3, durationS: 125, distanceM: 51, articlesFound: 1, totalObjects: 1, averageDeviationM: 1.24 });
    expect(e.persistedSearch!.points.map(p => p.tMs)).toEqual([0, 1000, 2000]);
    expect(e.persistedSearch!.points[0].y).toBe(0);
    expect(Math.abs(e.persistedSearch!.points[0].x)).toBeLessThan(1);
  });
  it('Datenschutz: keine Koordinaten, IDs, Daten, Namen, absoluten Zeiten im Payload', () => {
    const d = searched({ dog: { name: 'Amoun' } });
    const e = buildPersistedSupportExport({ layPoints: layPointsFromDetail(d), markers: markersFromDetail(d), run: runFromDetail(d) })!;
    const json = JSON.stringify(e);
    expect(() => assertSupportPrivacy(JSON.parse(json))).not.toThrow();
    for (const bad of ['user-uuid', 'dog-uuid', 'run-uuid', '99999999', '11111111', 'Amoun', '2026-10-04', 'latitude', 'longitude', '"lat"', '"lng"', String(T0)]) {
      expect(json).not.toContain(bad);
    }
  });
  it('weniger als 2 gültige gelegte Punkte → null (nichts erfinden)', () => {
    expect(buildPersistedSupportExport({ layPoints: [], markers: [], run: null })).toBeNull();
    expect(buildPersistedSupportExport({ layPoints: layPointsFromDetail(layOnly({ points: lay(1) })), markers: [], run: null })).toBeNull();
  });
  it('Suchpunkte ohne Zeit → tMs null statt geraten', () => {
    const d = searched({ runs: [{ duration_seconds: 10, run_points: [{ lat: 47.3, lng: 8.5 }, { lat: 47.3001, lng: 8.5 }] }] });
    const e = buildPersistedSupportExport({ layPoints: layPointsFromDetail(d), markers: [], run: runFromDetail(d) })!;
    expect(e.persistedSearch!.points.map(p => p.tMs)).toEqual([null, null]);
  });
});

describe('Übersetzung der Zusammenfassung (alle App-Sprachen)', () => {
  const EXPECT: Record<AppLocale, { gpsLabel: string; gps: string; objects: string; search: string; track: string }> = {
    de:  { gpsLabel: 'GPS-Qualität beim Legen', gps: 'Gut · ±4 m', objects: '1 von 1 gefunden', search: 'Abgesucht', track: 'Aufgezeichnet · 3 Punkte' },
    gsw: { gpsLabel: 'GPS-Qualität bim Lege', gps: 'Guet · ±4 m', objects: '1 vo 1 gfunde', search: 'Abgsuecht', track: 'Ufzeichnet · 3 Pünkt' },
    en:  { gpsLabel: 'GPS quality while laying', gps: 'Good · ±4 m', objects: '1 of 1 found', search: 'Searched', track: 'Recorded · 3 points' },
    fr:  { gpsLabel: 'Qualité GPS lors de la pose', gps: 'Bon · ±4 m', objects: '1 sur 1 trouvés', search: 'Recherchée', track: 'Enregistrée · 3 points' },
    it:  { gpsLabel: 'Qualità GPS durante la posa', gps: 'Buono · ±4 m', objects: '1 di 1 trovati', search: 'Ricercata', track: 'Registrata · 3 punti' },
  };
  it.each(Object.keys(EXPECT) as AppLocale[])('%s: Labels und Werte übersetzt, keine rohen Keys', locale => {
    const s = buildCustomerDiagnosisSummary(searched());
    const e = EXPECT[locale];
    expect(label(s, 'gps', locale)).toBe(e.gpsLabel);
    expect(row(s, 'gps', locale)).toBe(e.gps);
    expect(row(s, 'objects', locale)).toBe(e.objects);
    expect(row(s, 'search', locale)).toBe(e.search);
    expect(row(s, 'searchTrack', locale)).toBe(e.track);
    for (const r of s.rows) {
      expect(translate(r.labelKey, undefined, locale)).not.toMatch(/^track\./);
      expect(formatDiagnosisValue(r.value, tFor(locale))).not.toMatch(/track\.|\{\w+\}/);
    }
  });
});
