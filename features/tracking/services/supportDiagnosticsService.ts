// Support-Diagnose teilen: lokal gespeichertes, privacy-reduced Payload → JSON-Datei → natives Share-Sheet.
//
// Reines Lesen aus lokaler Persistenz (AsyncStorage + lokale SQLite-Marker/Punkte). Kein Backend,
// kein Upload, keine Netzwerkverbindung nötig. Kein Eingriff in Erkennung, Aufzeichnung oder Sync.
import {
  getLayTrackPointsBySession, getTrackMarkersBySession,
} from '@/features/tracking/repositories/localTrackRepository';
import { hasQaSearchCapture, loadQaSearchCapture } from '@/features/tracking/utils/qaSearchCapture';
import {
  attachBackgroundLayDiagnostics, buildSupportExport, isUsableSupportCapture, serializeSupportExport, supportExportFileName,
  type SupportExport,
} from '@/features/tracking/utils/supportDiagnostics';
import { shareJsonFile } from '@/features/tracking/services/qaTrackExportService';
import {
  buildPersistedSupportExport, layPointsFromDetail, markersFromDetail, runFromDetail,
  type PersistedSupportExport,
} from '@/features/tracking/utils/customerTrackDiagnosis';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import { buildLocalTrackDetail } from '@/features/tracking/utils/localTrackDetail';
import { loadBackgroundLayDiagnostics } from '@/features/tracking/utils/backgroundLayDiagnostics';

async function withBackgroundLayDiagnostics<T extends SupportExport>(sessionLocalId: string, exported: T): Promise<T> {
  const diagnostics = await loadBackgroundLayDiagnostics(sessionLocalId).catch(() => null);
  return attachBackgroundLayDiagnostics(exported, diagnostics);
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
  return withBackgroundLayDiagnostics(sessionLocalId, buildSupportExport(points, markers, search));
}

export type ShareSupportResult = { ok: true; fileName: string } | { ok: false; reason: 'missing' | 'failed' };

/**
 * Lädt, validiert, serialisiert, schreibt eine temporäre Datei und öffnet das native Share-Sheet.
 * Gibt nie eine Exception an die UI weiter: der Kunde sieht eine freundliche Meldung, keine Stacktraces.
 */
export async function shareSupportDiagnostics(sessionLocalId: string): Promise<ShareSupportResult> {
  try {
    const exported = await buildSupportExportForSession(sessionLocalId);
    if (!exported) return { ok: false, reason: 'missing' };
    const fileName = supportExportFileName();
    await shareJsonFile(serializeSupportExport(exported), fileName, 'Diagnosedaten teilen');
    return { ok: true, fileName };
  } catch (e) {
    console.warn('[supportDiagnostics] share failed', e);
    return { ok: false, reason: 'failed' };
  }
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
    if (fromLocal) return withBackgroundLayDiagnostics(sessionLocalId, fromLocal);
  }
  if (!detail) return null;
  const fromDetail = buildPersistedSupportExport({ layPoints: layPointsFromDetail(detail), markers: markersFromDetail(detail), run: runFromDetail(detail) });
  return fromDetail ? withBackgroundLayDiagnostics(sessionLocalId, fromDetail) : null;
}

/** Was kann geteilt werden? Capture → `capture`; sonst verwertbare gelegte Linie → `persisted`; sonst `none`. */
export async function customerDiagnosticsAvailability(
  sessionLocalId: string, detail?: Record<string, any> | null,
): Promise<CustomerDiagnosticsAvailability> {
  try {
    if (await hasSupportDiagnostics(sessionLocalId).catch(() => false)) {
      // Index kann auf ein korruptes/entferntes Payload zeigen → dann nicht als Capture zählen.
      if (await buildSupportExportForSession(sessionLocalId).catch(() => null)) return 'capture';
    }
    return (await buildPersistedExportForSession(sessionLocalId, detail)) ? 'persisted' : 'none';
  } catch (e) {
    console.warn('[supportDiagnostics] availability', e);
    return 'none';
  }
}

export type ShareCustomerResult =
  | { ok: true; fileName: string; source: CustomerDiagnosticsSource }
  | { ok: false; reason: 'missing' | 'failed' };

/**
 * Teilen für Kunden: vorhandene Capture unverändert (bestehender Pfad), sonst Export aus
 * gespeicherten Daten. Schliesst der Nutzer das Share-Sheet, ist das kein Fehler. Gibt nie
 * eine Exception an die UI weiter.
 */
export async function shareCustomerDiagnostics(
  sessionLocalId: string, detail?: Record<string, any> | null,
): Promise<ShareCustomerResult> {
  try {
    const capture = await buildSupportExportForSession(sessionLocalId).catch(() => null);
    const exported: SupportExport | PersistedSupportExport | null = capture ?? await buildPersistedExportForSession(sessionLocalId, detail);
    if (!exported) return { ok: false, reason: 'missing' };
    const fileName = supportExportFileName();
    await shareJsonFile(serializeSupportExport(exported), fileName, 'Diagnosedaten teilen');
    return { ok: true, fileName, source: capture ? 'capture' : 'persisted' };
  } catch (e) {
    console.warn('[supportDiagnostics] customer share failed', e);
    return { ok: false, reason: 'failed' };
  }
}
