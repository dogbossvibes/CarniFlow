import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { loadCoachDataset, fetchDismissedKeys } from '@/features/ai/services/insightService';
import { getHeatCycles } from '@/features/dogs/heatCycles';
import { recordedActiveCycle } from '@/features/dogs/heatJournal';
import { examBookAvailable, listExamsForDog } from '@/features/exam-book/store';
import { examDisplayName } from '@/features/exam-book/catalog';
import { buildCoachWeek, type CoachRuleId, type CoachWeek } from '@/features/ai/coachWeek';
import { buildCoachInput, examsFromBook, localToday, type CoachUnitRow } from '@/features/ai/coachWeek/input';
import {
  EMPTY_PREFS, dismissCoachSuggestion, loadCoachPrefs, loadDismissedCoachKeys, saveCoachPrefs, withRule, type CoachPrefs,
} from '@/features/ai/coachWeek/storage';
import type { Dog } from '@/types';

// Coach PR B: Wochenvorschlag für EINEN eigenen Hund. Gelesen wird nur, was die App ohnehin
// lädt (Trainings, eigene Fährten, Prüfungsbuch lokal, erfasste Läufigkeit). Berechnet auf
// dem Gerät; nichts davon geht an einen KI-Dienst. Fremde/geteilte Hunde: kein Vorschlag.

type CoachDog = Pick<Dog, 'id' | 'owner_id' | 'birth_date' | 'discipline' | 'gender'>;
export interface CoachWeekState { week: CoachWeek | null; prefs: CoachPrefs }

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
      const [ds, serverKeys, prefs, cycles, examRows] = await Promise.all([
        loadCoachDataset(uid!, dog!.id),
        fetchDismissedKeys(uid!),
        loadCoachPrefs(uid!),
        dog!.gender === 'female' ? getHeatCycles(dog!.id).catch(() => []) : Promise.resolve([]),
        examBookAvailable() ? listExamsForDog(uid!, dog!.id).catch(() => []) : Promise.resolve([]),
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
      return { week: buildCoachWeek(input, { isPro }), prefs };
    },
  });

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['coachWeek', uid] }), [qc, uid]);

  const dismiss = useCallback(async (key: string) => {
    if (!uid || !dog) return;
    await dismissCoachSuggestion(uid, dog.id, key);
    await refresh();
  }, [uid, dog, refresh]);

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
    dismiss, setRule, setHiddenInProfile, enableAllRules, refresh,
  };
}
