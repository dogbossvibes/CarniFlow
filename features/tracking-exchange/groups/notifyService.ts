import { GroupApiError, type createGroupRpcClient } from './groupRpc';
import { record } from './groupModels';

// Stufe 3 Gruppentraining: Mitteilungs-Einstellungen.
// Server: supabase/migrations/20261116170000_training_group_stage3.sql (training_group_notify_v1).
type Client = ReturnType<typeof createGroupRpcClient>;

export interface GroupNotifySettings { joinRequests: boolean; trackReady: boolean; trackSearched: boolean; trainingStarted: boolean; evaluationShared: boolean }
export const GROUP_NOTIFY_DEFAULTS: GroupNotifySettings = { joinRequests: true, trackReady: true, trackSearched: true, trainingStarted: false, evaluationShared: true };
const KEYS = Object.keys(GROUP_NOTIFY_DEFAULTS) as (keyof GroupNotifySettings)[];

export function parseNotifySettings(value: unknown): GroupNotifySettings {
  const r = record(record(value).settings);
  const out = { ...GROUP_NOTIFY_DEFAULTS };
  for (const key of KEYS) {
    // evaluationShared kam mit Issue #146 dazu; ältere Server liefern es nicht.
    if (key === 'evaluationShared' && r[key] === undefined) continue;
    if (typeof r[key] !== 'boolean') throw new GroupApiError('GROUP_INVALID_RESPONSE');
    out[key] = r[key] as boolean;
  }
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
      return parseNotifySettings(await client.call(userId, 'training_group_notify_v1', 'set', request));
    },
  };
}
