// QA-Export: Sessions auflisten, Export bauen, Datei teilen.
//
// Reines Lesen aus der lokalen Datenbank plus Datei-/Teilen-Handling. Kein
// Eingriff in Erkennung, Aufzeichnung, Sync oder Persistenz — es wird nichts
// geschrieben und nichts gelöscht.

import * as Sharing from 'expo-sharing';
import {
  getLayTrackPointsBySession, getTrackMarkersBySession,
} from '@/features/tracking/repositories/localTrackRepository';
import { getLocalTrainingSessions } from '@/features/training/repositories/localTrainingRepository';
import { loadQaSessionCapture } from '@/features/tracking/utils/qaSessionCapture';
import { loadQaSearchCapture } from '@/features/tracking/utils/qaSearchCapture';
import {
  buildQaTrackExport, serializeQaTrackExport, qaExportFileName, assertNoAbsoluteData, hashSessionId,
  type QaTrackExport,
} from '@/features/tracking/utils/qaTrackExport';

export interface QaSessionSummary {
  localId: string;
  /**
   * Gehashte QA-Session-ID — EXAKT die `sessionId`, die der Export dieser Zeile
   * trägt (hashSessionId(localId)). Macht Zeile ↔ Datei eindeutig zuordenbar,
   * ohne die rohe UUID anzuzeigen.
   */
  qaId: string;
  /** ISO-String des Starts — nur für die Auswahlliste, nicht im Export. */
  startedAt: string | null;
  durationSeconds: number | null;
  /** Anzahl gelegter Punkte (lay). */
  layPointCount: number;
  /** Beim Legen finalisierte Distanz (payload_json.distanceMeters) — nur gelesen, nicht neu berechnet; null, wenn nicht vorhanden. */
  distanceM: number | null;
}

/** Distanz aus dem beim Finalize gespeicherten payload_json lesen (keine Neuberechnung). */
function distanceFromPayload(payloadJson: string | null | undefined): number | null {
  if (!payloadJson) return null;
  try {
    const v = (JSON.parse(payloadJson) as { distanceMeters?: unknown }).distanceMeters;
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch { return null; }
}

/**
 * Auswahl nach einem Listen-Refresh abgleichen: bleibt erhalten, wenn die
 * Session noch in der Liste ist; sonst zurückgesetzt (nie still auf eine andere
 * Session springen). Reine Funktion.
 */
export function reconcileQaSelection(prev: string | null, sessions: readonly QaSessionSummary[]): string | null {
  if (prev == null) return null;
  return sessions.some(q => q.localId === prev) ? prev : null;
}

/**
 * Anzeigezeile einer Session (Testmodus): lokales Datum + Uhrzeit, Punkte,
 * Distanz (falls vorhanden) und die kurze QA-Kennung. Reine Funktion.
 */
export function formatQaSessionRow(q: QaSessionSummary): string {
  const parts: string[] = [];
  if (q.startedAt) {
    const d = new Date(q.startedAt);
    if (!Number.isNaN(d.getTime())) {
      const p2 = (n: number) => String(n).padStart(2, '0');
      parts.push(`${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`);
    }
  }
  parts.push(`${q.layPointCount} Punkte`);
  if (q.distanceM != null) parts.push(`${Math.round(q.distanceM)} m`);
  parts.push(q.qaId);
  return parts.join(' · ');
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
      qaId: hashSessionId(s.local_id),
      startedAt: s.started_at ?? s.created_at ?? null,
      durationSeconds: s.duration_seconds ?? null,
      layPointCount: points.length,
      distanceM: distanceFromPayload(s.payload_json),
    });
  }
  return out;
}

/**
 * Baut den anonymisierten Export EINER Session.
 *
 * Der QA-Mitschnitt (Detektor-Puffer, Rohfixe, Marker-Herkunft) kommt aus einem
 * getrennten QA-Bereich und ist optional: fehlt er — QA-Modus war beim Legen
 * aus, oder die Session stammt aus der Zeit davor —, bleibt der Export gültig
 * und meldet das ehrlich über `qaCaptureAvailable: false`, statt fehlende
 * Werte zu erfinden.
 */
export async function buildExportForSession(localId: string): Promise<QaTrackExport> {
  const [points, markers, capture, search] = await Promise.all([
    getLayTrackPointsBySession(localId),
    getTrackMarkersBySession(localId).catch(() => []),
    loadQaSessionCapture(localId).catch(() => null),
    loadQaSearchCapture(localId).catch(() => null),
  ]);
  const exported = buildQaTrackExport(localId, points, markers, capture, search);
  // Sicherheitsnetz vor jeder Weitergabe: lieber kein Export als ein Leck.
  assertNoAbsoluteData(exported);
  return exported;
}

/**
 * Schreibt den Export in eine temporäre Datei und öffnet das native
 * Teilen-Menü. Gibt den Dateinamen zurück.
 */
export async function shareQaExport(exported: QaTrackExport, opts?: { startedAt?: string | null }): Promise<string> {
  assertNoAbsoluteData(exported);

  // expo-sharing exportiert AUSSCHLIESSLICH benannte Funktionen
  // (`isAvailableAsync`, `shareAsync`) — es gibt keinen Default-Export.
  // Ein `const { default: Sharing } = await import('expo-sharing')` liefert
  // deshalb `undefined` und scheitert auf dem Gerät mit
  // "Cannot read property 'isAvailableAsync' of undefined". Deshalb ein
  // Namespace-Import plus ausdrückliche Prüfung, bevor irgendetwas
  // geschrieben wird.
  if (
    !Sharing
    || typeof Sharing.isAvailableAsync !== 'function'
    || typeof Sharing.shareAsync !== 'function'
  ) {
    throw new Error('Teilen ist in diesem App-Build nicht verfügbar.');
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Teilen ist auf diesem Gerät nicht verfügbar. Nutze stattdessen „Kopieren".');
  }

  // Dateiname mit Sessionstart (Datum/Uhrzeit) aus der Listenzeile — der JSON-Inhalt bleibt identisch.
  const name = qaExportFileName(exported, opts?.startedAt);
  const json = serializeQaTrackExport(exported);

  const FileSystem = await import('expo-file-system/legacy');
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) throw new Error('Kein beschreibbares Verzeichnis verfügbar.');
  const uri = `${dir}${name}`;
  await FileSystem.writeAsStringAsync(uri, json);

  await Sharing.shareAsync(uri, {
    dialogTitle: 'Fährten-QA-Export',
    mimeType: 'application/json',
    UTI: 'public.json',
  });
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
