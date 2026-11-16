import { GroupApiError, type createGroupRpcClient } from './groupRpc';
import { id, number, parseGroup, record, text, values, type TrainingGroup } from './groupModels';

// Stufe 4a Gruppentraining: Auswertung teilen, Trainer-Sicht, Rolle Trainer:in.
// Server: supabase/migrations/20261116210000_training_group_stage4a.sql (training_group_eval_v1).
type Client = ReturnType<typeof createGroupRpcClient>;

export interface EvalPoint { lat: number; lng: number; breakBefore?: true }
export interface EvalMetrics { distanceM: number; durationS: number; articlesFound: number; articlesTotal: number; deviationAvgM: number | null; breaks: number }
/** Nur Linien und Kennzahlen. Nie Notizen, Gesundheit oder Dokumente. */
export interface EvaluationPackage { version: 1; laid: EvalPoint[]; search: EvalPoint[]; metrics: EvalMetrics }

export interface ShareCandidate { userId: string; displayName: string; isTrainer: boolean; isLayer: boolean }
export interface EvaluationShareState {
  trackId: string; groupId: string; shareOutside: boolean; searched: boolean;
  shared: boolean; group: boolean; recipientUserIds: string[]; candidates: ShareCandidate[];
  /** Issue #146: Fährte berührt die Heimzone der Leger:in und ist nie teilbar (der Grund wird nicht genannt). */
  blocked: boolean;
  /** Issue #146: Leger:in hat zugestimmt, dass ihre gelegte Linie in Auswertungen erscheint. */
  laidShared: boolean;
}
export interface EvaluationSummary {
  trackId: string; groupId: string; sessionId: string; handlerUserId: string; handlerName: string;
  layerUserId: string; layerName: string; dogName: string; metrics: EvalMetrics; mine: boolean; updatedAtMs: number;
  /** false: die gelegte Linie ist für mich nicht freigegeben (laid ist dann leer). */
  laidShared: boolean;
}
export interface EvaluationDetail extends EvaluationSummary { laid: EvalPoint[]; search: EvalPoint[] }

const bool = (value: unknown): boolean => { if (typeof value !== 'boolean') throw new GroupApiError('GROUP_INVALID_RESPONSE'); return value; };
const nullableNumber = (value: unknown): number | null => value === null ? null : number(value);

function parseMetrics(value: unknown): EvalMetrics {
  const r = record(value);
  return { distanceM: number(r.distanceM), durationS: number(r.durationS), articlesFound: number(r.articlesFound),
    articlesTotal: number(r.articlesTotal), deviationAvgM: nullableNumber(r.deviationAvgM), breaks: number(r.breaks) };
}
function parsePoint(value: unknown): EvalPoint {
  const r = record(value);
  const lat = number(r.lat), lng = number(r.lng);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new GroupApiError('GROUP_INVALID_RESPONSE');
  return r.breakBefore === true ? { lat, lng, breakBefore: true } : { lat, lng };
}
export function parseShareState(value: unknown): EvaluationShareState {
  const r = record(value);
  return { trackId: id(r.trackId), groupId: id(r.groupId), shareOutside: bool(r.shareOutside), searched: bool(r.searched),
    shared: bool(r.shared), group: bool(r.group), recipientUserIds: values(r.recipientUserIds, id, 50),
    candidates: values(r.candidates, c => { const x = record(c);
      return { userId: id(x.userId), displayName: text(x.displayName, 60), isTrainer: bool(x.isTrainer), isLayer: bool(x.isLayer) }; }, 50),
    // Server vor Issue #146 kennt beide Felder nicht und lieferte die Linie immer aus.
    blocked: r.blocked === true, laidShared: r.laidShared !== false };
}
export function parseSummary(value: unknown): EvaluationSummary {
  const r = record(value);
  return { trackId: id(r.trackId), groupId: id(r.groupId), sessionId: id(r.sessionId), handlerUserId: id(r.handlerUserId),
    handlerName: text(r.handlerName, 60), layerUserId: id(r.layerUserId), layerName: text(r.layerName, 60),
    dogName: text(r.dogName, 60), metrics: parseMetrics(r.metrics), mine: bool(r.mine), updatedAtMs: number(r.updatedAtMs),
    laidShared: r.laidShared !== false };
}
export function parseDetail(value: unknown): EvaluationDetail {
  const r = record(value);
  // Ohne Zustimmung der Leger:in fehlt «laid» ganz.
  const laid = r.laid === undefined ? [] : values(r.laid, parsePoint, 5000);
  return { ...parseSummary(r), laidShared: r.laidShared !== false && laid.length > 0, laid, search: values(r.search, parsePoint, 10000) };
}

export function createGroupEvaluationService(client: Client, userId: string) {
  const call = (action: string, request: Record<string, unknown>) => client.call(userId, 'training_group_eval_v1', action, request);
  return {
    async state(trackId: string): Promise<EvaluationShareState> { return parseShareState(await call('get', { trackId })); },
    /** Leere Auswahl ohne Gruppe beendet jede Freigabe und löscht die Server-Kopie. */
    async share(trackId: string, recipientUserIds: string[], group: boolean, evaluation: EvaluationPackage | null): Promise<EvaluationShareState> {
      return parseShareState(await call('share', { trackId, recipientUserIds: [...new Set(recipientUserIds)], group, evaluation }));
    },
    async list(groupId: string): Promise<EvaluationSummary[]> {
      return values(record(await call('list', { groupId })).evaluations, parseSummary, 100);
    },
    async fetch(trackId: string): Promise<EvaluationDetail> { return parseDetail(record(await call('fetch', { trackId })).evaluation); },
    async setTrainer(groupId: string, memberUserId: string, membershipId: string, trainer: boolean): Promise<TrainingGroup> {
      return parseGroup(record(await call('set_trainer', { groupId, memberUserId, membershipId, trainer })).group);
    },
    /** Leger:in, vor der Übergabe: Fährte berührt die eigene Heimzone und wird nie als Auswertung teilbar. */
    async block(trackId: string): Promise<void> { await call('block', { trackId }); },
    /** Eigene Zustimmung für gelegte Linien in dieser Gruppe. null = noch nicht gefragt (gilt als Nein). */
    async consent(groupId: string): Promise<boolean | null> {
      const value = record(await call('consent_get', { groupId })).laidLine;
      if (value !== null && typeof value !== 'boolean') throw new GroupApiError('GROUP_INVALID_RESPONSE');
      return value;
    },
    async setConsent(groupId: string, value: boolean): Promise<boolean> {
      return bool(record(await call('consent_set', { groupId, value })).laidLine);
    },
    async setShareOutside(groupId: string, value: boolean): Promise<TrainingGroup> {
      return parseGroup(record(await call('set_share_outside', { groupId, value })).group);
    },
  };
}
export type GroupEvaluationService = ReturnType<typeof createGroupEvaluationService>;
