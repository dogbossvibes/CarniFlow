import { loadDocumentDraft, saveDocumentDraft } from './draft';

export type FocusStatus = 'open' | 'practice' | 'done';
export interface TrainingFocus {
  id: string;
  dogId: string;
  discipline: string;
  exerciseKey?: string;
  exerciseName?: string;
  originUnitId: string;
  originDate: string;
  originText: string;
  text: string;
  status: FocusStatus;
}
const queue = new Map<string, Promise<unknown>>();
const keyFor = (owner: string) => `training_focus_device_v1:${encodeURIComponent(owner)}`;
// Device-only companion data. No backend field, shared trainer data or
// historical training note is changed by a focus status transition.
export async function readTrainingFocuses(owner: string): Promise<TrainingFocus[]> {
  if (!owner) return [];
  await queue.get(owner)?.catch(() => {});
  const data = await loadDocumentDraft<TrainingFocus[]>(keyFor(owner));
  if (data == null) return [];
  if (!Array.isArray(data) || !data.every(f => f && typeof f.id === 'string' && typeof f.dogId === 'string'
    && typeof f.discipline === 'string' && typeof f.originUnitId === 'string' && typeof f.originDate === 'string'
    && typeof f.text === 'string' && typeof f.originText === 'string' && ['open', 'practice', 'done'].includes(f.status))) {
    throw new Error('Invalid training focus data');
  }
  return data;
}
function mutate(owner: string, change: (all: TrainingFocus[]) => TrainingFocus[], isCurrent: () => boolean = () => true): Promise<void> {
  if (!owner) return Promise.reject(new Error('Missing focus owner'));
  const task = (queue.get(owner) ?? Promise.resolve()).catch(() => {}).then(async () => {
    if (!isCurrent()) throw new Error('Focus identity changed');
    // Do not wait on our own queue entry.
    const data = await loadDocumentDraft<TrainingFocus[]>(keyFor(owner));
    const all = data ?? [];
    if (!Array.isArray(all)) throw new Error('Invalid training focus data');
    if (!isCurrent()) throw new Error('Focus identity changed');
    await saveDocumentDraft(keyFor(owner), change(all));
  });
  queue.set(owner, task);
  void task.finally(() => { if (queue.get(owner) === task) queue.delete(owner); }).catch(() => {});
  return task;
}
export function addTrainingFocuses(owner: string, additions: TrainingFocus[], isCurrent?: () => boolean): Promise<void> {
  return mutate(owner, all => [...all, ...additions.filter(f => f.text.trim() && !all.some(old => old.id === f.id))], isCurrent);
}
export function setTrainingFocusStatus(owner: string, id: string, status: FocusStatus, isCurrent?: () => boolean): Promise<void> {
  if (!['open', 'practice', 'done'].includes(status)) return Promise.reject(new Error('Invalid focus status'));
  return mutate(owner, all => all.map(f => f.id === id ? { ...f, status } : f), isCurrent);
}
export function setTrainingFocusText(owner: string, id: string, text: string, isCurrent?: () => boolean): Promise<void> {
  if (!text.trim() || text.length > 500) return Promise.reject(new Error('Invalid focus text'));
  return mutate(owner, all => all.map(f => f.id === id ? { ...f, text } : f), isCurrent);
}
