import type { GroupParticipant } from '@/features/tracking-exchange/groups/groupModels';
import type { GroupTrack } from '@/features/tracking-exchange/groups/trackService';
import type { EvaluationSummary } from '@/features/tracking-exchange/groups/evaluationService';
import type { PlanEntry } from '@/features/tracking-exchange/groups/planService';
import { lyingMs } from '@/features/tracking-exchange/groups/trackService';

// Ablaufliste am Tag (Spec 04, PR C). Rein: Der Stand jeder Zeile kommt ausschliesslich
// aus den echten Gruppenfährten (training_private_tracks) – nichts wird «geschätzt».

export type DayRowState = 'declined' | 'not_joined' | 'planned' | 'laying' | 'lying' | 'searching' | 'done';
export interface DayRow {
  entry: PlanEntry;
  state: DayRowState;
  track: GroupTrack | null;
  /** Teilnahme der Hundeführer:in im Gruppentraining (für «Fährte legen für …»). */
  handlerParticipation: GroupParticipant | null;
  lyingMs: number | null;
  /** Geplante Liegezeit erreicht (nur während «liegt»). */
  lyingReached: boolean;
}

/** Teilnahme passend zur Zeile: gleicher Mensch und – falls gewählt – gleicher Hund. */
export function participationFor(entry: Pick<PlanEntry, 'handlerUserId' | 'dog'>, participants: readonly GroupParticipant[]): GroupParticipant | null {
  const mine = participants.filter(p => p.userId === entry.handlerUserId);
  return (entry.dog ? mine.find(p => p.dogId === entry.dog!.dogId) : null) ?? (entry.dog ? null : mine[0] ?? null);
}

export function dayRow(entry: PlanEntry, tracks: readonly GroupTrack[], participants: readonly GroupParticipant[], serverNowMs: number): DayRow {
  const track = entry.trackId ? tracks.find(t => t.trackId === entry.trackId && t.status !== 'revoked') ?? null : null;
  const handlerParticipation = participationFor(entry, participants);
  const base = { entry, track, handlerParticipation, lyingMs: null, lyingReached: false };
  if (track) {
    const ms = lyingMs(track, serverNowMs);
    if (track.status === 'laying') return { ...base, state: 'laying' };
    if (track.status === 'lying') {
      const reached = entry.plannedLyingMinutes != null && ms != null && ms >= entry.plannedLyingMinutes * 60_000;
      return { ...base, state: 'lying', lyingMs: ms, lyingReached: reached };
    }
    if (track.status === 'searching') return { ...base, state: 'searching', lyingMs: ms };
    return { ...base, state: 'done', lyingMs: ms };
  }
  if (entry.handlerResponse === 'no') return { ...base, state: 'declined' };
  return { ...base, state: handlerParticipation ? 'planned' : 'not_joined' };
}

/** Darf ich für diese Zeile jetzt die Fährte legen? (Leger:in der Zeile, Hundeführer:in im Training, noch keine Fährte) */
export function canLayFor(row: DayRow, userId: string | null, myParticipations: readonly GroupParticipant[]): boolean {
  return !!userId && row.entry.layerUserId === userId && row.state === 'planned' && !!row.handlerParticipation && myParticipations.length > 0;
}

export type DayEvaluation = { kind: 'shared'; summary: EvaluationSummary } | { kind: 'not_shared' } | { kind: 'not_searched' } | { kind: 'declined' };
/** Tagesauswertung: nur, was die Hundeführer:in für die Gruppe geteilt hat. */
export function dayEvaluation(row: DayRow, evaluations: readonly EvaluationSummary[]): DayEvaluation {
  if (row.state === 'declined') return { kind: 'declined' };
  if (!row.track || row.state !== 'done') return { kind: 'not_searched' };
  const summary = evaluations.find(e => e.trackId === row.track!.trackId);
  return summary ? { kind: 'shared', summary } : { kind: 'not_shared' };
}

/** Kopfzeile «3 von 4 haben zugesagt». */
export function confirmedCount(entries: readonly PlanEntry[]): { yes: number; total: number } {
  return { yes: entries.filter(e => e.handlerResponse === 'yes').length, total: entries.length };
}
