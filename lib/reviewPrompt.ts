import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Application from 'expo-application';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { isOpenStatus } from '@/features/tracking/store/activeFaehrtenModel';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import {
  decideReviewPrompt, sanitizeReviewState, parseFirstLaunch,
  REVIEW_PROMPT_DELAY_MS, type ReviewOutcome, type ReviewPromptState,
} from '@/lib/reviewPromptRules';

// ── System-Bewertungsabfrage nach dem 3. erfolgreichen Speichern ──
// Rein lokal: Zähler/Zeitpunkte in AsyncStorage, nichts wird hochgeladen,
// keine Kundendaten werden gelesen oder verändert.
//
// Das native Modul `ExpoStoreReview` fehlt in den Production-Builds iOS 60 und
// Android 53/54. Deshalb NICHT `expo-store-review` importieren (dessen Import
// wirft ohne natives Modul, und `requestReview()` würde ersatzweise den Store
// öffnen). Wir holen das Modul optional und tun ohne Modul einfach nichts.

const FIRST_LAUNCH_KEY = 'anyvo_review_first_launch_v1';
export const reviewKeyForUser = (userId: string) => `anyvo_review_prompt_v1:${userId}`;

interface NativeStoreReview {
  isAvailableAsync?: () => Promise<boolean>;
  requestReview?: () => Promise<void>;
}

function loadNativeStoreReview(): NativeStoreReview | null {
  try {
    return requireOptionalNativeModule<NativeStoreReview>('ExpoStoreReview');
  } catch {
    return null;
  }
}

export type RequestResult = 'requested' | 'unavailable' | 'failed';

/** Fordert die System-Abfrage an, falls das native Modul da ist. Wirft nie. */
export async function requestNativeReview(native: NativeStoreReview | null = loadNativeStoreReview()): Promise<RequestResult> {
  try {
    if (!native?.isAvailableAsync || !native.requestReview) return 'unavailable';
    if (!(await native.isAvailableAsync())) return 'unavailable';
  } catch {
    return 'unavailable';
  }
  try {
    await native.requestReview();
    return 'requested';
  } catch {
    return 'failed';
  }
}

/** Ersten App-Start auf diesem Gerät merken (einmalig, nie überschreiben). */
export async function noteFirstLaunch(now: number = Date.now()): Promise<void> {
  try {
    if (await AsyncStorage.getItem(FIRST_LAUNCH_KEY)) return;
    await AsyncStorage.setItem(FIRST_LAUNCH_KEY, String(now));
  } catch { /* best-effort */ }
}

/** Läuft gerade Legen, Liegezeit oder Absuche? Unbekannt zählt als «läuft». */
export function isTrackingBusy(): boolean {
  const registry = useActiveFaehrten.getState();
  if (!registry.hydrated) return true;
  if (Object.values(registry.byDog).some((e) => isOpenStatus(e.status))) return true;
  const rec = useTrackingStore.getState();
  return rec.isRecording || rec.searchRunId != null;
}

async function readState(userId: string): Promise<ReviewPromptState> {
  const raw = await AsyncStorage.getItem(reviewKeyForUser(userId));
  return sanitizeReviewState(raw ? JSON.parse(raw) : null);
}

async function writeState(userId: string, state: ReviewPromptState): Promise<void> {
  await AsyncStorage.setItem(reviewKeyForUser(userId), JSON.stringify(state));
}

export interface ReviewPromptDeps {
  now: () => number;
  appVersion: () => string | null;
  trackingBusy: () => boolean;
  appActive: () => boolean;
  request: () => Promise<RequestResult>;
  /** Wartet `ms`; `signal.cancelled` wird beim Abbrechen gesetzt. */
  wait: (ms: number, signal: CancelSignal) => Promise<void>;
}

export interface CancelSignal { cancelled: boolean; cancel?: () => void }

// Nur EINE wartende Abfrage zur Zeit. Abbrechbar, z. B. wenn die Auswertung
// verlassen wird, bevor die Verzögerung abgelaufen ist.
let pending: CancelSignal | null = null;

/** Wartende Abfrage abbrechen (Auswertung verlassen, Tests). */
export function cancelPendingReviewPrompt(): void {
  if (!pending) return;
  pending.cancelled = true;
  pending.cancel?.();
  pending = null;
}

export const cancellableWait = (ms: number, signal: CancelSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal.cancel = () => { clearTimeout(timer); resolve(); };
});

const defaultDeps: ReviewPromptDeps = {
  now: () => Date.now(),
  appVersion: () => Application.nativeApplicationVersion ?? null,
  trackingBusy: isTrackingBusy,
  appActive: () => AppState.currentState === 'active',
  request: () => requestNativeReview(),
  wait: cancellableWait,
};

const MAX_COUNTED_IDS = 30;

/**
 * Nach einer gespeicherten Fährte/Trainingseinheit aufrufen, sobald Auswertung
 * bzw. Erfolg angezeigt werden. Zählt das Speichern mit (dieselbe ID nur
 * einmal) und fordert nach kurzer Verzögerung die System-Abfrage an, wenn alle
 * Regeln erfüllt sind. Wirft nie; ohne natives Modul passiert nichts.
 */
export async function onTrainingSaved(
  userId: string | null | undefined,
  entityId: string | null | undefined,
  outcome: ReviewOutcome = 'success',
  deps: ReviewPromptDeps = defaultDeps,
): Promise<boolean> {
  if (!userId || !entityId || outcome !== 'success') return false;
  cancelPendingReviewPrompt();
  const signal: CancelSignal = { cancelled: false };
  pending = signal;
  try {
    const counted = await readState(userId);
    if (counted.countedIds.includes(entityId)) return false;
    const state: ReviewPromptState = {
      ...counted,
      successfulSaves: counted.successfulSaves + 1,
      countedIds: [...counted.countedIds, entityId].slice(-MAX_COUNTED_IDS),
    };
    await writeState(userId, state);

    await deps.wait(REVIEW_PROMPT_DELAY_MS, signal);
    if (signal.cancelled || !deps.appActive()) return false;

    const firstLaunchAt = parseFirstLaunch(await AsyncStorage.getItem(FIRST_LAUNCH_KEY));
    const appVersion = deps.appVersion();
    const now = deps.now();
    const decision = decideReviewPrompt(state, {
      now, firstLaunchAt, appVersion, trackingActive: deps.trackingBusy(), outcome,
    });
    if (!decision.ask || signal.cancelled) return false;
    const result = await deps.request();
    if (result === 'unavailable') return false;

    // Auch bei einem Fehler des Systemdialogs als «gefragt» merken, damit nicht
    // sofort wieder gefragt wird. Frisch lesen: paralleles Mitzählen bleibt erhalten.
    const latest = await readState(userId);
    await writeState(userId, { ...latest, lastPromptAt: now, lastPromptVersion: appVersion });
    return result === 'requested';
  } catch {
    return false;
  } finally {
    if (pending === signal) pending = null;
  }
}
