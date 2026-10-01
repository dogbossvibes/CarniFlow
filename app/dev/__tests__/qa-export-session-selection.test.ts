/**
 * QA-Export Session Freshness/Selection — Verdrahtung im Diagnose-Screen
 * (statisch, Kommentare entfernt) + Unveränderlichkeit des Export-Kerns.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const screen = strip(read('app/dev/precision-location-test.tsx'));
const service = strip(read('features/tracking/services/qaTrackExportService.ts'));
const hook = strip(read('features/tracking/hooks/useQaLaySessions.ts'));

describe('Diagnose-Screen: Sessionliste fokus-aktuell', () => {
  it('2. lädt über useQaLaySessions (useFocusEffect), nicht mehr über einen Mount-Effekt', () => {
    expect(screen).toContain("useQaLaySessions(session?.user?.id, 5)");
    expect(screen).not.toContain('listRecentLaySessions(');
    expect(hook).toContain("import { useFocusEffect } from 'expo-router';");
    expect(hook).toContain('useFocusEffect(useCallback(() => { void reload(); }, [reload]));');
    expect(hook).not.toMatch(/setInterval|setTimeout|supabase|fetch\(/);
  });
  it('4. Zeile zeigt formatQaSessionRow (Datum, Uhrzeit, Punkte, Distanz, qaId); „Letzte gelegte Fährte" nur für Index 0', () => {
    expect(screen).toContain('value={formatQaSessionRow(q)}');
    expect(screen).toContain("label={i === 0 ? 'Letzte gelegte Fährte' : `Fährte ${i + 1}`}");
    expect(service).toContain('qaId: hashSessionId(s.local_id),');
    expect(service).toContain('distanceM: distanceFromPayload(s.payload_json),');
  });
  it('6./8./9. Export läuft nur über die sichtbar gewählte Zeile; stale Auswahl wird zurückgesetzt, nie umgeleitet; Ergebnis nennt export.sessionId', () => {
    expect(screen).toContain('useEffect(() => { setQaSelected(prev => reconcileQaSelection(prev, qaSessions)); }, [qaSessions]);');
    expect(screen).toContain('const row = qaSessionsRef.current.find(q => q.localId === localId);');
    expect(screen).toContain("if (!row) { setQaSelected(null); setQaResult('Sessionliste wurde aktualisiert – bitte Fährte erneut auswählen.'); return; }");
    expect(screen).toContain('setQaSelected(localId);');
    expect(screen).toContain('const exported = await buildExportForSession(row.localId);');
    expect(screen).toContain('shareQaExport(exported, { startedAt: row.startedAt })');
    expect(screen).toContain('${exported.sessionId}');
    expect(screen).toContain("onPress={() => void runExport(q.localId, 'share')}");
    expect(screen).toContain('qaSelected === q.localId && s.qaSessionBoxSelected');
  });
  it('10. buildExportForSession lädt Lay- und Search-QA mit derselben localId', () => {
    expect(service).toContain('getLayTrackPointsBySession(localId),');
    expect(service).toContain('getTrackMarkersBySession(localId).catch(() => []),');
    expect(service).toContain('loadQaSessionCapture(localId).catch(() => null),');
    expect(service).toContain('loadQaSearchCapture(localId).catch(() => null),');
    expect(service).toContain('const exported = buildQaTrackExport(localId, points, markers, capture, search);');
    expect(service).toContain('assertNoAbsoluteData(exported);');
  });
});
