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

// T-204: Ansagen laufen nacheinander. Früher brach jede neue Ansage gleicher Priorität die
// laufende mitten im Satz ab, und eine niedrigere (z. B. «von der Fährte abgekommen») entfiel
// ersatzlos. Nur eine klar wichtigere Ansage unterbricht noch; alles andere wartet kurz.
export const VOICE_QUEUE = Object.freeze({
  /** Wartende Ansagen; bei Überlauf entfällt die unwichtigste, bei Gleichstand die älteste. */
  maxPending: 3,
  /** Älter wird eine wartende Ansage nicht gesprochen (sie wäre nicht mehr aktuell). */
  maxAgeMs: 6000,
  /** Meldet die Sprachausgabe ihr Ende nie zurück, gilt sie nach dieser Zeit als beendet. */
  maxSpeakMs: 10000,
});
interface PendingVoice { request: VoiceRequest; trigger: number }
let pending: PendingVoice[] = [];
let speakingSinceMs = 0;

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
  pending = []; speakingSinceMs = 0;
  try { Speech.stop(); } catch { /* optional native service */ }
}

export function voiceDiagnostics() { return { events: records.slice(), truncated }; }

/** Record a feature suppressed before it reaches the native speech queue. */
export function noteSuppressedVoice(request: VoiceRequest, reason: string): void {
  note(request, Date.now(), null, null, reason);
}

function finishSpeaking(currentGeneration: number) {
  if (generation !== currentGeneration) return;
  activePriority = 0; speakingSinceMs = 0;
  speakNextPending();
}

function speakNow(request: VoiceRequest, trigger: number, interrupt: boolean): boolean {
  const queuedAt = Date.now();
  const currentGeneration = ++generation;
  activePriority = request.priority;
  speakingSinceMs = queuedAt;
  try {
    if (interrupt) Speech.stop();
    Speech.speak(request.text, {
      language: request.language, rate: 1,
      onStart: () => {
        if (generation !== currentGeneration) return;
        if (request.valid && !request.valid()) {
          note(request, trigger, queuedAt, null, 'state_changed');
          // Abbruch der eigenen Ansage: Zustand sofort freigeben, die nächste wartende sprechen.
          generation++; activePriority = 0; speakingSinceMs = 0;
          try { Speech.stop(); } catch { /* optional native service */ }
          speakNextPending();
          return;
        }
        note(request, trigger, queuedAt, Date.now(), null);
      },
      onDone: () => finishSpeaking(currentGeneration),
      onStopped: () => finishSpeaking(currentGeneration),
      onError: () => {
        if (generation !== currentGeneration) return;
        note(request, trigger, queuedAt, null, 'speech_error');
        finishSpeaking(currentGeneration);
      },
    });
    return true;
  } catch {
    activePriority = 0; speakingSinceMs = 0;
    note(request, trigger, queuedAt, null, 'speech_error');
    return false;
  }
}

/** Nächste wartende Ansage: die wichtigste zuerst, bei Gleichstand die älteste. */
function speakNextPending(): void {
  while (pending.length && activePriority === 0) {
    let bestIndex = 0;
    pending.forEach((item, index) => { if (item.request.priority > pending[bestIndex].request.priority) bestIndex = index; });
    const [next] = pending.splice(bestIndex, 1);
    if (Date.now() - next.trigger > VOICE_QUEUE.maxAgeMs) { note(next.request, next.trigger, null, null, 'queue_expired'); continue; }
    if (next.request.valid && !next.request.valid()) { note(next.request, next.trigger, null, null, 'state_changed'); continue; }
    speakNow(next.request, next.trigger, false);
  }
}

/** Priority-aware native speech: waits for the running message; only a clearly more important one interrupts. */
export function requestVoice(request: VoiceRequest): boolean {
  const trigger = Date.now();
  if (spokenKeys.has(request.onceKey)) { note(request, trigger, null, null, 'already_spoken'); return false; }
  if (request.valid && !request.valid()) { note(request, trigger, null, null, 'state_changed'); return false; }
  // Ausbleibende Rückmeldung der Sprachausgabe darf die Warteschlange nicht dauerhaft blockieren.
  const stuck = activePriority > 0 && trigger - speakingSinceMs > VOICE_QUEUE.maxSpeakMs;
  if (stuck) { activePriority = 0; speakingSinceMs = 0; generation++; }
  spokenKeys.add(request.onceKey);
  if (activePriority === 0) {
    const started = speakNow(request, trigger, stuck);
    if (!started) speakNextPending();
    return started;
  }
  if (request.priority > activePriority) return speakNow(request, trigger, true);
  pending.push({ request, trigger });
  if (pending.length > VOICE_QUEUE.maxPending) {
    let dropIndex = 0;
    pending.forEach((item, index) => { if (item.request.priority < pending[dropIndex].request.priority) dropIndex = index; });
    const [dropped] = pending.splice(dropIndex, 1);
    note(dropped.request, dropped.trigger, null, null, 'queue_overflow');
    if (dropped.request === request) return false;
  }
  return true;
}

export function cancelVoiceEvents() {
  activePriority = 0; generation++; pending = []; speakingSinceMs = 0;
  try { Speech.stop(); } catch { /* optional native service */ }
}
