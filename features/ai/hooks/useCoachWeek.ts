import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { loadCoachDataset, fetchDismissedKeys } from '@/features/ai/services/insightService';
import { getHeatCycles } from '@/features/dogs/heatCycles';
import { recordedActiveCycle } from '@/features/dogs/heatJournal';
import { examBookAvailable, listExamsForDog } from '@/features/exam-book/store';
import { examDisplayName } from '@/features/exam-book/catalog';
import { buildCoachWeek, type CoachRuleId, type CoachSuggestion, type CoachWeek } from '@/features/ai/coachWeek';
import { coachEventDraft, isPlanned, plannedKeys } from '@/features/ai/coachWeek/calendar';
import { createOwnEvent, getCalendarEvents } from '@/services/calendarService';
import type { CalendarEvent } from '@/types/calendar';
import { buildCoachInput, examsFromBook, localToday, type CoachUnitRow } from '@/features/ai/coachWeek/input';
import {
  EMPTY_PREFS, dismissCoachSuggestion, loadCoachPrefs, loadDismissedCoachKeys, loadPlannedCoachEvents, rememberPlannedCoachEvent,
  saveCoachPrefs, withRule, type CoachPrefs,
} from '@/features/ai/coachWeek/storage';
import type { Dog } from '@/types';

// Coach PR B: Wochenvorschlag für EINEN eigenen Hund. Gelesen wird nur, was die App ohnehin
// lädt (Trainings, eigene Fährten, Prüfungsbuch lokal, erfasste Läufigkeit). Berechnet auf
// dem Gerät; nichts davon geht an einen KI-Dienst. Fremde/geteilte Hunde: kein Vorschlag.

type CoachDog = Pick<Dog, 'id' | 'owner_id' | 'birth_date' | 'discipline' | 'gender'>;
export interface CoachWeekState { week: CoachWeek | null; prefs: CoachPrefs; planned: string[] }
export interface CoachTakeOverItem { suggestion: CoachSuggestion; title: string; notes: string }
export interface CoachTakeOverResult { created: number; skipped: number; failed: number }

/** Termine frisch lesen; bei Fehler null (dann wird nichts angelegt, um Doppel zu vermeiden). */
async function readEvents(uid: string): Promise<CalendarEvent[] | null> {
  try {
    const { data, error } = await getCalendarEvents(uid);
    return error ? null : ((data ?? []) as CalendarEvent[]).filter(e => e.owner_id === uid);
  } catch { return null; }
}

export function useCoachWeek(dog: CoachDog | null | undefined, isPro: boolean) {
  const { session } = useSession();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const own = !!dog && !!uid && dog.owner_id === uid;
  const queryKey = ['coachWeek', uid, dog?.id ?? null, isPro];

  const q = useQuery<CoachWeekState, Error>({
    queryKey,
    enabled: own,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const today = localToday();
      const [ds, serverKeys, prefs, cycles, examRows, events, remembered] = await Promise.all([
        loadCoachDataset(uid!, dog!.id),
        fetchDismissedKeys(uid!),
        loadCoachPrefs(uid!),
        dog!.gender === 'female' ? getHeatCycles(dog!.id).catch(() => []) : Promise.resolve([]),
        examBookAvailable() ? listExamsForDog(uid!, dog!.id).catch(() => []) : Promise.resolve([]),
        readEvents(uid!),
        loadPlannedCoachEvents(uid!),
      ]);
      const dismissedKeys = await loadDismissedCoachKeys(uid!, serverKeys);
      const exams = examsFromBook(examRows, today, r => examDisplayName(r.exam_type, r.exam_level, r.exam_type_label));
      const input = buildCoachInput({
        today,
        dog: { id: dog!.id, birth_date: dog!.birth_date, discipline: dog!.discipline },
        units: ds.units as unknown as CoachUnitRow[],
        trackRows: ds.tracks as Record<string, unknown>[],
        exams,
        // Nur erfasste Läufigkeit; ohne Einträge keine Annahme (null).
        inHeat: dog!.gender === 'female' && cycles.length ? recordedActiveCycle(cycles, today) != null : null,
        dismissedKeys,
        disabledRules: prefs.disabledRules[dog!.id] ?? [],
      });
      const week = buildCoachWeek(input, { isPro });
      return { week, prefs, planned: plannedKeys(week.suggestions, dog!.id, events ?? [], remembered) };
    },
  });

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['coachWeek', uid] }), [qc, uid]);

  const dismiss = useCallback(async (key: string) => {
    if (!uid || !dog) return;
    await dismissCoachSuggestion(uid, dog.id, key);
    await refresh();
  }, [uid, dog, refresh]);

  // Übernehmen: nacheinander, mit frisch gelesenen Terminen; schon Geplantes wird übersprungen.
  // Sperre gegen Doppeltippen. Bestehende Termine werden nie verändert.
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const takeOver = useCallback(async (items: readonly CoachTakeOverItem[]): Promise<CoachTakeOverResult> => {
    const result: CoachTakeOverResult = { created: 0, skipped: 0, failed: 0 };
    if (!uid || !dog || dog.owner_id !== uid || busyRef.current || items.length === 0) return { ...result, skipped: items.length };
    busyRef.current = true; setBusy(true);
    try {
      const events = await readEvents(uid);
      if (!events) return { ...result, failed: items.length };
      const remembered = await loadPlannedCoachEvents(uid);
      for (const it of items) {
        if (isPlanned(it.suggestion, dog.id, events, remembered)) { result.skipped += 1; continue; }
        const res = await createOwnEvent(uid, coachEventDraft(it.suggestion, dog.id, { title: it.title, notes: it.notes }));
        const created = res.data as CalendarEvent | null;
        if (res.error || !created) { result.failed += 1; continue; }
        events.push(created);
        remembered[it.suggestion.key] = created.id;
        await rememberPlannedCoachEvent(uid, it.suggestion.key, created.id);
        result.created += 1;
      }
      return result;
    } finally {
      busyRef.current = false; setBusy(false);
      await refresh();
      void qc.invalidateQueries({ queryKey: ['calendar', uid] });
    }
  }, [uid, dog, refresh, qc]);

  const updatePrefs = useCallback(async (change: (p: CoachPrefs) => CoachPrefs) => {
    if (!uid) return;
    await saveCoachPrefs(uid, change(await loadCoachPrefs(uid)));
    await refresh();
  }, [uid, refresh]);

  const setRule = useCallback((rule: CoachRuleId, enabled: boolean) =>
    dog ? updatePrefs(p => withRule(p, dog.id, rule, enabled)) : Promise.resolve(), [dog, updatePrefs]);
  const setHiddenInProfile = useCallback((hidden: boolean) =>
    updatePrefs(p => ({ ...p, hiddenInProfile: hidden })), [updatePrefs]);
  const enableAllRules = useCallback(() =>
    dog ? updatePrefs(p => { const d = { ...p.disabledRules }; delete d[dog.id]; return { ...p, disabledRules: d }; }) : Promise.resolve(), [dog, updatePrefs]);

  return {
    week: own ? q.data?.week ?? null : null,
    prefs: q.data?.prefs ?? EMPTY_PREFS,
    isLoading: own && q.isPending,
    own,
    planned: q.data?.planned ?? [],
    busy, takeOver,
    dismiss, setRule, setHiddenInProfile, enableAllRules, refresh,
  };
}
