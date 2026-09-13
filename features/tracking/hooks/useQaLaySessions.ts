// ──────────────────────────────────────────────────────────────────────────
// Sessionliste des Fährten-QA-Exports (Diagnose-Screen), fokus-aktuell.
//
// Root Cause (Feldtest 13.09.): die Liste wurde nur beim Mount geladen. Bleibt
// der Diagnose-Screen im Navigation-Stack gemountet, während eine Fährte gelegt
// wird, zeigte „Letzte gelegte Fährte" danach weiterhin die Vortagessession —
// während das Kandidaten-Log (In-Memory, live) bereits die neue Aufnahme
// zeigte. Folge: Export der falschen Session (qa-03c3b097 statt der langen
// Fährte).
//
// Hier: bei JEDEM Fokus des Screens (expo-router useFocusEffect — dasselbe
// Muster wie app/sync.tsx, app/unit/stats.tsx) aus SQLite neu laden. Kein
// Polling, kein Timer, kein Netz. Späte Antworten älterer Ladevorgänge werden
// verworfen (Request-Zähler), damit nie eine ältere Liste eine neuere ersetzt.
// ──────────────────────────────────────────────────────────────────────────
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { listRecentLaySessions, type QaSessionSummary } from '@/features/tracking/services/qaTrackExportService';

export interface QaLaySessions {
  sessions: QaSessionSummary[];
  /** Manuell neu laden (z. B. nach einem Export). */
  reload: () => Promise<void>;
}

export function useQaLaySessions(ownerId: string | null | undefined, limit = 5): QaLaySessions {
  const [sessions, setSessions] = useState<QaSessionSummary[]>([]);
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const req = ++requestRef.current;
    if (!ownerId) { setSessions([]); return; }
    let next: QaSessionSummary[] = [];
    try { next = await listRecentLaySessions(ownerId, limit); } catch { next = []; }
    if (req === requestRef.current) setSessions(next);   // nur die jüngste Anfrage schreibt
  }, [ownerId, limit]);

  // Initialer Fokus (Mount) UND jede Rückkehr auf den Screen.
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  return { sessions, reload };
}
