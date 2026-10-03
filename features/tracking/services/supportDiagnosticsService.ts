// Support-Diagnose teilen: lokal gespeichertes, privacy-reduced Payload → JSON-Datei → natives Share-Sheet.
//
// Reines Lesen aus lokaler Persistenz (AsyncStorage + lokale SQLite-Marker/Punkte). Kein Backend,
// kein Upload, keine Netzwerkverbindung nötig. Kein Eingriff in Erkennung, Aufzeichnung oder Sync.
import {
  getLayTrackPointsBySession, getTrackMarkersBySession,
} from '@/features/tracking/repositories/localTrackRepository';
import { hasQaSearchCapture, loadQaSearchCapture } from '@/features/tracking/utils/qaSearchCapture';
import {
  buildSupportExport, isUsableSupportCapture, serializeSupportExport, supportExportFileName,
  type SupportExport,
} from '@/features/tracking/utils/supportDiagnostics';
import { shareJsonFile } from '@/features/tracking/services/qaTrackExportService';

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
  return buildSupportExport(points, markers, search);
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
