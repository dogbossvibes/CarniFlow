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

export async function loadDogTrainingSummary(owner: string, dog: string, today = new Date()) {
  const [units, sessions, focuses] = await Promise.all([
    getTrainingUnits(owner, dog).limit(UNIT_LIMIT),
    getTrainingSessions(owner, dog).or('type.is.null,type.neq.track').limit(SESSION_LIMIT),
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
  // Hinweise sind ergänzend: ein Fehler dort verdeckt das letzte Training nicht.
  return summarizeTraining(merged, focuses.error ? [] : focuses.data ?? [], today);
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
