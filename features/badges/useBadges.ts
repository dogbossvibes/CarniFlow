import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import type { FeedItem } from '@/services/trainingFeed';
import { listExamsForDog } from '@/features/exam-book/store';
import {
  activityFromFeedItem, computeBadges, examFromResult, mergeSeen, newlyEarned, sanitizeSeen,
  type BadgeActivity, type BadgeExam, type BadgeSummary, type SeenTiers,
} from './model';

// Liest nur vorhandene Daten: den gecachten Trainings-Feed und das lokale
// Prüfungsbuch. Schreibt einzig die lokale Anzeigehilfe «schon gesehen»
// (AsyncStorage, pro Person), nie Kundendaten.

const seenKey = (userId: string) => `anyvo.badges.seen.v1.${userId}`;

export async function readSeenTiers(userId: string): Promise<SeenTiers | null> {
  try {
    const raw = await AsyncStorage.getItem(seenKey(userId));
    return sanitizeSeen(raw ? JSON.parse(raw) : null);
  } catch { return null; }
}

async function writeSeenTiers(userId: string, seen: SeenTiers): Promise<void> {
  try { await AsyncStorage.setItem(seenKey(userId), JSON.stringify(seen)); } catch { /* best-effort */ }
}

/**
 * Feed und Hunde kommen vom aufrufenden Bildschirm (dort ohnehin geladen),
 * damit keine zusätzlichen Abfragen entstehen.
 */
export function useBadges({ feed, dogIds: dogIdList, dogId = null }: {
  feed: readonly FeedItem[]; dogIds: readonly string[]; dogId?: string | null;
}) {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [exams, setExams] = useState<BadgeExam[]>([]);
  const [seen, setSeen] = useState<SeenTiers | null | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const dogIds = useMemo(() => [...dogIdList].sort().join(','), [dogIdList]);

  const loadExams = useCallback(async () => {
    if (!userId) { setExams([]); return; }
    const ids = dogIds ? dogIds.split(',') : [];
    const lists = await Promise.all(ids.map(id => listExamsForDog(userId, id).catch(() => [])));
    if (alive.current) setExams(lists.flat().map(examFromResult));
  }, [userId, dogIds]);

  const loadSeen = useCallback(async () => {
    if (!userId) { setSeen(null); return; }
    const s = await readSeenTiers(userId);
    if (alive.current) setSeen(s);
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void loadExams();
    void loadSeen();
  }, [loadExams, loadSeen]));

  const activities = useMemo<BadgeActivity[]>(
    () => feed.map(activityFromFeedItem).filter((a): a is BadgeActivity => !!a),
    [feed],
  );
  const summary = useMemo<BadgeSummary>(() => computeBadges(activities, exams, { dogId }), [activities, exams, dogId]);
  // «Neu» immer über alle Hunde, damit ein Hundefilter nichts als gesehen markiert.
  const overall = useMemo<BadgeSummary>(
    () => (dogId ? computeBadges(activities, exams) : summary), [activities, exams, dogId, summary]);
  const fresh = useMemo(
    () => (seen === undefined ? [] : newlyEarned(overall.badges, seen)), [overall, seen]);

  const markSeen = useCallback(() => {
    if (!userId || seen === undefined) return;
    const next = mergeSeen(seen, overall.badges);
    setSeen(next);
    void writeSeenTiers(userId, next);
  }, [userId, seen, overall]);

  return {
    summary,
    fresh,
    hasActivity: activities.length > 0 || exams.length > 0,
    markSeen,
    reloadExams: loadExams,
  };
}
