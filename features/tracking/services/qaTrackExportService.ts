// QA-Export: Sessions auflisten, Export bauen, Datei teilen.
//
// Reines Lesen aus der lokalen Datenbank plus Datei-/Teilen-Handling. Kein
// Eingriff in Erkennung, Aufzeichnung, Sync oder Persistenz — es wird nichts
// geschrieben und nichts gelöscht.

import {
  getLayTrackPointsBySession, getTrackMarkersBySession,
} from '@/features/tracking/repositories/localTrackRepository';
import { getLocalTrainingSessions } from '@/features/training/repositories/localTrainingRepository';
import {
  buildQaTrackExport, serializeQaTrackExport, qaExportFileName, assertNoAbsoluteData,
  type QaTrackExport,
} from '@/features/tracking/utils/qaTrackExport';

export interface QaSessionSummary {
  localId: string;
  /** ISO-String des Starts — nur für die Auswahlliste, nicht im Export. */
  startedAt: string | null;
  durationSeconds: number | null;
  /** Anzahl gelegter Punkte (lay). */
  layPointCount: number;
}

/**
 * Die letzten gelegten Fährten dieses Nutzers, neueste zuerst. Sessions ohne
 * Lege-Punkte werden ausgelassen — die wären für eine Regression wertlos.
 */
export async function listRecentLaySessions(ownerId: string, limit = 5): Promise<QaSessionSummary[]> {
  const sessions = await getLocalTrainingSessions(ownerId, { type: 'track' }).catch(() => []);
  const out: QaSessionSummary[] = [];
  for (const s of sessions) {
    if (out.length >= limit) break;
    const points = await getLayTrackPointsBySession(s.local_id).catch(() => []);
    if (!points.length) continue;
    out.push({
      localId: s.local_id,
      startedAt: s.started_at ?? s.created_at ?? null,
      durationSeconds: s.duration_seconds ?? null,
      layPointCount: points.length,
    });
  }
  return out;
}

/** Baut den anonymisierten Export EINER Session. */
export async function buildExportForSession(localId: string): Promise<QaTrackExport> {
  const [points, markers] = await Promise.all([
    getLayTrackPointsBySession(localId),
    getTrackMarkersBySession(localId).catch(() => []),
  ]);
  const exported = buildQaTrackExport(localId, points, markers);
  // Sicherheitsnetz vor jeder Weitergabe: lieber kein Export als ein Leck.
  assertNoAbsoluteData(exported);
  return exported;
}

/**
 * Schreibt den Export in eine temporäre Datei und öffnet das native
 * Teilen-Menü. Gibt den Dateinamen zurück.
 */
export async function shareQaExport(exported: QaTrackExport): Promise<string> {
  assertNoAbsoluteData(exported);
  const name = qaExportFileName(exported);
  const json = serializeQaTrackExport(exported);

  const FileSystem = await import('expo-file-system/legacy');
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('Kein beschreibbares Verzeichnis verfügbar.');
  const uri = `${dir}${name}`;
  await FileSystem.writeAsStringAsync(uri, json);

  const { default: Sharing } = await import('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { dialogTitle: 'Fährten-QA-Export', mimeType: 'application/json', UTI: 'public.json' });
  }
  return name;
}

/** Kleinere Exporte lassen sich auch direkt kopieren. */
export async function copyQaExport(exported: QaTrackExport): Promise<number> {
  assertNoAbsoluteData(exported);
  const json = serializeQaTrackExport(exported);
  const Clipboard = await import('expo-clipboard');
  await Clipboard.setStringAsync(json);
  return json.length;
}
