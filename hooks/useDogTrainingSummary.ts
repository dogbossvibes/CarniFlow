import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/useSession';
import { getTrainingUnits } from '@/services/trainingUnitService';
import { getTrainingSessions } from '@/services/training';
import { sessionToFeedItem } from '@/services/trainingFeed';
import { listServerTrainingFocuses } from '@/services/trainingDocumentService';
import { summarizeTraining, type SummaryUnit } from '@/features/training/continue/summary';
import type { TrainingUnit } from '@/types/trainingUnit';
import type { TrainingSession } from '@/types';

// Trainingsdoku neu, Etappe 2 (T-184): lädt das letzte Training eines Hundes
// NUR LESEND (neue Einheiten + alte Sessions ohne Fährten + offene Hinweise).
// Der Query-Key enthält Konto und Hund – eine späte Antwort kann daher nie
// beim falschen Hund erscheinen.
// Angezeigt werden das letzte + 3 frühere Trainings; für den Trend wird der
// Vorgänger einer Übung in bis zu 12 neuen Einheiten gesucht.
const UNIT_LIMIT = 12;
const SESSION_LIMIT = 4;

export async function loadDogTrainingData(owner: string, dog: string, unitLimit = UNIT_LIMIT, sessionLimit = SESSION_LIMIT) {
  const [units, sessions, focuses] = await Promise.all([
    getTrainingUnits(owner, dog).limit(unitLimit),
    getTrainingSessions(owner, dog).or('type.is.null,type.neq.track').limit(sessionLimit),
    listServerTrainingFocuses(owner, dog),
  ]);
  if (units.error || sessions.error) throw units.error || sessions.error;
  const legacy = ((sessions.data ?? []) as (TrainingSession & { type?: string })[])
    .filter(session => session.type !== 'track')
    .map(session => ({ ...sessionToFeedItem(session), source: 'session' as const }));
  const merged: SummaryUnit[] = [
    ...((units.data ?? []) as TrainingUnit[]).filter(u => u.owner_id === owner && u.dog_id === dog).map(u => ({ ...u, source: 'unit' as const })),
    ...legacy.filter(u => u.owner_id === owner && u.dog_id === dog),
  ];
  // Hinweise sind ergänzend: ein Fehler dort verdeckt die Trainings nicht.
  return { units: merged, focuses: focuses.error ? [] : focuses.data ?? [] };
}

export async function loadDogTrainingSummary(owner: string, dog: string, today = new Date()) {
  const { units, focuses } = await loadDogTrainingData(owner, dog);
  return summarizeTraining(units, focuses, today);
}

export function useDogTrainingSummary(dogId: string | null | undefined) {
  const { session } = useSession();
  const owner = session?.user.id;
  return useQuery({
    queryKey: ['dogTrainingSummary', owner, dogId],
    queryFn: () => loadDogTrainingSummary(owner!, dogId!),
    enabled: !!owner && !!dogId,
    staleTime: 30_000,
  });
}

// Etappe 3 (Verlauf): grösseres Fenster. Der Key beginnt mit 'dogTrainingSummary',
// damit Speichern/Löschen (invalidateQueries auf diesen Präfix) ihn mit aktualisiert.
export const HISTORY_UNIT_LIMIT = 40;
export const HISTORY_SESSION_LIMIT = 15;

const dayOf = (u: SummaryUnit) => u.session_date.slice(0, 10);

/**
 * Lädt den Verlauf (nur lesend). Neue Einheiten und alte Sessions haben getrennte
 * Limits; hat eine Quelle ihr Limit erreicht, könnten ältere Einträge DIESER Quelle
 * fehlen. Damit keine stille Lücke entsteht, wird das gemeinsame Fenster beim
 * jüngsten „Abbruchtag“ der vollen Quellen gekappt (nichts wird gelöscht – ältere
 * Einträge bleiben in der Datenbank und in den bisherigen Ansichten).
 */
export async function loadDogTrainingHistory(owner: string, dog: string) {
  const { units, focuses } = await loadDogTrainingData(owner, dog, HISTORY_UNIT_LIMIT, HISTORY_SESSION_LIMIT);
  const oldest = (source: 'unit' | 'session', limit: number) => {
    const days = units.filter(u => (u.source ?? 'unit') === source).map(dayOf).sort();
    return days.length >= limit ? days[0] : null;
  };
  const cuts = [oldest('unit', HISTORY_UNIT_LIMIT), oldest('session', HISTORY_SESSION_LIMIT)].filter((d): d is string => !!d).sort();
  const cutoff = cuts.length ? cuts[cuts.length - 1] : null;
  return { units: cutoff ? units.filter(u => dayOf(u) >= cutoff) : units, focuses, truncated: !!cutoff };
}

export function useDogTrainingHistory(dogId: string | null | undefined) {
  const { session } = useSession();
  const owner = session?.user.id;
  return useQuery({
    queryKey: ['dogTrainingSummary', 'history', owner, dogId],
    queryFn: () => loadDogTrainingHistory(owner!, dogId!),
    enabled: !!owner && !!dogId,
    staleTime: 30_000,
  });
}
