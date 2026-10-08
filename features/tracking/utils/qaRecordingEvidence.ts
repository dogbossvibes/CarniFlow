// Coordinate-free QA observations. No values from this module control tracking.
export type QaRecordingPhase = 'lay' | 'search';
export type QaObservedSource = 'native' | 'expo' | 'external' | 'unknown';
export type QaDeliveryChannel = 'foreground' | 'background';
export const QA_EVIDENCE_EVENT_LIMIT = 128;
export const QA_EVIDENCE_SEGMENT_LIMIT = 4;
export const QA_EVIDENCE_SESSION_LIMIT = 5;

export interface QaRecordingIdentity {
  platform: 'ios' | 'android' | 'web' | 'unknown';
  appVersion: string | null;
  nativeBuildVersion: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  launch: 'ota' | 'embedded' | 'emergency' | 'updates_disabled' | 'unknown';
  /** Public running-update identity; never an account/device/session identifier. */
  updateId: string | null;
  releaseGitCommit: string | null;
  selectedEngine: 'current' | 'build40' | 'unknown';
  selectedSource: 'precision' | 'legacy' | 'unknown';
  precisionModulePresent: boolean | null;
  motionModulePresent: boolean | null;
}

export type QaRecordingEventName =
  | 'recordingStarted' | 'recordingResumed' | 'recordingStopped' | 'recorderUnmounted'
  | 'appActive' | 'appInactive' | 'appBackground' | 'appUnknown'
  | 'sourceObserved' | 'firstFix'
  | 'backgroundStartRequested' | 'backgroundStartSucceeded' | 'foregroundStreamRemoved'
  | 'userPaused' | 'userResumed';

export interface QaRecordingEvent {
  sequence: number;
  /** Relative to this recording segment, NOT the first geographic point. */
  tMs: number;
  name: QaRecordingEventName;
  source?: QaObservedSource;
  provider?: string;
  deliveryChannel?: QaDeliveryChannel;
}

export interface QaRecordingSegment {
  phase: QaRecordingPhase;
  resumed: boolean;
  identity: QaRecordingIdentity;
  timeBasis: 'js_monotonic' | 'wall_relative';
  events: QaRecordingEvent[];
  eventCount: number;
  droppedEventCount: number;
  writeFailureCount: number;
  closed: boolean;
}

export interface QaRecordingEvidence {
  schemaVersion: 1;
  availability: Record<QaRecordingPhase, 'available' | 'missing' | 'read_failed'>;
  /** Most recent segments of each phase, oldest first. No invented historical identity. */
  lay: QaRecordingSegment[];
  search: QaRecordingSegment[];
}

const PROVIDERS = new Set([
  'ios_core_location', 'expo-location', 'expo-location-legacy', 'expo-location-task',
  'external-ble', 'gps', 'fused', 'network', 'android_fused', 'android_location_manager',
]);

export function qaObservedSource(source: unknown): QaObservedSource {
  return source === 'native' || source === 'expo' || source === 'external' ? source : 'unknown';
}

export function qaObservedProvider(provider: unknown): string {
  return typeof provider === 'string' && PROVIDERS.has(provider) ? provider : 'unknown';
}

/** Also used by export's privacy gate; corrupt local evidence fails closed. */
export function assertQaRecordingEvidence(value: QaRecordingEvidence): void {
  const fail = (): never => { throw new Error('Invalid or unsafe QA recording evidence.'); };
  const fields = (v: unknown, required: string[], optional: string[] = []): void => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail();
    const keys = Object.keys(v as object);
    if (required.some(key => !keys.includes(key)) || keys.some(key => !required.includes(key) && !optional.includes(key))) fail();
  };
  const oneOf = (v: unknown, choices: readonly string[]): void => {
    if (typeof v !== 'string' || !choices.includes(v)) fail();
  };
  const count = (v: unknown): void => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v >= 1e8) fail();
  };
  const bool = (v: unknown): void => { if (typeof v !== 'boolean') fail(); };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const eventNames: QaRecordingEventName[] = [
    'recordingStarted', 'recordingResumed', 'recordingStopped', 'recorderUnmounted',
    'appActive', 'appInactive', 'appBackground', 'appUnknown', 'sourceObserved', 'firstFix',
    'backgroundStartRequested', 'backgroundStartSucceeded', 'foregroundStreamRemoved', 'userPaused', 'userResumed',
  ];
  fields(value, ['schemaVersion', 'availability', 'lay', 'search']);
  if (value.schemaVersion !== 1) fail();
  fields(value.availability, ['lay', 'search']);
  for (const phase of ['lay', 'search'] as const) {
    oneOf(value.availability[phase], ['available', 'missing', 'read_failed']);
    if (!Array.isArray(value[phase]) || value[phase].length > QA_EVIDENCE_SEGMENT_LIMIT) fail();
    for (const segment of value[phase]) {
      fields(segment, ['phase', 'resumed', 'identity', 'timeBasis', 'events', 'eventCount', 'droppedEventCount', 'writeFailureCount', 'closed']);
      if (segment.phase !== phase) fail();
      bool(segment.resumed); bool(segment.closed);
      oneOf(segment.timeBasis, ['js_monotonic', 'wall_relative']);
      count(segment.eventCount); count(segment.droppedEventCount); count(segment.writeFailureCount);
      const id = segment.identity;
      fields(id, ['platform', 'appVersion', 'nativeBuildVersion', 'runtimeVersion', 'channel', 'launch', 'updateId',
        'releaseGitCommit', 'selectedEngine', 'selectedSource', 'precisionModulePresent', 'motionModulePresent']);
      oneOf(id.platform, ['ios', 'android', 'web', 'unknown']);
      oneOf(id.launch, ['ota', 'embedded', 'emergency', 'updates_disabled', 'unknown']);
      oneOf(id.selectedEngine, ['current', 'build40', 'unknown']);
      oneOf(id.selectedSource, ['precision', 'legacy', 'unknown']);
      for (const v of [id.appVersion, id.nativeBuildVersion, id.runtimeVersion, id.channel]) {
        if (v !== null && (typeof v !== 'string' || !/^[A-Za-z0-9_.+-]{1,64}$/.test(v) || /\d{4}-\d{2}-\d{2}/.test(v) || uuid.test(v))) fail();
      }
      if (id.updateId !== null && (typeof id.updateId !== 'string' || !uuid.test(id.updateId) || !['ota', 'emergency'].includes(id.launch))) fail();
      if (id.releaseGitCommit !== null && (typeof id.releaseGitCommit !== 'string' || !/^[0-9a-f]{7,40}$/i.test(id.releaseGitCommit))) fail();
      for (const v of [id.precisionModulePresent, id.motionModulePresent]) if (v !== null) bool(v);
      if (!Array.isArray(segment.events) || segment.events.length > QA_EVIDENCE_EVENT_LIMIT
        || segment.eventCount !== segment.events.length + segment.droppedEventCount) fail();
      let lastTime = 0;
      let lastSequence = segment.droppedEventCount;
      for (const event of segment.events) {
        fields(event, ['sequence', 'tMs', 'name'], ['source', 'provider', 'deliveryChannel']);
        count(event.sequence); count(event.tMs); oneOf(event.name, eventNames);
        if (event.sequence !== lastSequence + 1 || event.tMs < lastTime) fail();
        lastSequence = event.sequence; lastTime = event.tMs;
        if (event.source !== undefined) oneOf(event.source, ['native', 'expo', 'external', 'unknown']);
        if (event.provider !== undefined && qaObservedProvider(event.provider) !== event.provider) fail();
        if (event.deliveryChannel !== undefined) oneOf(event.deliveryChannel, ['foreground', 'background']);
        if (['sourceObserved', 'firstFix'].includes(event.name)
          && (event.source === undefined || event.provider === undefined || event.deliveryChannel === undefined)) fail();
      }
    }
  }
}
