import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { ExamResult } from './model';
import { examBookAvailable, listConflictIds, listExamsForDog, listPendingIds } from './store';
import { refreshExamBook, syncExamBook } from './sync';

// Lädt das Prüfungsbuch eines eigenen Hundes: zuerst sofort lokal (offline),
// danach im Hintergrund Serverstand nachladen und Wartendes hochladen.
// Lokale Eingaben gehen dabei nie verloren (siehe store.ts / sync.ts).
export function useExamBook(ownerId: string, dogId: string) {
  const [exams, setExams] = useState<ExamResult[]>([]);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const readLocal = useCallback(async () => {
    if (!ownerId || !dogId || !examBookAvailable()) { setExams([]); setConflicts(new Set()); setPending(new Set()); setLoading(false); return; }
    const [list, conflictIds, pendingIds] = await Promise.all([
      listExamsForDog(ownerId, dogId).catch(() => [] as ExamResult[]),
      listConflictIds(ownerId, dogId).catch(() => [] as string[]),
      listPendingIds(ownerId, dogId).catch(() => [] as string[]),
    ]);
    if (!alive.current) return;
    setExams(list);
    setConflicts(new Set(conflictIds));
    setPending(new Set(pendingIds));
    setLoading(false);
  }, [ownerId, dogId]);

  const reload = useCallback(async () => {
    await readLocal();
    if (!ownerId || !dogId || !examBookAvailable()) return;
    // Hintergrund: hochladen, nachladen, lokal neu lesen. Wirft nie.
    await syncExamBook(ownerId).catch(() => undefined);
    await refreshExamBook(ownerId, dogId).catch(() => false);
    await readLocal();
  }, [ownerId, dogId, readLocal]);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  return { exams, conflicts, pending, loading, reload, readLocal, available: examBookAvailable() };
}
