import type { TrainingUnit } from '@/types/trainingUnit';
import type { TrainingSession } from '@/types';
import { getTrainingPreparationUnits } from './trainingUnitService';
import { getTrainingSessions } from './training';
import { sessionToFeedItem } from './trainingFeed';
import { relevantUnits } from '@/features/training/documentation/model';

export interface PreparationUnit extends TrainingUnit {
  historySource: 'unit' | 'session';
  originalId: string;
}

// Read-only adapters. Legacy identifiers are namespaced only in this view;
// reuse creates new exercise row IDs and never updates the old session.
export async function loadTrainingPreparation(owner: string, dog: string, discipline: string) {
  const [units, sessions] = await Promise.all([
    getTrainingPreparationUnits(owner, dog, discipline).limit(101),
    getTrainingSessions(owner, dog).eq('category', discipline)
      .or('type.is.null,type.neq.track').limit(101),
  ]);
  if (units.error || sessions.error) throw units.error || sessions.error;
  const normalized: PreparationUnit[] = [
    ...((units.data ?? []) as TrainingUnit[]).map(unit => ({ ...unit, historySource: 'unit' as const, originalId: unit.id })),
    ...((sessions.data ?? []) as (TrainingSession & { type?: string })[])
      .filter(session => session.type !== 'track')
      .map(session => {
        const item = sessionToFeedItem(session);
        return { ...item, id: `legacy-session:${session.id}`, historySource: 'session' as const, originalId: session.id,
          exercises: item.exercises?.map(exercise => ({ ...exercise, id: `legacy-exercise:${session.id}` })),
        };
      }),
  ];
  const matching = relevantUnits(normalized, owner, dog, discipline) as PreparationUnit[];
  return { units: matching.slice(0, 100), limited: matching.length > 100 || (units.data?.length ?? 0) > 100 || (sessions.data?.length ?? 0) > 100 };
}
