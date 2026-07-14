import { createLocalSearchPointsBatch, type NewTrackPoint } from '@/features/tracking/repositories/localTrackRepository';

// ──────────────────────────────────────────────────────────────────────────
// Inkrementeller, gedrosselter Offline-Puffer der AKTIVEN Absuche (P1).
// Sammelt akzeptierte Suchpunkte und schreibt sie in Batches nach SQLite
// (point_type='search'), statt bei jedem GPS-Fix einen teuren Write auszulösen.
//
// Robustheit: Ein Persistenzfehler DARF die laufende Aufnahme NICHT stoppen —
// bei Fehler bleibt der Batch im Puffer (Re-Queue) und wird beim nächsten Flush
// erneut versucht. Fehler werden nur im DEV-Modus geloggt.
//
// Bewusst getrennt von trackPersist.ts (gelegte Spur, AsyncStorage-Snapshot).
// ──────────────────────────────────────────────────────────────────────────

const BATCH_SIZE = 25;   // ab so vielen gepufferten Punkten wird geflusht

let sessionId: string | null = null;
let buffer: NewTrackPoint[] = [];
let flushing = false;
let lastError: string | null = null;

// Neue Absuche: Puffer + Fehlerstatus zurücksetzen und Ziel-Session merken.
export function resetSearchBuffer(newSessionId: string): void {
  sessionId = newSessionId;
  buffer = [];
  lastError = null;
}

// Akzeptierten Suchpunkt puffern; ab BATCH_SIZE automatisch (best-effort) flushen.
export function enqueueSearchPoint(point: NewTrackPoint): void {
  buffer.push({ ...point, point_type: 'search' });
  if (buffer.length >= BATCH_SIZE) void flushSearchPoints();
}

// Gepufferte Punkte schreiben. Erfolg → Puffer leeren. Fehler → Batch behalten
// (Re-Queue) + DEV-Log; wirft NIE (die Aufnahme läuft weiter). Liefert true bei
// Erfolg/nichts-zu-tun, false bei Persistenzfehler.
export async function flushSearchPoints(): Promise<boolean> {
  if (flushing || buffer.length === 0 || !sessionId) return true;
  flushing = true;
  const batch = buffer;
  buffer = [];
  try {
    await createLocalSearchPointsBatch(sessionId, batch);
    lastError = null;
    return true;
  } catch (e) {
    // Aufnahme NICHT stoppen: Batch wieder vorn einreihen, beim nächsten Flush erneut.
    buffer = [...batch, ...buffer];
    lastError = e instanceof Error ? e.message : String(e);
    if (__DEV__) console.warn('[searchPersist] flush fehlgeschlagen (Aufnahme läuft weiter):', lastError);
    return false;
  } finally {
    flushing = false;
  }
}

// Letzter Persistenzfehler (für den Abschlussbericht / Diagnose). null = ok.
export function getSearchPersistError(): string | null {
  return lastError;
}

// Nur für Tests: internen Pufferstand einsehen.
export function _peekSearchBuffer(): { sessionId: string | null; count: number } {
  return { sessionId, count: buffer.length };
}
