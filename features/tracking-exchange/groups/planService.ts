import * as Crypto from 'expo-crypto';
import { GroupApiError, type createGroupRpcClient } from './groupRpc';
import { id, number, record, text, values } from './groupModels';

// Vereins- und Hundeplatzmodus (Spec 04, PR A): Trainingstag planen, Startliste, Zusagen.
// Server: supabase/migrations/20261126120000_training_group_plans.sql (training_group_plan_v1).
// Antworten werden streng geprüft; unbekannte Felder werden ignoriert (neuere Server).
type Client = ReturnType<typeof createGroupRpcClient>;

export type PlanStatus = 'draft' | 'published' | 'started' | 'done' | 'cancelled';
export type PlanResponse = 'open' | 'yes' | 'no';
export const PLAN_TRACK_KINDS = ['free', 'igp1', 'igp2', 'igp3', 'ifh1', 'ifh2', 'igpfh', 'fh', 'mantrail'] as const;
export type PlanTrackKind = typeof PLAN_TRACK_KINDS[number];
export const PLAN_MAX_ENTRIES = 40;

export interface PlanDog { dogId: string; name: string; breed: string | null }
export interface PlanEntry {
  entryId: string; position: number;
  handlerUserId: string; handlerName: string | null;   // null = ehemaliges Mitglied
  layerUserId: string | null; layerName: string | null;
  /** Nur, wenn der Besitzer den Hund selbst gesetzt hat (Server prüft). */
  dog: PlanDog | null;
  plannedLyingMinutes: number | null; trackKind: PlanTrackKind; fieldNote: string | null; blind: boolean;
  handlerResponse: PlanResponse; layerResponse: PlanResponse; trackId: string | null; updatedAtMs: number;
}
export interface TrainingPlan {
  planId: string; groupId: string; createdByUserId: string | null; title: string; startsAtMs: number;
  meetingPoint: string | null; meetingLat: number | null; meetingLng: number | null; notes: string | null;
  status: PlanStatus; sessionId: string | null; createdAtMs: number; updatedAtMs: number;
}
export interface TrainingPlanDetail extends TrainingPlan { entries: PlanEntry[] }

const STATUSES: readonly PlanStatus[] = ['draft', 'published', 'started', 'done', 'cancelled'];
const RESPONSES: readonly PlanResponse[] = ['open', 'yes', 'no'];
const bad = (): never => { throw new GroupApiError('GROUP_INVALID_RESPONSE'); };
const nullable = <T>(v: unknown, parse: (x: unknown) => T): T | null => (v === null || v === undefined ? null : parse(v));
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T => ((list as readonly string[]).includes(v as string) ? v as T : bad());
const bool = (v: unknown): boolean => (typeof v === 'boolean' ? v : bad());

export function parsePlan(value: unknown): TrainingPlan {
  const r = record(value);
  const lat = nullable(r.meetingLat, number), lng = nullable(r.meetingLng, number);
  if ((lat === null) !== (lng === null) || (lat !== null && (Math.abs(lat) > 90 || Math.abs(lng!) > 180))) bad();
  return {
    planId: id(r.planId), groupId: id(r.groupId), createdByUserId: nullable(r.createdByUserId, id), title: text(r.title, 80),
    startsAtMs: number(r.startsAtMs), meetingPoint: nullable(r.meetingPoint, v => text(v, 120)), meetingLat: lat, meetingLng: lng,
    notes: nullable(r.notes, v => text(v, 1000)), status: oneOf(r.status, STATUSES), sessionId: nullable(r.sessionId, id),
    createdAtMs: number(r.createdAtMs), updatedAtMs: number(r.updatedAtMs),
  };
}

export function parseEntry(value: unknown): PlanEntry {
  const r = record(value);
  const dog = nullable(r.dog, v => { const d = record(v); return { dogId: id(d.dogId), name: text(d.name, 80), breed: nullable(d.breed, x => text(x, 80)) }; });
  const handlerResponse = oneOf(r.handlerResponse, RESPONSES);
  const entry: PlanEntry = {
    entryId: id(r.entryId), position: number(r.position),
    handlerUserId: id(r.handlerUserId), handlerName: nullable(r.handlerName, v => text(v, 60)),
    layerUserId: nullable(r.layerUserId, id), layerName: nullable(r.layerName, v => text(v, 60)),
    dog, plannedLyingMinutes: nullable(r.plannedLyingMinutes, number), trackKind: oneOf(r.trackKind, PLAN_TRACK_KINDS),
    fieldNote: nullable(r.fieldNote, v => text(v, 120)), blind: bool(r.blind),
    handlerResponse, layerResponse: oneOf(r.layerResponse, RESPONSES), trackId: nullable(r.trackId, id), updatedAtMs: number(r.updatedAtMs),
  };
  // Server-Regeln zur Sicherheit auch hier: ein Hund nur bei Zusage, eigene Fährte nie blind.
  if ((entry.dog && handlerResponse !== 'yes') || (entry.blind && entry.layerUserId === entry.handlerUserId)
    || entry.position < 1 || entry.position > PLAN_MAX_ENTRIES) bad();
  return entry;
}

export function parsePlanDetail(value: unknown): TrainingPlanDetail {
  const plan = parsePlan(value);
  const entries = values(record(value).entries, parseEntry, PLAN_MAX_ENTRIES);
  if (new Set(entries.map(e => e.entryId)).size !== entries.length) bad();
  return { ...plan, entries };
}

export interface PlanInput {
  title: string; startsAtMs: number; meetingPoint?: string | null; meetingLat?: number | null; meetingLng?: number | null; notes?: string | null;
}
export interface EntryInput {
  entryId?: string; position: number; handlerUserId: string; layerUserId?: string | null;
  plannedLyingMinutes?: number | null; trackKind: PlanTrackKind; fieldNote?: string | null; blind: boolean;
}

const fields = (input: PlanInput) => ({
  title: input.title.trim(), startsAtMs: Math.round(input.startsAtMs),
  ...(input.meetingPoint?.trim() ? { meetingPoint: input.meetingPoint.trim() } : {}),
  ...(input.meetingLat != null && input.meetingLng != null ? { meetingLat: input.meetingLat, meetingLng: input.meetingLng } : {}),
  ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
});

export function createGroupPlanService(client: Client, userId: string) {
  const call = (action: string, request: Record<string, unknown>) => client.call(userId, 'training_group_plan_v1', action, request);
  // Gleiche Eingabe nach unklarer Antwort = gleiche ID (kein doppelter Plan / keine doppelte Zeile).
  const createIds = new Map<string, string>();
  const detail = async (action: string, request: Record<string, unknown>, planId: string) => {
    const plan = parsePlanDetail((await call(action, request)).plan);
    if (plan.planId !== planId) bad();
    return plan;
  };
  return {
    async list(groupId: string): Promise<{ plans: TrainingPlan[]; canPlan: boolean; serverNowMs: number }> {
      const data = await call('list', { groupId });
      const plans = values(data.plans, parsePlan, 100);
      if (data.groupId !== groupId || plans.some(p => p.groupId !== groupId)) bad();
      return { plans, canPlan: data.canPlan === true, serverNowMs: number(data.serverNowMs) };
    },
    async get(planId: string): Promise<{ plan: TrainingPlanDetail; canPlan: boolean }> {
      const data = await call('get', { planId });
      const plan = parsePlanDetail(data.plan);
      if (plan.planId !== planId) bad();
      return { plan, canPlan: data.canPlan === true };
    },
    async create(groupId: string, input: PlanInput): Promise<TrainingPlanDetail> {
      const body = { groupId, ...fields(input) };
      const key = JSON.stringify(body);
      let planId = createIds.get(key);
      if (!planId) { planId = Crypto.randomUUID(); createIds.set(key, planId); }
      try {
        const plan = await detail('create', { ...body, planId }, planId);
        createIds.delete(key);
        return plan;
      } catch (error) {
        if (!(error instanceof GroupApiError) || (error.code !== 'GROUP_CONNECTION' && error.code !== 'GROUP_INVALID_RESPONSE')) createIds.delete(key);
        throw error;
      }
    },
    update: (planId: string, input: PlanInput) => detail('update', { planId, ...fields(input) }, planId),
    publish: (planId: string) => detail('publish', { planId }, planId),
    cancel: (planId: string) => detail('cancel', { planId }, planId),
    finish: (planId: string) => detail('finish', { planId }, planId),
    linkSession: (planId: string, sessionId: string) => detail('link_session', { planId, sessionId }, planId),
    /** Neue Zeile ohne entryId; Ändern mit der bestehenden entryId. */
    setEntry(planId: string, input: EntryInput) {
      const entryId = input.entryId ?? Crypto.randomUUID();
      return detail('set_entry', {
        planId, entryId, position: input.position, handlerUserId: input.handlerUserId, trackKind: input.trackKind, blind: input.blind,
        ...(input.layerUserId ? { layerUserId: input.layerUserId } : {}),
        ...(input.plannedLyingMinutes != null ? { plannedLyingMinutes: Math.round(input.plannedLyingMinutes) } : {}),
        ...(input.fieldNote?.trim() ? { fieldNote: input.fieldNote.trim() } : {}),
      }, planId);
    },
    removeEntry: (planId: string, entryId: string) => detail('remove_entry', { planId, entryId }, planId),
    reorder: (planId: string, entryIds: string[]) => detail('reorder', { planId, entryIds }, planId),
    /** Eigene Zeile: zusagen (optional mit eigenem Hund) oder absagen. */
    respond: (planId: string, entryId: string, response: 'yes' | 'no', dogId?: string | null) =>
      detail('respond', { planId, entryId, response, ...(response === 'yes' && dogId ? { dogId } : {}) }, planId),
    layerRespond: (planId: string, entryId: string, response: 'yes' | 'no') => detail('layer_respond', { planId, entryId, response }, planId),
    linkTrack: (planId: string, entryId: string, trackId: string) => detail('link_track', { planId, entryId, trackId }, planId),
  };
}
export type GroupPlanService = ReturnType<typeof createGroupPlanService>;
