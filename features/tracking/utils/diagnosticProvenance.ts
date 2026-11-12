// Low-frequency recording context only. Never an input to recording or detection.
export const PROVENANCE_SEGMENT_LIMIT = 16;
export type DiagnosticPhase = 'lay' | 'search';
export interface DiagnosticEnvironment {
  platform: 'ios' | 'android' | 'web' | 'unknown';
  appVersion: string | null;
  nativeBuildVersion: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  runtimeVersion: string | null;
  launch: 'ota' | 'embedded' | 'emergency' | 'updates_disabled' | 'unknown';
  /** Public software update identity, never a hardware/account/session ID. */
  otaUpdateId: string | null;
}
export interface RecordingProvenance {
  availability: 'available' | 'unknown' | 'read_failed';
  /** History of observed starts for this phase; no claim of per-point association. */
  scope: 'phase_history';
  partial: boolean | null;
  omittedSegments: number;
  segments: { source: 'recording_start' | 'recording_resume'; environment: DiagnosticEnvironment }[];
}
export interface DiagnosticProvenance {
  schemaVersion: 1;
  recording: Record<DiagnosticPhase, RecordingProvenance>;
  exporter: { source: 'runtime_at_export'; environment: DiagnosticEnvironment };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSAFE = /\d{4}-\d{2}-\d{2}|@|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
export function diagnosticLabel(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9 ._()+-]{1,80}$/.test(value) && !UNSAFE.test(value) ? value : null;
}
export function diagnosticUpdateId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}
export function unknownRecordingProvenance(availability: 'unknown' | 'read_failed' = 'unknown'): RecordingProvenance {
  return { availability, scope: 'phase_history', partial: null, omittedSegments: 0, segments: [] };
}
export function observedRecordingProvenance(environment: DiagnosticEnvironment, resumed: boolean): RecordingProvenance {
  return { availability: 'available', scope: 'phase_history', partial: resumed, omittedSegments: 0,
    segments: [{ source: resumed ? 'recording_resume' : 'recording_start', environment }] };
}
function fields(value: unknown, names: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== names.length || names.some(key => !Object.hasOwn(value, key)))
    throw new Error('Invalid diagnostic provenance fields');
}
export function assertDiagnosticEnvironment(value: unknown): asserts value is DiagnosticEnvironment {
  fields(value, ['platform', 'appVersion', 'nativeBuildVersion', 'osVersion', 'deviceModel', 'runtimeVersion', 'launch', 'otaUpdateId']);
  if (!['ios', 'android', 'web', 'unknown'].includes(value.platform as string)
    || !['ota', 'embedded', 'emergency', 'updates_disabled', 'unknown'].includes(value.launch as string))
    throw new Error('Invalid diagnostic runtime');
  for (const key of ['appVersion', 'nativeBuildVersion', 'osVersion', 'deviceModel', 'runtimeVersion']) {
    if (value[key] !== null && diagnosticLabel(value[key]) !== value[key]) throw new Error('Unsafe diagnostic label');
  }
  if (value.otaUpdateId !== null && (diagnosticUpdateId(value.otaUpdateId) !== value.otaUpdateId || value.launch !== 'ota'))
    throw new Error('Invalid diagnostic update identity');
}
export function assertRecordingProvenance(value: unknown): asserts value is RecordingProvenance {
  fields(value, ['availability', 'scope', 'partial', 'omittedSegments', 'segments']);
  if (!['available', 'unknown', 'read_failed'].includes(value.availability as string) || value.scope !== 'phase_history'
    || !Number.isSafeInteger(value.omittedSegments) || (value.omittedSegments as number) < 0 || (value.omittedSegments as number) >= 1e8
    || !Array.isArray(value.segments) || value.segments.length > PROVENANCE_SEGMENT_LIMIT) throw new Error('Invalid recording provenance');
  if (value.availability === 'available') {
    if (!value.segments.length || typeof value.partial !== 'boolean') throw new Error('Missing recording provenance');
  } else if (value.segments.length || value.partial !== null || value.omittedSegments !== 0) throw new Error('Invented recording provenance');
  for (const segment of value.segments) {
    fields(segment, ['source', 'environment']);
    if (segment.source !== 'recording_start' && segment.source !== 'recording_resume') throw new Error('Invalid recording source');
    assertDiagnosticEnvironment(segment.environment);
  }
  if (value.segments.length && (value.omittedSegments as number > 0 || value.segments[0].source === 'recording_resume') && value.partial !== true)
    throw new Error('Missing partial metadata flag');
}
export function assertDiagnosticProvenance(value: unknown): asserts value is DiagnosticProvenance {
  fields(value, ['schemaVersion', 'recording', 'exporter']);
  if (value.schemaVersion !== 1) throw new Error('Unsupported diagnostic provenance');
  fields(value.recording, ['lay', 'search']);
  assertRecordingProvenance(value.recording.lay); assertRecordingProvenance(value.recording.search);
  fields(value.exporter, ['source', 'environment']);
  if (value.exporter.source !== 'runtime_at_export') throw new Error('Invalid export source');
  assertDiagnosticEnvironment(value.exporter.environment);
}

/** Key components, not a concatenated path: dotted/bracketed keys cannot spoof an exception. */
export function isProvenanceUpdatePath(path: readonly (string | number)[]): boolean {
  return path.length === 4 && path[0] === 'provenance' && path[1] === 'exporter' && path[2] === 'environment' && path[3] === 'otaUpdateId'
    || path.length === 7 && path[0] === 'provenance' && path[1] === 'recording' && ['lay', 'search'].includes(path[2] as string)
      && path[3] === 'segments' && typeof path[4] === 'number' && path[5] === 'environment' && path[6] === 'otaUpdateId';
}
