// Support-Diagnose teilen: lokal gespeichertes, privacy-reduced Payload → JSON-Datei → natives Share-Sheet.
//
// Reines Lesen aus lokaler Persistenz (AsyncStorage + lokale SQLite-Marker/Punkte). Kein Backend,
// kein Upload, keine Netzwerkverbindung nötig. Kein Eingriff in Erkennung, Aufzeichnung oder Sync.
import {
  getLayTrackPointsBySession, getTrackMarkersBySession,
} from '@/features/tracking/repositories/localTrackRepository';
import { hasQaSearchCapture, loadQaSearchCapture } from '@/features/tracking/utils/qaSearchCapture';
import {
  attachSupportProvenance, buildSupportExport, isUsableSupportCapture, serializeSupportExport, supportExportFileName,
  type SupportExport,
} from '@/features/tracking/utils/supportDiagnostics';
import { shareJsonFile } from '@/features/tracking/services/qaTrackExportService';
import {
  buildPersistedSupportExport, layPointsFromDetail, markersFromDetail, runFromDetail,
  type PersistedSupportExport,
} from '@/features/tracking/utils/customerTrackDiagnosis';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import { buildLocalTrackDetail } from '@/features/tracking/utils/localTrackDetail';
import { buildDiagnosticProvenance, canReadSupportProvenance } from '@/features/tracking/utils/supportProvenanceStore';
import { supportProvenanceScope, supportProvenanceScopeMatches } from '@/features/tracking/utils/supportProvenanceScope';
import { assertRecordingProvenance, type DiagnosticProvenance, type RecordingProvenance } from '@/features/tracking/utils/diagnosticProvenance';

async function withSupportProvenance<T extends SupportExport>(sessionLocalId: string, exported: T,
  search?: { attempt?: string; context?: RecordingProvenance }): Promise<T> {
  const scope = supportProvenanceScope();
  const provenance = await buildDiagnosticProvenance(sessionLocalId, search?.attempt);
  if (search?.context !== undefined && await canReadSupportProvenance(sessionLocalId)) {
    assertRecordingProvenance(search.context);
    provenance.recording.search = search.context;
  }
  if (!supportProvenanceScopeMatches(scope)) throw new Error('PROVENANCE_ACCOUNT_CHANGED');
  return attachSupportProvenance(exported, provenance);
}

// The existing local run identity is lookup-only; no latest-run fallback, no ID in JSON.
function searchAttemptFromDetail(detail: Record<string, any>): string | undefined {
  const id: unknown = detail.track_data?.run?.run_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** Gibt es für diese gespeicherte Fährte eine Support-Diagnose? (Index-Prüfung, lädt das Payload nicht.) */
export function hasSupportDiagnostics(sessionLocalId: string): Promise<boolean> {
  return hasQaSearchCapture(sessionLocalId, 'support');
}

/** Baut den Export einer Fährte; null, wenn keine (nutzbare) Support-Diagnose vorliegt. Wirft nur bei Privacy-Verstoss. */
export async function buildSupportExportForSession(sessionLocalId: string): Promise<SupportExport | null> {
  const search = await loadQaSearchCapture(sessionLocalId, 'support');
  if (!isUsableSupportCapture(search)) return null;
  const [points, markers] = await Promise.all([
    getLayTrackPointsBySession(sessionLocalId).catch(() => []),
    getTrackMarkersBySession(sessionLocalId).catch(() => []),
  ]);
  return withSupportProvenance(sessionLocalId, buildSupportExport(points, markers, search), { context: search.recordingContext });
}

export type ShareSupportResult = { ok: true; fileName: string } | { ok: false; reason: 'missing' | 'failed' | 'busy' };

// A single native sheet also protects the existing date-only filename against concurrent writes.
let sharing = false;

/**
 * Lädt, validiert, serialisiert, schreibt eine temporäre Datei und öffnet das native Share-Sheet.
 * Gibt nie eine Exception an die UI weiter: der Kunde sieht eine freundliche Meldung, keine Stacktraces.
 */
export async function shareSupportDiagnostics(sessionLocalId: string): Promise<ShareSupportResult> {
  if (sharing) return { ok: false, reason: 'busy' };
  sharing = true;
  const scope = supportProvenanceScope();
  const validateScope = () => { if (!supportProvenanceScopeMatches(scope)) throw new Error('PROVENANCE_ACCOUNT_CHANGED'); };
  try {
    const exported = await buildSupportExportForSession(sessionLocalId);
    if (!exported) return { ok: false, reason: 'missing' };
    const fileName = supportExportFileName();
    validateScope();
    await shareJsonFile(serializeSupportExport(exported), fileName, 'Diagnosedaten teilen', validateScope);
    return { ok: true, fileName };
  } catch (e) {
    console.warn('[supportDiagnostics] share failed', e);
    return { ok: false, reason: 'failed' };
  } finally { sharing = false; }
}

// ── Kunden-Diagnose: Capture bevorzugt, sonst aus gespeicherten Daten (on-demand) ──
//
// Die Support-Capture (Retention: letzte 5 Absuchen) ist nur noch eine Anreicherung,
// KEIN UI-Gate mehr: fehlt sie, wird der Export aus den dauerhaft gespeicherten Daten
// derselben Fährte gebaut (lokale SQLite-Session bevorzugt, sonst der bereits geladene
// Detail-Datensatz). Rein lesend — nichts wird geschrieben, nichts neu berechnet.

export type CustomerDiagnosticsSource = 'capture' | 'persisted';
export type CustomerDiagnosticsAvailability = CustomerDiagnosticsSource | 'none';

/** Export aus gespeicherten Daten: lokale Session (SQLite) zuerst, sonst `detail`. */
export async function buildPersistedExportForSession(
  sessionLocalId: string, detail?: Record<string, any> | null,
): Promise<PersistedSupportExport | null> {
  const local = await getLocalTrainingSessionById(sessionLocalId).catch(() => null);
  if (local) {
    const [points, markers] = await Promise.all([
      getLayTrackPointsBySession(sessionLocalId).catch(() => []),
      getTrackMarkersBySession(sessionLocalId).catch(() => []),
    ]);
    const localDetail = buildLocalTrackDetail(local, points, markers);
    const fromLocal = buildPersistedSupportExport({
      layPoints: layPointsFromDetail(localDetail), markers: markersFromDetail(localDetail), run: runFromDetail(localDetail),
    });
    if (fromLocal) return withSupportProvenance(sessionLocalId, fromLocal, { attempt: searchAttemptFromDetail(localDetail) });
  }
  if (!detail) return null;
  const fromDetail = buildPersistedSupportExport({ layPoints: layPointsFromDetail(detail), markers: markersFromDetail(detail), run: runFromDetail(detail) });
  return fromDetail ? withSupportProvenance(sessionLocalId, fromDetail, { attempt: searchAttemptFromDetail(detail) }) : null;
}

/** Was kann geteilt werden? Capture → `capture`; sonst verwertbare gelegte Linie → `persisted`; sonst `none`. */
export async function customerDiagnosticsAvailability(
  sessionLocalId: string, detail?: Record<string, any> | null,
): Promise<CustomerDiagnosticsAvailability> {
  return (await customerDiagnosticsOverview(sessionLocalId, detail)).availability;
}

export type CustomerDiagnosticsOverview = {
  availability: CustomerDiagnosticsAvailability;
  recording?: DiagnosticProvenance['recording'];
  partial: boolean;
  reduced: boolean;
};

/** One read for source, recording identity and explicitly incomplete search streams. */
export async function customerDiagnosticsOverview(
  sessionLocalId: string, detail?: Record<string, any> | null,
): Promise<CustomerDiagnosticsOverview> {
  try {
    const capture = await buildSupportExportForSession(sessionLocalId).catch(() => null);
    const exported = capture ?? await buildPersistedExportForSession(sessionLocalId, detail);
    const search = capture?.searchDiagnostics;
    return {
      availability: capture ? 'capture' : exported ? 'persisted' : 'none',
      recording: exported?.provenance?.recording,
      partial: search?.partial === true,
      reduced: !!search && (search.truncated?.raw === true || search.truncated?.cursor === true
        || search.rawSearchPointCount > search.geometry.raw.length || search.runPointCount > search.geometry.run.length
        || search.filteredSearchPointCount > search.geometry.filtered.length
        || search.replayPointCount > search.geometry.replay.length),
    };
  } catch (e) {
    console.warn('[supportDiagnostics] availability', e);
    return { availability: 'none', partial: false, reduced: false };
  }
}

export type ShareCustomerResult =
  | { ok: true; fileName: string; source: CustomerDiagnosticsSource }
  | { ok: false; reason: 'missing' | 'failed' | 'busy' };

/**
 * Teilen für Kunden: vorhandene Capture unverändert (bestehender Pfad), sonst Export aus
 * gespeicherten Daten. Schliesst der Nutzer das Share-Sheet, ist das kein Fehler. Gibt nie
 * eine Exception an die UI weiter.
 */
export async function shareCustomerDiagnostics(
  sessionLocalId: string, detail?: Record<string, any> | null,
): Promise<ShareCustomerResult> {
  if (sharing) return { ok: false, reason: 'busy' };
  sharing = true;
  const scope = supportProvenanceScope();
  const validateScope = () => { if (!supportProvenanceScopeMatches(scope)) throw new Error('PROVENANCE_ACCOUNT_CHANGED'); };
  try {
    const capture = await buildSupportExportForSession(sessionLocalId).catch(() => null);
    const exported: SupportExport | PersistedSupportExport | null = capture ?? await buildPersistedExportForSession(sessionLocalId, detail);
    if (!exported) return { ok: false, reason: 'missing' };
    const fileName = supportExportFileName();
    validateScope();
    await shareJsonFile(serializeSupportExport(exported), fileName, 'Diagnosedaten teilen', validateScope);
    return { ok: true, fileName, source: capture ? 'capture' : 'persisted' };
  } catch (e) {
    console.warn('[supportDiagnostics] customer share failed', e);
    return { ok: false, reason: 'failed' };
  } finally { sharing = false; }
}
