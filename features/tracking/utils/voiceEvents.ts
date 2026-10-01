import * as Speech from 'expo-speech';
import { boundedPush, TRACKING_UX_QA_LIMITS, type VoiceDiagnostic, type VoiceEventType } from './trackingUxDiagnostics';

export interface VoiceRequest {
  eventType: VoiceEventType;
  text: string;
  language: string;
  priority: number;
  onceKey: string;
  phase: string;
  valid?: () => boolean;
  progressM?: number | null;
  distanceM?: number | null;
}

let originMs = Date.now();
let spokenKeys = new Set<string>();
let activePriority = 0;
let generation = 0;
let records: VoiceDiagnostic[] = [];
let truncated = false;

const relativeSec = (ms: number) => Math.max(0, Math.round(((ms - originMs) / 1000) * 100) / 100);
const anonymousKey = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `event:${(hash >>> 0).toString(16)}`;
};
function note(request: VoiceRequest, trigger: number, queuedAt: number | null, spokenAt: number | null, reason: string | null) {
  const row: VoiceDiagnostic = {
    eventType: request.eventType,
    triggerTSec: relativeSec(trigger), queuedTSec: queuedAt == null ? null : relativeSec(queuedAt),
    spokenTSec: spokenAt == null ? null : relativeSec(spokenAt),
    delayMs: spokenAt == null ? null : Math.max(0, spokenAt - trigger),
    priority: request.priority, onceKey: anonymousKey(request.onceKey), phase: request.phase,
    suppressedReason: reason, progressM: request.progressM, distanceM: request.distanceM,
  };
  if (!boundedPush(records, row, TRACKING_UX_QA_LIMITS.voice)) truncated = true;
}

export function resetVoiceEvents(startMs = Date.now()) {
  spokenKeys = new Set(); records = []; truncated = false; originMs = startMs; activePriority = 0; generation++;
  try { Speech.stop(); } catch { /* optional native service */ }
}

export function voiceDiagnostics() { return { events: records.slice(), truncated }; }

/** Priority-aware native speech; old messages are stopped and validated onStart. */
export function requestVoice(request: VoiceRequest): boolean {
  const trigger = Date.now();
  if (spokenKeys.has(request.onceKey)) { note(request, trigger, null, null, 'already_spoken'); return false; }
  if (request.valid && !request.valid()) { note(request, trigger, null, null, 'state_changed'); return false; }
  if (request.priority < activePriority) { note(request, trigger, null, null, 'lower_priority'); return false; }
  const queuedAt = Date.now();
  const currentGeneration = ++generation;
  spokenKeys.add(request.onceKey);
  activePriority = request.priority;
  try {
    Speech.stop();
    Speech.speak(request.text, {
      language: request.language, rate: 1,
      onStart: () => {
        if (generation !== currentGeneration) return;
        if (request.valid && !request.valid()) {
          Speech.stop(); note(request, trigger, queuedAt, null, 'state_changed'); activePriority = 0; return;
        }
        note(request, trigger, queuedAt, Date.now(), null);
      },
      onDone: () => { if (generation === currentGeneration) activePriority = 0; },
      onStopped: () => { if (generation === currentGeneration) activePriority = 0; },
      onError: () => { if (generation === currentGeneration) { activePriority = 0; note(request, trigger, queuedAt, null, 'speech_error'); } },
    });
    return true;
  } catch { activePriority = 0; note(request, trigger, queuedAt, null, 'speech_error'); return false; }
}

export function cancelVoiceEvents() {
  activePriority = 0; generation++;
  try { Speech.stop(); } catch { /* optional native service */ }
}
