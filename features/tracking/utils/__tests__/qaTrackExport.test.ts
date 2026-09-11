// QA-Export: Anonymisierung, Exportstruktur und Re-Import als Fixture.
//
// Der Export darf die Geometrie vollständig erhalten und gleichzeitig KEINE
// rekonstruierbaren Standortdaten enthalten. Beides wird hier bewiesen.

import {
  anonymizePoints, anonymizeMarkers, buildQaTrackExport, serializeQaTrackExport,
  qaExportFileName, assertNoAbsoluteData, hashSessionId,
  type RawLayPoint, type RawTrackMarker,
} from '@/features/tracking/utils/qaTrackExport';
import {
  fixtureFromExport, fixtureToDetectorBuffer, evaluateAgainstGroundTruth,
} from './helpers/realSessionFixture';
import { detectShortLegCorners } from '@/features/tracking/utils/shortLegCornerDetection';

const M_PER_DEG = 111320;
const RAD = Math.PI / 180;
const LAT0 = 47.3769, LNG0 = 8.5417;      // echter Ort — darf im Export NICHT auftauchen
const M_PER_LNG = M_PER_DEG * Math.cos(LAT0 * RAD);
const T0_MS = 1_764_000_000_000;           // absoluter Zeitstempel

/** Die verbindliche Feldroute als „Rohpunkte aus der Datenbank". */
function rawLayPoints(tailM = 2.25, stepM = 0.75): RawLayPoint[] {
  const legM = 3.75;
  const segs: [number, number][] = [[0, legM], [270, legM], [0, legM], [135, legM], [0, legM], [180, tailM]];
  const xy: [number, number][] = [[0, 0]];
  let x = 0, y = 0;
  for (const [hdg, len] of segs) {
    for (let d = stepM; d <= len + 1e-9; d += stepM) {
      xy.push([x + Math.sin(hdg * RAD) * d, y + Math.cos(hdg * RAD) * d]);
    }
    x = xy[xy.length - 1][0]; y = xy[xy.length - 1][1];
  }
  return xy.map((p, i) => ({
    latitude: LAT0 + p[1] / M_PER_DEG,
    longitude: LNG0 + p[0] / M_PER_LNG,
    accuracy: 5 + (i % 6),
    timestamp: new Date(T0_MS + i * 1000).toISOString(),
  }));
}

const rawMarkers: RawTrackMarker[] = [
  { marker_type: 'winkel', angle_kind: 'links', latitude: LAT0 + 3.75 / M_PER_DEG, longitude: LNG0, distance_from_start: 3.75, created_at: new Date(T0_MS + 5000).toISOString() },
  { marker_type: 'gegenstand', material: 'diverses', latitude: LAT0 + 7.5 / M_PER_DEG, longitude: LNG0, distance_from_start: 7.5, created_at: new Date(T0_MS + 10000).toISOString() },
];

// ── 1. Anonymisierung ────────────────────────────────────────────────────
describe('Anonymisierung', () => {
  const raw = rawLayPoints();
  const anon = anonymizePoints(raw);

  it('der erste Punkt wird zum Ursprung', () => {
    expect(anon[0]).toEqual({ x: 0, y: 0, accuracy: 5, tMs: 0 });
  });

  it('die Reihenfolge bleibt vollständig erhalten', () => {
    expect(anon).toHaveLength(raw.length);
    // Zeitstempel steigen streng monoton in 1-s-Schritten, wie die Quelle.
    for (let i = 1; i < anon.length; i++) expect(anon[i].tMs - anon[i - 1].tMs).toBe(1000);
  });

  it('Punktabstände bleiben bis auf Rundung identisch', () => {
    for (let i = 1; i < raw.length; i++) {
      const rawStep = Math.hypot(
        (raw[i].longitude - raw[i - 1].longitude) * M_PER_LNG,
        (raw[i].latitude - raw[i - 1].latitude) * M_PER_DEG,
      );
      const anonStep = Math.hypot(anon[i].x - anon[i - 1].x, anon[i].y - anon[i - 1].y);
      expect(anonStep).toBeCloseTo(rawStep, 2);
    }
  });

  it('die Gesamtlänge ist vorher und nachher praktisch identisch', () => {
    let rawLen = 0, anonLen = 0;
    for (let i = 1; i < raw.length; i++) {
      rawLen += Math.hypot(
        (raw[i].longitude - raw[i - 1].longitude) * M_PER_LNG,
        (raw[i].latitude - raw[i - 1].latitude) * M_PER_DEG,
      );
      anonLen += Math.hypot(anon[i].x - anon[i - 1].x, anon[i].y - anon[i - 1].y);
    }
    expect(anonLen).toBeCloseTo(rawLen, 2);
    expect(Math.abs(anonLen - rawLen)).toBeLessThan(0.01);
  });

  it('Accuracy bleibt erhalten', () => {
    expect(anon.map(p => p.accuracy)).toEqual(raw.map(p => p.accuracy));
  });

  it('Marker werden auf denselben Ursprung bezogen', () => {
    const m = anonymizeMarkers(rawMarkers, raw[0]);
    expect(m[0]).toMatchObject({ type: 'winkel', angleKind: 'links', x: 0, atM: 3.75, tMs: 5000 });
    expect(m[0].y).toBeCloseTo(3.75, 2);
    expect(m[1]).toMatchObject({ type: 'gegenstand', material: 'diverses', tMs: 10000 });
  });

  it('die Session-ID wird gehasht und ist nicht die Original-ID', () => {
    const id = 'local-9f3c-user-42';
    const h = hashSessionId(id);
    expect(h).not.toContain(id);
    expect(h).toMatch(/^qa-[0-9a-f]{8}$/);
    expect(hashSessionId(id)).toBe(h);        // stabil
    expect(hashSessionId('anderes')).not.toBe(h);
  });
});

// ── 2. Exportstruktur ────────────────────────────────────────────────────
describe('Exportstruktur', () => {
  const exported = buildQaTrackExport('local-abc-123', rawLayPoints(), rawMarkers);

  it('enthält die geforderten Felder und Metadaten', () => {
    expect(exported.schemaVersion).toBe(1);
    expect(exported.pointType).toBe('lay');
    expect(exported.pointCount).toBe(exported.points.length);
    expect(exported.durationMs).toBeGreaterThan(0);
    expect(exported.totalDistanceM).toBeGreaterThan(15);
    expect(exported.samplingIntervalMs).toBe(1000);
    expect(exported.accuracy.min).toBe(5);
    expect(exported.accuracy.max).toBeGreaterThanOrEqual(5);
    expect(exported.markerTypes).toEqual(['gegenstand', 'winkel']);
    console.log('\n[QA-EXPORT] Beispielstruktur (Punkte/Marker gekürzt)\n' +
      JSON.stringify({ ...exported, points: exported.points.slice(0, 3), markers: exported.markers.slice(0, 1) }, null, 2) + '\n');
  });

  it('KEINE GPS-Koordinaten im gesamten JSON', () => {
    const json = serializeQaTrackExport(exported);
    for (const forbidden of ['latitude', 'longitude', '47.37', '8.54']) {
      expect(json).not.toContain(forbidden);
    }
    // Auch kein Feld, das wie eine Koordinate aussieht.
    expect(Object.keys(exported.points[0]).sort()).toEqual(['accuracy', 'tMs', 'x', 'y']);
  });

  it('KEINE absoluten Zeitstempel', () => {
    const json = serializeQaTrackExport(exported);
    expect(json).not.toContain(String(T0_MS));
    expect(json).not.toContain('2025-');
    expect(json).not.toContain('2026-');
    for (const p of exported.points) expect(Math.abs(p.tMs)).toBeLessThan(1e12);
  });

  it('das Sicherheitsnetz greift bei manipulierten Daten', () => {
    expect(() => assertNoAbsoluteData(exported)).not.toThrow();
    expect(() => assertNoAbsoluteData({ ...exported, points: [{ x: 0, y: 0, accuracy: 5, tMs: T0_MS }] }))
      .toThrow(/absoluten Zeitstempel/);
    expect(() => assertNoAbsoluteData({ ...exported, points: [{ x: 5, y: 0, accuracy: 5, tMs: 0 }] }))
      .toThrow(/nicht auf den ersten Punkt normiert/);
  });

  it('der Dateiname enthält nur die gehashte ID', () => {
    expect(qaExportFileName(exported)).toBe(`anyvo-track-qa-${exported.sessionId}.json`);
    expect(qaExportFileName(exported)).not.toContain('local-abc-123');
  });

  it('leere Session bricht nicht', () => {
    const empty = buildQaTrackExport('x', [], []);
    expect(empty.pointCount).toBe(0);
    expect(empty.totalDistanceM).toBe(0);
    expect(() => assertNoAbsoluteData(empty)).not.toThrow();
  });
});

// ── 3. Re-Import: exportierte Datei → Fixture → Detector ─────────────────
describe('Re-Import als Fixture', () => {
  it('ein serialisierter Export lässt sich wieder einlesen und auswerten', () => {
    const exported = buildQaTrackExport('local-abc-123', rawLayPoints(), rawMarkers);
    // Der ganze Weg: JSON schreiben → parsen → Fixture → Detektor-Eingangskette.
    const reparsed = JSON.parse(serializeQaTrackExport(exported)) as typeof exported;
    const fixture = fixtureFromExport('A', reparsed, [
      { index: 1, expected: 'links', atM: 3.75 },
      { index: 2, expected: 'rechts', atM: 7.50 },
      { index: 3, expected: 'spitz_rechts', atM: 11.25 },
      { index: 4, expected: 'spitz_links', atM: 15.00 },
      { index: 5, expected: 'rechts', atM: 18.75 },
    ]);
    const { events } = evaluateAgainstGroundTruth(fixture);
    expect(events).toHaveLength(5);
    expect(events.slice(0, 4).every(e => e.detected)).toBe(true);
    expect(events.slice(0, 4).map(e => e.classification))
      .toEqual(['links', 'rechts', 'spitz_rechts', 'spitz_links']);
  });

  it('der Export läuft durch dieselbe Produktions-Eingangskette wie der Recorder', () => {
    const exported = buildQaTrackExport('x', rawLayPoints(), []);
    const buffer = fixtureToDetectorBuffer(exported.points);
    // Es gibt keine zweite, vereinfachte Erkennung: derselbe Detector.
    const a = detectShortLegCorners(buffer);
    expect(a.corners.length).toBeGreaterThan(0);
    expect(a.detectorPointCount).toBe(buffer.length);
  });

  it('Geometrie überlebt den kompletten Rundlauf', () => {
    const raw = rawLayPoints();
    const exported = buildQaTrackExport('x', raw, []);
    const reparsed = JSON.parse(serializeQaTrackExport(exported)) as typeof exported;
    let len = 0;
    for (let i = 1; i < reparsed.points.length; i++) {
      len += Math.hypot(
        reparsed.points[i].x - reparsed.points[i - 1].x,
        reparsed.points[i].y - reparsed.points[i - 1].y,
      );
    }
    expect(len).toBeCloseTo(exported.totalDistanceM, 1);
  });
});

// ── 4. Nur `lay` — nachgewiesen an der Abfrage ───────────────────────────
describe('Datenquelle: ausschliesslich gelegte Punkte', () => {
  it('die Repository-Abfrage filtert hart auf point_type=lay', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync('features/tracking/repositories/localTrackRepository.ts', 'utf8');
    const fn = src.slice(src.indexOf('export async function getLayTrackPointsBySession'));
    expect(fn.slice(0, 500)).toContain("point_type='lay'");
  });

  it('der Export-Service nutzt genau diese Abfrage — nicht die ungefilterte', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync('features/tracking/services/qaTrackExportService.ts', 'utf8');
    expect(src).toContain('getLayTrackPointsBySession');
    expect(src).not.toContain('getSearchPointsBySession');
    // Die ungefilterte Abfrage darf hier nicht vorkommen.
    expect(src).not.toMatch(/getTrackPointsBySession\b/);
  });

  it('REGRESSION: expo-sharing wird als Namespace importiert, nicht über default', () => {
    // Ursache des Gerätefehlers „Cannot read property 'isAvailableAsync' of
    // undefined": expo-sharing@14 hat KEINEN Default-Export, nur benannte
    // Funktionen. `{ default: Sharing }` ergibt deshalb undefined.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync('features/tracking/services/qaTrackExportService.ts', 'utf8');
    expect(src).toContain("import * as Sharing from 'expo-sharing'");
    // Nur der ausführbare Code zählt — im Kommentar steht das fehlerhafte
    // Muster absichtlich, als Erklärung der Ursache.
    const code = src.split('\n').filter((l: string) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    expect(code).not.toContain('{ default: Sharing }');
    // Defensive Prüfung vor jeder Nutzung.
    expect(src).toContain("typeof Sharing.isAvailableAsync !== 'function'");
    expect(src).toContain("typeof Sharing.shareAsync !== 'function'");
    expect(src).toContain('Teilen ist in diesem App-Build nicht verfügbar.');
  });

  it('expo-sharing stellt die benötigten Funktionen als benannte Exporte bereit', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing');
    expect(typeof Sharing.isAvailableAsync).toBe('function');
    expect(typeof Sharing.shareAsync).toBe('function');
    // …und eben KEINEN Default-Export mit diesen Funktionen.
    expect(Sharing.default?.isAvailableAsync).toBeUndefined();
  });

  it('der Kopieren-Pfad bleibt unberührt — Namespace-Import ohne default', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync('features/tracking/services/qaTrackExportService.ts', 'utf8');
    expect(src).toContain("const Clipboard = await import('expo-clipboard');");
    expect(src).not.toContain("{ default: Clipboard }");
    expect(src).toContain('Clipboard.setStringAsync(json)');
    // Die Datei wird erst NACH der Sharing-Prüfung geschrieben — kein
    // verwaister Schreibvorgang, wenn Teilen gar nicht möglich ist.
    const shareFn = src.slice(src.indexOf('export async function shareQaExport'));
    expect(shareFn.indexOf('Sharing.isAvailableAsync')).toBeLessThan(shareFn.indexOf('writeAsStringAsync'));
  });

  it('der Export markiert seinen Inhalt explizit als lay', () => {
    expect(buildQaTrackExport('x', rawLayPoints(), []).pointType).toBe('lay');
  });
});
