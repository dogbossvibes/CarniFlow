/** @jest-environment node */
import fs from 'fs';
import { PDFPage } from 'pdf-lib';
import { buildTrackReportPdf, type ReportLabels } from '../trackReportPdf';
import { buildTrackUserExport, trackExportGpx } from '../trackUserExport';
import { deCH } from '@/i18n/de-CH';

// Quick Win 2: Liegezeit, Abweichung, Winkel und Status je Gegenstand im Export.
// Nur lesend: die Eingabe bleibt unverändert.
const now = '2026-11-24T12:00:00.000Z';
const runId = 'run-1';
const markers = [
  { marker_type: 'gegenstand', material: 'holz', latitude: 47, longitude: 8 },
  { marker_type: 'winkel', angle_kind: 'gw', latitude: 47.0005, longitude: 8.001 },
  { marker_type: 'gegenstand', material: 'leder', latitude: 47.001, longitude: 8.002 },
  { marker_type: 'winkel', angle_kind: 'gw', latitude: 47.0015, longitude: 8.003 },
  { marker_type: 'winkel', angle_kind: 'ow', latitude: 47.002, longitude: 8.004 },
  { marker_type: 'gegenstand', material: 'filz', latitude: 47.003, longitude: 8.005 },
];
const snapshot = { version: 1, objects: [
  { id: 'a', index: 0, material: 'holz', recordedStatus: 'manual_found' },
  { id: 'b', index: 1, material: 'leder', recordedStatus: 'auto_dwell_found' },
  { id: 'c', index: 2, material: 'filz', recordedStatus: 'missed' },
] };
const source = () => ({
  dog: { name: 'Luna' }, session_date: '2026-11-24', lying_time_minutes: 45, distance_meters: 412,
  points: [{ latitude: 47, longitude: 8 }, { latitude: 47.003, longitude: 8.005 }],
  markers,
  runs: [{ id: runId, run_points: [{ lat: 47, lng: 8 }, { lat: 47.003, lng: 8.005 }], average_deviation_meters: 5 }],
  track_data: { run: { run_id: runId, object_snapshot: snapshot, analytics: { deviation: { meanM: 3.4 } } } },
});

describe('Export: Liegezeit, Abweichung, Winkel, Gegenstände', () => {
  it('übernimmt gespeicherte Liegezeit und Abweichung, ohne die Eingabe zu ändern', () => {
    const input = source(); const before = JSON.stringify(input);
    const data = buildTrackUserExport(input, now);
    expect(data.summary.lyingMinutes).toBe(45);
    expect(data.summary.deviationAvgM).toBe(3.4);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('nimmt die gespeicherte Durchschnittsabweichung, wenn keine Auswertung vorliegt', () => {
    const input = { ...source(), track_data: { run: { run_id: runId, object_snapshot: snapshot } } };
    expect(buildTrackUserExport(input, now).summary.deviationAvgM).toBe(5);
  });

  it('fehlende Werte bleiben leer statt erfunden', () => {
    const data = buildTrackUserExport({ points: [] }, now);
    expect(data.summary.lyingMinutes).toBeNull();
    expect(data.summary.deviationAvgM).toBeNull();
    expect(data.objectOutcomes).toBeUndefined();
  });

  it('ordnet den Status je Gegenstand G1…G3 zu', () => {
    expect(buildTrackUserExport(source(), now).objectOutcomes).toEqual([
      { label: 'G1', status: 'found' }, { label: 'G2', status: 'found' }, { label: 'G3', status: 'not_found' },
    ]);
  });

  it.each([
    ['anderes Material', (s: ReturnType<typeof source>) => { s.track_data.run.object_snapshot = { version: 1, objects: snapshot.objects.map((o, i) => i === 1 ? { ...o, material: 'holz' } : o) }; }],
    ['andere Anzahl', (s: ReturnType<typeof source>) => { s.track_data.run.object_snapshot = { version: 1, objects: snapshot.objects.slice(0, 2) }; }],
    ['fremde Absuche', (s: ReturnType<typeof source>) => { s.runs[0].id = 'other-run'; }],
  ])('zeigt keinen Status bei unsicherer Zuordnung (%s)', (_name, change) => {
    const input = source(); change(input);
    expect(buildTrackUserExport(input, now).objectOutcomes).toBeUndefined();
  });

  it('schreibt Material bzw. Winkelart als Kommentar in die GPX-Wegpunkte', () => {
    const gpx = trackExportGpx(buildTrackUserExport(source(), now));
    expect(gpx).toContain('<name>G1</name><cmt>holz</cmt><type>gegenstand</type>');
    expect(gpx).toContain('<name>winkel</name><cmt>gw</cmt><type>winkel</type>');
    expect(gpx).toContain('<trk><name>Reference</name>');
    expect(gpx).toContain('<trk><name>Recorded search</name>');
  });

  it('PDF zeigt Liegezeit, Abweichung, Winkel und Status je Gegenstand', async () => {
    const drawn = jest.spyOn(PDFPage.prototype, 'drawText');
    const keys = ['title','reference','search','duration','objects','score','confidence','conditions','notes','map','source','unknown','date','glyphNotice'] as const;
    const labels = Object.fromEntries(keys.map(k => [k, deCH[`track.report.${k}`]])) as unknown as ReportLabels;
    labels.noGeometry = deCH['track.export.unavailable'];
    labels.lying = deCH['track.lyingTime']; labels.deviation = deCH['track.analysisLineDeviation']; labels.angles = deCH['track.angle'];
    labels.outcomeLabels = { found: deCH['track.review.found'], not_found: deCH['track.review.not_found'], unobserved: deCH['track.review.unobserved'], unknown: deCH['track.review.unknown'] };
    labels.angleLabels = { gw: deCH['track.angleGw'], ow: deCH['track.angleOw'] };
    labels.materialLabels = { holz: 'Holz', leder: 'Leder', filz: 'Filz' };
    await buildTrackReportPdf(buildTrackUserExport(source(), now), fs.readFileSync('assets/fonts/NotoSans-Regular.ttf'), labels, fs.readFileSync('assets/images/anyvologo.png'));
    const text = drawn.mock.calls.map(c => c[0]).join('\n');
    expect(text).toContain('Liegezeit');
    expect(text).toContain('45');
    expect(text).toContain('Ø Linienabweichung');
    expect(text).toMatch(/G1 · Holz · Gefunden/);
    expect(text).toMatch(/G3 · Filz · Nicht gefunden/);
    expect(text).toMatch(/3 · 2× Geschlossener Winkel, 1× Offener Winkel/);
    jest.restoreAllMocks();
  }, 30_000);
});
