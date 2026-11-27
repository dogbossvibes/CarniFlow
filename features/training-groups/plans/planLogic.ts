import type { TranslationKey } from '@/i18n';
import type { PlanEntry, PlanStatus, PlanTrackKind, TrainingPlan, TrainingPlanDetail } from '@/features/tracking-exchange/groups/planService';

// Reine Anzeige- und Ablauflogik der Trainingspläne (Spec 04, PR B). Kein React, kein Netz.
// Die Rechte prüft der Server; hier wird nur entschieden, was angeboten wird.

export const STATUS_KEY: Record<PlanStatus, TranslationKey> = {
  draft: 'plans.statusDraft', published: 'plans.statusPublished', started: 'plans.statusStarted',
  done: 'plans.statusDone', cancelled: 'plans.statusCancelled',
};

export const KIND_KEY: Record<PlanTrackKind, TranslationKey> = {
  free: 'plans.kindFree', igp1: 'plans.kindIgp1', igp2: 'plans.kindIgp2', igp3: 'plans.kindIgp3',
  ifh1: 'plans.kindIfh1', ifh2: 'plans.kindIfh2', igpfh: 'plans.kindIgpfh', fh: 'plans.kindFh', mantrail: 'plans.kindMantrail',
};

/** Startliste ändern geht bis zum Abschluss; Zusagen nur bei veröffentlichtem oder laufendem Plan. */
export const canEditEntries = (s: PlanStatus) => s === 'draft' || s === 'published' || s === 'started';
export const canEditPlan = (s: PlanStatus) => s === 'draft' || s === 'published';
export const canRespond = (s: PlanStatus) => s === 'published' || s === 'started';

/** Meine Zeilen: als Hundeführer:in und als Leger:in. */
export function myEntries(plan: Pick<TrainingPlanDetail, 'entries'>, userId: string | null) {
  const list = plan.entries;
  return {
    handler: userId ? list.filter(e => e.handlerUserId === userId) : [],
    layer: userId ? list.filter(e => e.layerUserId === userId && e.handlerUserId !== userId) : [],
  };
}

/** Nächste freie Position (Startliste bis 40). */
export function nextPosition(entries: readonly Pick<PlanEntry, 'position'>[]): number {
  return Math.min(40, entries.reduce((max, e) => Math.max(max, e.position), 0) + 1);
}

/** Zeile in der Reihenfolge verschieben; gibt die neue ID-Liste zurück (für «reorder»). */
export function moveEntry(entries: readonly Pick<PlanEntry, 'entryId' | 'position'>[], entryId: string, delta: -1 | 1): string[] | null {
  const ids = [...entries].sort((a, b) => a.position - b.position).map(e => e.entryId);
  const i = ids.indexOf(entryId), j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

/** Zustand einer Zeile für die Startliste (Hund offen / zugesagt / abgesagt). */
export type EntryState = 'yes' | 'no' | 'dog_missing' | 'open';
export function entryState(e: Pick<PlanEntry, 'handlerResponse' | 'dog'>): EntryState {
  if (e.handlerResponse === 'no') return 'no';
  if (e.handlerResponse === 'yes') return e.dog ? 'yes' : 'dog_missing';
  return 'open';
}

/** Kommende vor vergangenen; abgesagte/fertige ans Ende. */
export function sortPlans(list: readonly TrainingPlan[], nowMs: number): TrainingPlan[] {
  const rank = (p: TrainingPlan) => (p.status === 'cancelled' || p.status === 'done' ? 2 : p.startsAtMs >= nowMs - 12 * 3600_000 ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? a.startsAtMs - b.startsAtMs : b.startsAtMs - a.startsAtMs));
}

/** Eingaben des Plan-Formulars prüfen (Server prüft zusätzlich). */
export function validatePlanInput(input: { title: string; startsAtMs: number | null; meetingPoint?: string; notes?: string }): TranslationKey | null {
  if (!input.title.trim()) return 'plans.errTitle';
  if (input.title.trim().length > 80) return 'plans.errTitle';
  if (input.startsAtMs == null || !Number.isFinite(input.startsAtMs)) return 'plans.errDate';
  if ((input.meetingPoint?.trim().length ?? 0) > 120 || (input.notes?.trim().length ?? 0) > 1000) return 'plans.errTooLong';
  return null;
}

/** Liegezeit-Eingabe: leer = keine Angabe; 0–600 Minuten, ganze Zahl. */
export function parseLying(text: string): { ok: true; value: number | null } | { ok: false } {
  const t = text.trim();
  if (!t) return { ok: true, value: null };
  const n = Number(t.replace(',', '.'));
  return Number.isInteger(n) && n >= 0 && n <= 600 ? { ok: true, value: n } : { ok: false };
}
