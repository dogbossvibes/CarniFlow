// Support-Diagnose für normale Kunden: Format, Privacy, Persistenz/Retention, Share.
// Datenfluss nur Production → Diagnose; die Recorder-Identität (Capture an ≡ aus) prüft
// hooks/__tests__/useSearchRecorder.qaTelemetry.test.tsx.
import * as fs from 'fs';
import * as path from 'path';
import {
  buildSearchDiagnostics, saveQaSearchCapture, loadQaSearchCapture, hasQaSearchCapture, QA_SEARCH_RETENTION,
  type SearchQaTelemetry, type QaSearchDiagnostics,
} from '@/features/tracking/utils/qaSearchCapture';
import {
  assertSupportPrivacy, buildSupportExport, isUsableSupportCapture, serializeSupportExport, supportExportFileName,
  toSupportCapture, SUPPORT_FORBIDDEN_KEYS, isSupportCaptureEnabled, type SupportExport,
} from '@/features/tracking/utils/supportDiagnostics';
import { assertNoAbsoluteData, type RawLayPoint, type RawTrackMarker } from '@/features/tracking/utils/qaTrackExport';
import { buildExportForSession } from '@/features/tracking/services/qaTrackExportService';
import { shareSupportDiagnostics, hasSupportDiagnostics, buildSupportExportForSession } from '@/features/tracking/services/supportDiagnosticsService';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Lokale Datenbank (nur Lesen) — absolute Lay-Daten, damit die Anonymisierung bewiesen wird.
const M = 111320, LAT0 = 47.37, LNG0 = 8.54, M_LNG = M * Math.cos((LAT0 * Math.PI) / 180);
const T0 = 1_780_000_000_000;
const mockLay: RawLayPoint[] = Array.from({ length: 8 }, (_, i) => ({
  latitude: LAT0 + (i * 1.2) / M, longitude: LNG0 + (i * 0.4) / M_LNG, accuracy: 3.5 + i * 0.1, timestamp: new Date(T0 + i * 2000).toISOString(),
}));
const mockMarkers: RawTrackMarker[] = [
  { local_id: 'marker-secret-1', marker_type: 'winkel', angle_kind: 'rechts', latitude: LAT0 + 4 / M, longitude: LNG0 + 1 / M_LNG, distance_from_start: 4.2, created_at: new Date(T0 + 5000).toISOString() },
];
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getLayTrackPointsBySession: jest.fn(async () => mockLay),
  getTrackMarkersBySession: jest.fn(async () => mockMarkers),
}));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ getLocalTrainingSessions: jest.fn(async () => []) }));

// Native Share-Sheet + Datei (Cache-Verzeichnis).
const mockShareAsync = jest.fn(async () => undefined);
const mockIsAvailableAsync = jest.fn(async () => true);
jest.mock('expo-sharing', () => ({ isAvailableAsync: () => mockIsAvailableAsync(), shareAsync: (...a: unknown[]) => (mockShareAsync as any)(...a) }));
const mockWritten: Record<string, string> = {};
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/', documentDirectory: 'file:///docs/',
  writeAsStringAsync: async (uri: string, content: string) => { mockWritten[uri] = content; },
}));

const FIXDIR = path.join(__dirname, 'fixtures', 'fieldV62');
const ll = (x: number, y: number) => ({ latitude: LAT0 + y / M, longitude: LNG0 + x / M_LNG });

/** Search-Diagnose aus dem echten (reduzierten) V6.2-Feldlauf, mit Accuracy je Fix. */
function diagFromField(name: 'F1' | 'F2', accuracy = 4.37): QaSearchDiagnostics {
  const j = JSON.parse(fs.readFileSync(path.join(FIXDIR, `V6.2-${name}-01.json`), 'utf8'));
  const g = j.search.geometry;
  const keep = new Set(g.filtered.map((f: any) => f.tSec));
  const toLL = (p: { x: number; y: number }) => ll(p.x, p.y);
  const tel: SearchQaTelemetry = {
    captureLevel: 'support', startedAtMs: T0, resumed: false,
    raw: g.raw.map((p: any) => ({ lat: toLL(p).latitude, lng: toLL(p).longitude, accuracy: keep.has(p.tSec) ? accuracy : 61.2, t: T0 + p.tSec * 1000, accepted: keep.has(p.tSec), reason: keep.has(p.tSec) ? null : 'accuracy' })),
    filtered: g.filtered.map((p: any) => ({ lat: toLL(p).latitude, lng: toLL(p).longitude, tSec: p.tSec })),
    display: [], cursorSamples: [], objectApproach: [], minDistToEndM: null, progressAtMinEndM: null, truncated: { raw: false, cursor: false },
  };
  return buildSearchDiagnostics({
    origin: ll(0, 0), telemetry: tel, resumed: false, analyticsSampleCount: 0, laid: { total: 27, end: null }, objects: [], cornerAtM: [],
    end: { fired: null, hapticFired: null, voiceFired: null }, manualStopTSec: 50,
    run: { points: g.run.map(toLL), pointsTimeSec: g.run.map((p: any) => p.tSec) },
    replay: { points: g.replay.map(toLL), timeSec: g.replay.map((p: any) => p.tSec) },
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const k of Object.keys(mockWritten)) delete mockWritten[k];
  mockShareAsync.mockClear(); mockIsAvailableAsync.mockClear(); mockIsAvailableAsync.mockImplementation(async () => true);
});

describe('Capture-Schalter', () => {
  it('Support-Capture ist standardmässig AN — kein Entwickler-Schalter nötig', () => {
    expect(isSupportCaptureEnabled()).toBe(true);
  });
});

describe('Privacy', () => {
  const KEYS = ['latitude', 'longitude', 'lat', 'lon', 'lng', 'email', 'userId', 'accountId', 'ownerId', 'sessionId', 'accessToken', 'refreshToken', 'deviceId', 'pushToken'];
  it.each(KEYS)('verbotener Schlüssel %s wird abgelehnt (auch verschachtelt und als snake_case)', key => {
    expect(() => assertSupportPrivacy({ a: { b: [{ [key]: 'x' }] } })).toThrow();
    expect(() => assertSupportPrivacy({ [key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`)]: 'x' })).toThrow();
  });
  it('alle in der Vorgabe genannten Schlüssel sind in der Verbotsliste', () => {
    for (const k of KEYS) expect(SUPPORT_FORBIDDEN_KEYS).toContain(k.toLowerCase().replace(/_/g, ''));
  });
  it('ISO-Datum, Epoch-Zeitstempel, E-Mail und UUID werden abgelehnt', () => {
    expect(() => assertSupportPrivacy({ s: '2026-10-04T10:00:00Z' })).toThrow();
    expect(() => assertSupportPrivacy({ n: 1_780_000_000_000 })).toThrow();
    expect(() => assertSupportPrivacy({ s: 'hund@example.com' })).toThrow();
    expect(() => assertSupportPrivacy({ s: '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d' })).toThrow();
  });
  it.each(['F1', 'F2'] as const)('der Export des echten V6.2-%s-Laufs ist anonym: relative Werte, keine Schlüssel/IDs/Zeiten', name => {
    const exp = buildSupportExport(mockLay, mockMarkers, diagFromField(name));
    expect(() => assertSupportPrivacy(exp)).not.toThrow();
    expect(() => assertNoAbsoluteData({ ...exp, sessionId: 'x' } as any)).not.toThrow();
    const json = serializeSupportExport(exp);
    for (const forbidden of ['latitude', 'longitude', '"lat"', '"lon"', '"lng"', 'sessionId', 'email', 'userId', 'accountId', 'ownerId', 'accessToken', 'refreshToken', 'deviceId', 'pushToken', 'marker-secret-1', String(T0), new Date(T0).toISOString().slice(0, 10)])
      expect(json).not.toContain(forbidden);
    expect(Object.keys(exp)).not.toContain('sessionId');
  });
});

describe('Format', () => {
  it('exportType support, bestehendes Schema (2.8 durch Accuracy-Felder), Lay-Punkte relativ zum Start', () => {
    const exp = buildSupportExport(mockLay, mockMarkers, diagFromField('F2'));
    expect(exp.exportType).toBe('support');
    expect(exp.schemaVersion).toBe(2);
    expect(exp.schemaMinor).toBe(8);
    expect(exp.points[0]).toMatchObject({ x: 0, y: 0, tMs: 0 });
    expect(Math.max(...exp.points.map(p => Math.abs(p.x) + Math.abs(p.y)))).toBeLessThan(100);
  });
  it('Accuracy je Fix: accepted und rejected, mit Ablehnungsgrund', () => {
    const exp = buildSupportExport(mockLay, mockMarkers, diagFromField('F2', 4.37));
    const raw = exp.searchDiagnostics!.geometry.raw;
    expect(raw.filter(p => p.accepted).every(p => p.accuracyM === 4.37)).toBe(true);
    const rejected = raw.filter(p => !p.accepted);
    expect(rejected.length).toBe(5);
    expect(rejected.every(p => p.accuracyM === 61.2 && p.rejectReason === 'accuracy')).toBe(true);
  });
  it('toSupportCapture entfernt nur QA-only UX-Diagnosen; Geometrie, Accuracy und Summary bleiben', () => {
    const d = { ...diagFromField('F2'), voiceDiagnostics: { events: [] }, endEligibilityDiagnostics: { samples: [] }, objectDwellDiagnostics: { candidates: [] } } as unknown as QaSearchDiagnostics;
    const s = toSupportCapture(d) as unknown as Record<string, unknown>;
    for (const k of ['voiceDiagnostics', 'startApproachDiagnostics', 'approachFixDiagnostics', 'endEligibilityDiagnostics', 'endConfirmationDiagnostics', 'objectDwellDiagnostics']) expect(s).not.toHaveProperty(k);
    expect(s.geometry).toEqual(d.geometry);
    expect(s.rawSearchPointCount).toBe(d.rawSearchPointCount);
    expect(d).toHaveProperty('voiceDiagnostics');             // Eingabe unverändert
  });
  it('Dateiname neutral: nur Datum, keine Namen/IDs', () => {
    expect(supportExportFileName(new Date(2026, 9, 4))).toBe('ANYVO-Track-Diagnostics-2026-10-04.json');
    expect(supportExportFileName()).toMatch(/^ANYVO-Track-Diagnostics-\d{4}-\d{2}-\d{2}\.json$/);
  });
  it('korrupte/teilweise Payloads gelten als unbrauchbar (kein Wurf)', () => {
    for (const bad of [null, undefined, 'x', 5, {}, { rawSearchPointCount: 3 }, { rawSearchPointCount: 3, geometry: {} }, { rawSearchPointCount: 3, geometry: { raw: [], run: [], replay: [] } }])
      expect(isUsableSupportCapture(bad)).toBe(false);
    expect(isUsableSupportCapture(diagFromField('F1'))).toBe(true);
  });
});

describe('Persistenz und Retention', () => {
  it('nach Track-Ende gespeichert und später wieder ladbar (Neu-Lesen aus dem Speicher)', async () => {
    const d = diagFromField('F2');
    await saveQaSearchCapture('sess-1', toSupportCapture(d), 'support');
    expect(await hasQaSearchCapture('sess-1', 'support')).toBe(true);
    expect(await hasSupportDiagnostics('sess-1')).toBe(true);
    expect(await loadQaSearchCapture('sess-1', 'support')).toEqual(JSON.parse(JSON.stringify(toSupportCapture(d))));
    expect(await hasQaSearchCapture('sess-other', 'support')).toBe(false);
  });
  it('Retention: letzte 5 bleiben (FIFO); QA-Namespace und fremde Daten werden nicht berührt', async () => {
    await AsyncStorage.setItem('anyvo.unrelated', 'keep-me');
    await saveQaSearchCapture('qa-a', diagFromField('F1'), 'qa');
    await saveQaSearchCapture('qa-b', diagFromField('F1'), 'qa');
    for (let i = 1; i <= 7; i++) await saveQaSearchCapture(`s${i}`, diagFromField('F1'), 'support');
    expect(QA_SEARCH_RETENTION).toBe(5);
    for (const gone of ['s1', 's2']) expect(await hasQaSearchCapture(gone, 'support')).toBe(false);
    for (const kept of ['s3', 's4', 's5', 's6', 's7']) expect(await hasQaSearchCapture(kept, 'support')).toBe(true);
    expect(await loadQaSearchCapture('s1', 'support')).toBeNull();
    expect(await hasQaSearchCapture('qa-a', 'qa')).toBe(true);
    expect(await hasQaSearchCapture('qa-b', 'qa')).toBe(true);
    expect(await AsyncStorage.getItem('anyvo.unrelated')).toBe('keep-me');
  });
  it('Namespaces sind getrennt: Support-Eintrag erscheint nicht im QA-Speicher und umgekehrt', async () => {
    await saveQaSearchCapture('only-support', diagFromField('F1'), 'support');
    expect(await hasQaSearchCapture('only-support', 'qa')).toBe(false);
    await saveQaSearchCapture('only-qa', diagFromField('F1'));
    expect(await hasQaSearchCapture('only-qa', 'support')).toBe(false);
  });
  it('Persistenzfehler wirft nie (Fährte wird davon nicht beeinträchtigt)', async () => {
    // Der AsyncStorage-Mock besteht aus jest.fn — einmaliger Fehler, ohne den Mock danach zu verändern.
    (AsyncStorage.setItem as unknown as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await expect(saveQaSearchCapture('boom', diagFromField('F1'), 'support')).resolves.toBeUndefined();
    expect(await hasQaSearchCapture('boom', 'support')).toBe(false);          // nichts halb geschrieben
    await saveQaSearchCapture('after', diagFromField('F1'), 'support');        // und danach funktioniert Speichern wieder
    expect(await hasQaSearchCapture('after', 'support')).toBe(true);
  });
  it('internes QA bleibt unverändert: ohne Namespace-Argument gelten die bisherigen QA-Schlüssel', async () => {
    await saveQaSearchCapture('qa-legacy', diagFromField('F1'));
    expect(await AsyncStorage.getItem('anyvo.qa.searchCapture.qa-legacy')).not.toBeNull();
    expect(await AsyncStorage.getItem('anyvo.qa.searchCapture.index')).toContain('qa-legacy');
    expect((await buildExportForSession('qa-legacy')).sessionId).toBeTruthy();   // bestehender interner Export weiter möglich
  });
});

describe('Teilen', () => {
  const savedNetwork = (global as any).fetch;
  afterEach(() => { (global as any).fetch = savedNetwork; });

  it('A: Fährte mit Diagnose → JSON valide, Datei im Cache, Share-Sheet genau einmal, offline (kein Netzwerk)', async () => {
    const fetchSpy = jest.fn(() => { throw new Error('network must not be used'); });
    (global as any).fetch = fetchSpy;
    await saveQaSearchCapture('sess-share', toSupportCapture(diagFromField('F2')), 'support');
    const r = await shareSupportDiagnostics('sess-share');
    expect(r.ok).toBe(true);
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
    const [uri, opts] = (mockShareAsync.mock.calls[0] as unknown) as [string, { mimeType: string; dialogTitle: string }];
    expect(uri).toMatch(/^file:\/\/\/cache\/ANYVO-Track-Diagnostics-\d{4}-\d{2}-\d{2}\.json$/);
    expect(opts).toMatchObject({ mimeType: 'application/json', dialogTitle: 'Diagnosedaten teilen' });
    const parsed = JSON.parse(mockWritten[uri]) as SupportExport;
    expect(parsed.exportType).toBe('support');
    expect(parsed.searchDiagnostics!.geometry.raw.length).toBeGreaterThan(10);
    expect(() => assertSupportPrivacy(parsed)).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('B: Fährte ohne Diagnose → kein Crash, kein Share, kontrolliertes Ergebnis; Button-Verfügbarkeit false', async () => {
    expect(await hasSupportDiagnostics('old-track')).toBe(false);
    expect(await shareSupportDiagnostics('old-track')).toEqual({ ok: false, reason: 'missing' });
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
  it('C: korruptes Payload (kaputtes JSON / falsche Form) → kein Crash, kein Share', async () => {
    await AsyncStorage.setItem('anyvo.support.searchCapture.bad-json', '{not json');
    await AsyncStorage.setItem('anyvo.support.searchCapture.bad-shape', JSON.stringify({ rawSearchPointCount: 3 }));
    for (const id of ['bad-json', 'bad-shape']) {
      expect(await buildSupportExportForSession(id)).toBeNull();
      expect(await shareSupportDiagnostics(id)).toEqual({ ok: false, reason: 'missing' });
    }
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
  it('Share-Sheet nicht verfügbar oder wirft → freundliches Ergebnis statt Exception', async () => {
    await saveQaSearchCapture('sess-fail', toSupportCapture(diagFromField('F1')), 'support');
    mockIsAvailableAsync.mockImplementation(async () => false);
    expect(await shareSupportDiagnostics('sess-fail')).toEqual({ ok: false, reason: 'failed' });
    mockIsAvailableAsync.mockImplementation(async () => true);
    mockShareAsync.mockRejectedValueOnce(new Error('native boom'));
    expect(await shareSupportDiagnostics('sess-fail')).toEqual({ ok: false, reason: 'failed' });
  });
  it('Privacy-Verstoss im Payload verhindert das Teilen (lieber kein Export als ein Leck)', async () => {
    const leaky = { ...toSupportCapture(diagFromField('F1')), note: 'kontakt: kunde@example.com' };
    await saveQaSearchCapture('sess-leak', leaky as unknown as QaSearchDiagnostics, 'support');
    expect(await shareSupportDiagnostics('sess-leak')).toEqual({ ok: false, reason: 'failed' });
    expect(mockShareAsync).not.toHaveBeenCalled();
  });
});

describe('Verdrahtung (Source)', () => {
  it('run.tsx: Support-Diagnose für jede Absuche, QA-Speicher nur im QA-Level, beides nicht awaited', () => {
    const run = fs.readFileSync('app/track/run.tsx', 'utf8');
    expect(run).toContain('if (!isSupportLevel) void saveQaSearchCapture(sessId, diag);');
    expect(run).toContain("void saveQaSearchCapture(sessId, toSupportCapture(diag), 'support');");
    expect(run).not.toMatch(/await saveQaSearchCapture/);
  });
  it('Auswertung: Aktion unterhalb des Inhalts, vor den Footer-Buttons — kein Primary-CTA, kein Trainer-Share-Mix', () => {
    const src = fs.readFileSync('app/track/[id].tsx', 'utf8');
    // Kunden-Fährtendiagnose (Karte) enthält die Teilen-Zeile — weiterhin unterhalb des Inhalts, vor dem Footer.
    expect(src).toContain('{data && <CustomerTrackDiagnosisCard sessionLocalId={String(id)} detail={data} />}');
    expect(src.indexOf('<CustomerTrackDiagnosisCard')).toBeLessThan(src.indexOf('{/* Footer */}'));
    const card = fs.readFileSync('features/tracking/components/CustomerTrackDiagnosisCard.tsx', 'utf8');
    expect(card).toContain('<SupportDiagnosticsRow sessionLocalId={sessionLocalId} detail={detail} />');
    const row = fs.readFileSync('features/tracking/components/SupportDiagnosticsRow.tsx', 'utf8');
    // Texte kommen aus i18n (alle App-Sprachen); der deutsche Wortlaut bleibt unverändert.
    expect(row).toContain("const TITLE = t('track.customerDiagnosis.shareTitle');");
    expect(row).toContain("t('track.customerDiagnosis.shareSubtitle')");
    expect(row).toContain('accessibilityLabel={TITLE}');
    expect(row).not.toContain('AnyvoButton');                // bewusst dezent, kein Primary-Button
    // Ohne Daten: kein Button (Legacy: nichts; Kunden-Karte: verständlicher Hinweis statt Button).
    expect(row).toMatch(/if \(availability === 'none'\) \{/);
    expect(row).toContain("t('track.customerDiagnosis.unavailable')");
    const de = fs.readFileSync('i18n/de-CH.ts', 'utf8');
    expect(de).toContain("'track.customerDiagnosis.shareTitle': 'Diagnosedaten teilen'");
    expect(de).toContain("'track.customerDiagnosis.shareSubtitle': 'Technische Fährtendaten für Support und Fehleranalyse teilen.'");
    expect(de).toContain("'track.customerDiagnosis.unavailable': 'Für diese ältere Fährte liegen keine vollständigen Diagnosedaten vor.'");
  });
});
