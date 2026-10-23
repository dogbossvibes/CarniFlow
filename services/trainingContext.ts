import { loadTrainingPreparation } from './trainingPreparation';
import { planTemplate, type TemplateChoice } from '@/features/training/documentation/template';

export interface TrainingContextScope {
  ownerId: string;
  dogId: string;
  discipline: string;
}

// Ephemeral provenance only: no audio, media, location or copied observations.
export interface TrainingSourceReference {
  kind: 'unit' | 'session';
  originalId: string;
  viewId: string;
  sourceDate: string;
}

export interface TrainingSourceContext {
  scope: TrainingContextScope;
  loadedAt: string;
  limited: boolean;
  sources: TrainingSourceReference[];
}

export async function loadTrainingContext(scope: TrainingContextScope, current: () => boolean) {
  const captured = { ...scope };
  if (!captured.ownerId || !captured.dogId || !captured.discipline || !current()) throw new Error('Training context unavailable');
  // Reuse the existing owner/dog/discipline filters, legacy normalization and limit.
  const result = await loadTrainingPreparation(captured.ownerId, captured.dogId, captured.discipline);
  if (!current()) throw new Error('Training context changed');
  const context: TrainingSourceContext = {
    scope: captured, loadedAt: new Date().toISOString(), limited: result.limited,
    sources: result.units.map(unit => ({ kind: unit.historySource, originalId: unit.originalId,
      viewId: unit.id, sourceDate: unit.session_date })),
  };
  return { ...result, context };
}

// A visible historical row is not authority to reuse a stale/deleted source.
// Reload before planning; this prepares a draft only and never saves anything.
export async function prepareTrainingHistoryDraft(
  sourceViewId: string, choice: TemplateChoice, uuid: () => string, current: () => boolean,
) {
  // Capture caller-owned arrays before any await, including owner and dog scope.
  const captured = { ...choice, exercises: [...choice.exercises], focuses: [...choice.focuses] };
  // Focus selection has its own existing validated template path.
  if (captured.focuses.length) throw new Error('Use the template focus selection');
  const loaded = await loadTrainingContext({ ownerId: captured.owner, dogId: captured.dog, discipline: captured.discipline }, current);
  const refs = loaded.context.sources.filter(source => source.viewId === sourceViewId);
  const units = loaded.units.filter(unit => unit.id === sourceViewId);
  if (!current() || refs.length !== 1 || units.length !== 1) throw new Error('Training source unavailable');
  const plan = planTemplate(units[0], loaded.context.scope.ownerId, captured, [], uuid);
  if (!current()) throw new Error('Training context changed');
  return { ...plan, source: refs[0], loadedAt: loaded.context.loadedAt, limited: loaded.context.limited };
}
