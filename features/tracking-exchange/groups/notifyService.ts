import { GroupApiError, type createGroupRpcClient } from './groupRpc';
import { record } from './groupModels';

// Stufe 3 Gruppentraining: Mitteilungs-Einstellungen.
// Server: supabase/migrations/20261116170000_training_group_stage3.sql (training_group_notify_v1).
type Client = ReturnType<typeof createGroupRpcClient>;

export interface GroupNotifySettings {
  joinRequests: boolean; trackReady: boolean; trackSearched: boolean; trainingStarted: boolean;
  /** Vereinsmodus (Spec 04, PR D): Trainingstage. null = Server kennt den Schalter noch nicht. */
  plans: boolean | null;
}
export const GROUP_NOTIFY_DEFAULTS: GroupNotifySettings = { joinRequests: true, trackReady: true, trackSearched: true, trainingStarted: false, plans: true };
/** Pflichtschlüssel (Stufe 3); «plans» ist optional, damit ältere Server weiter funktionieren. */
const KEYS = ['joinRequests', 'trackReady', 'trackSearched', 'trainingStarted'] as const;

export function parseNotifySettings(value: unknown): GroupNotifySettings {
  const r = record(record(value).settings);
  const out = { ...GROUP_NOTIFY_DEFAULTS };
  for (const key of KEYS) {
    if (typeof r[key] !== 'boolean') throw new GroupApiError('GROUP_INVALID_RESPONSE');
    out[key] = r[key] as boolean;
  }
  if (r.plans !== undefined && typeof r.plans !== 'boolean') throw new GroupApiError('GROUP_INVALID_RESPONSE');
  out.plans = typeof r.plans === 'boolean' ? r.plans : null;
  return out;
}

export function createGroupNotifyService(client: Client, userId: string) {
  return {
    async get(): Promise<GroupNotifySettings> {
      return parseNotifySettings(await client.call(userId, 'training_group_notify_v1', 'get', {}));
    },
    async set(change: Partial<GroupNotifySettings>): Promise<GroupNotifySettings> {
      const request: Record<string, boolean> = {};
      for (const key of KEYS) if (typeof change[key] === 'boolean') request[key] = change[key] as boolean;
      if (typeof change.plans === 'boolean') request.plans = change.plans;
      return parseNotifySettings(await client.call(userId, 'training_group_notify_v1', 'set', request));
    },
  };
}
