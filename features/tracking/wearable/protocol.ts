/** Connected control only. This protocol carries no credentials or GPS history. */
export const ACTIONS = ['start_lay', 'start_search', 'mark_object', 'pause', 'resume', 'end_phase'] as const;
export type WearableAction = typeof ACTIONS[number];
export const PHASES = ['idle', 'lay_prepared', 'lay_recording', 'lay_paused', 'search_prepared', 'search_recording', 'search_paused', 'finishing', 'finished'] as const;
export type WearablePhase = typeof PHASES[number];
export interface WearableState {
  sessionId: string | null; dogId: string | null; dogName: string | null;
  phase: WearablePhase; distanceM: number | null; elapsedSeconds: number | null;
  capabilities: WearableAction[];
}
export interface WearableSnapshot extends WearableState {
  protocolVersion: 1; kind: 'snapshot'; contextId: string | null;
  revision: number; sequence: number; leaseId: string | null; expiresAtMs: number;
}
export interface WearableCommand {
  protocolVersion: 1; kind: 'command'; commandId: string; contextId: string;
  revision: number; leaseId: string; sessionId: string | null; dogId: string;
  action: WearableAction; confirmed: boolean;
}
export type WearableReason = 'ok' | 'invalid_command' | 'unavailable' | 'stale_context' | 'stale_revision'
  | 'expired' | 'wrong_target' | 'not_allowed' | 'confirmation_required' | 'busy' | 'failed';
export interface WearableAck {
  protocolVersion: 1; kind: 'ack'; commandId: string | null;
  status: 'accepted' | 'rejected'; reason: WearableReason; snapshot: WearableSnapshot;
}
export type WearableRequest = WearableCommand | { protocolVersion: 1; kind: 'snapshot_request' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const commandKeys = ['protocolVersion', 'kind', 'commandId', 'contextId', 'revision', 'leaseId', 'sessionId', 'dogId', 'action', 'confirmed'];
const bounded = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  return Object.keys(value).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(value, k));
}
export function parseWearableRequest(json: string): WearableRequest | null {
  // The native transports additionally enforce the exact UTF-8 byte limit.
  if (typeof json !== 'string' || json.length > 8192) return null;
  let value: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    value = parsed as Record<string, unknown>;
  } catch { return null; }
  if (value.protocolVersion !== 1) return null;
  if (value.kind === 'snapshot_request') return exactKeys(value, ['protocolVersion', 'kind']) ? { protocolVersion: 1, kind: 'snapshot_request' } : null;
  if (value.kind !== 'command' || !exactKeys(value, commandKeys) || !bounded(value.commandId) || !UUID.test(value.commandId)
    || !bounded(value.contextId) || !bounded(value.leaseId) || !bounded(value.dogId)
    || !(value.sessionId === null || bounded(value.sessionId))
    || !Number.isSafeInteger(value.revision) || (value.revision as number) < 0
    || !ACTIONS.includes(value.action as WearableAction) || typeof value.confirmed !== 'boolean') return null;
  return value as unknown as WearableCommand;
}
export function commandFingerprint(command: WearableCommand): string {
  // Stable ordering means equivalent JSON objects deduplicate regardless of key order.
  return JSON.stringify(commandKeys.map(key => command[key as keyof WearableCommand]));
}
export const idleWearableState = (): WearableState => ({ sessionId: null, dogId: null, dogName: null,
  phase: 'idle', distanceM: null, elapsedSeconds: null, capabilities: [] });
