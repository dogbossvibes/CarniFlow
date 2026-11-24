import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';

// ──────────────────────────────────────────────────────────────────────────
// Bewertung einsammeln (Quick Win 4): nach der 3. erfolgreich gespeicherten
// Absuche einmal den nativen Bewertungsdialog von Apple/Google zeigen, danach
// höchstens alle 90 Tage. Nie während Legen/Suchen, nie nach Abbruch/Fehler
// (aufgerufen wird nur nach erfolgreichem lokalem Speichern).
//
// Natives Modul `ExpoStoreReview` (Paket expo-store-review) kommt erst mit dem
// nächsten nativen Build. Bis dahin liefert requireOptionalNativeModule null und
// hier passiert nichts — deshalb auch per OTA sicher. Bewusst KEIN Import des
// Paket-JS (dessen requireNativeModule würde ohne Modul werfen).
//
// Speicher: lokal pro Konto (`store_review_state:<userId>`), nur Zähler und
// Datum. Keine Kundendaten, keine Fährtendaten, kein Server.
// ──────────────────────────────────────────────────────────────────────────

export const REVIEW_MIN_SUCCESSFUL_SEARCHES = 3;
export const REVIEW_MIN_INTERVAL_DAYS = 90;
export const REVIEW_DELAY_MS = 2000;
const MAX_REMEMBERED_RUNS = 20;
const DAY_MS = 86_400_000;

export interface ReviewState { successfulSearches: number; lastPromptAt: string | null; countedRunIds: string[] }
interface StoreReviewNative { isAvailableAsync(): Promise<boolean>; requestReview(): Promise<void> }

export const reviewStateKey = (userId: string) => `store_review_state:${userId}`;

export function sanitizeReviewState(raw: unknown): ReviewState {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const n = typeof r.successfulSearches === 'number' && Number.isInteger(r.successfulSearches) && r.successfulSearches >= 0 ? r.successfulSearches : 0;
  const last = typeof r.lastPromptAt === 'string' && Number.isFinite(Date.parse(r.lastPromptAt)) ? r.lastPromptAt : null;
  const ids = Array.isArray(r.countedRunIds) ? r.countedRunIds.filter((x): x is string => typeof x === 'string').slice(-MAX_REMEMBERED_RUNS) : [];
  return { successfulSearches: n, lastPromptAt: last, countedRunIds: ids };
}

/** Reine Regel: darf jetzt gefragt werden? */
export function shouldAskForReview(state: ReviewState, nowMs: number): boolean {
  if (state.successfulSearches < REVIEW_MIN_SUCCESSFUL_SEARCHES) return false;
  if (state.lastPromptAt == null) return true;
  return nowMs - Date.parse(state.lastPromptAt) >= REVIEW_MIN_INTERVAL_DAYS * DAY_MS;
}

async function load(userId: string): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(reviewStateKey(userId));
    return sanitizeReviewState(raw ? JSON.parse(raw) : null);
  } catch { return sanitizeReviewState(null); }
}
async function save(userId: string, state: ReviewState): Promise<void> {
  await AsyncStorage.setItem(reviewStateKey(userId), JSON.stringify(state));
}

let pending: { userId: string; sessionId: string } | null = null;

/**
 * Nach einer erfolgreich gespeicherten Absuche aufrufen. Zählt jede Absuche
 * (runId) nur einmal und merkt bei erfüllter Regel einen Dialog für die
 * folgende Auswertung vor. Wirft nie und wartet nicht auf die Navigation.
 */
export async function noteSuccessfulSearch(userId: string | null | undefined, sessionId: string | null | undefined, runId: string | null | undefined, nowMs = Date.now()): Promise<void> {
  if (!userId || !sessionId || !runId) return;
  try {
    const state = await load(userId);
    if (state.countedRunIds.includes(runId)) return;
    const next: ReviewState = {
      ...state,
      successfulSearches: state.successfulSearches + 1,
      countedRunIds: [...state.countedRunIds, runId].slice(-MAX_REMEMBERED_RUNS),
    };
    await save(userId, next);
    if (shouldAskForReview(next, nowMs)) pending = { userId, sessionId };
  } catch { /* best-effort: Bewertung ist nie wichtiger als die Fährte */ }
}

export interface ReviewDeps {
  /** true, solange irgendwo gelegt oder gesucht wird. */
  isTrackBusy: () => boolean;
  native?: StoreReviewNative | null;
  nowMs?: () => number;
  wait?: (ms: number) => Promise<void>;
}

/**
 * Auf der Auswertung derselben Fährte aufrufen. Zeigt den Systemdialog nur,
 * wenn er vorgemerkt ist, nach kurzer Pause nichts gelegt/gesucht wird und das
 * native Modul verfügbar ist (iOS: nicht in TestFlight). Gibt zurück, ob gefragt wurde.
 */
export async function maybeRequestReview(sessionId: string | null | undefined, deps: ReviewDeps): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const native = deps.native === undefined ? requireOptionalNativeModule<StoreReviewNative>('ExpoStoreReview') : deps.native;
    if (!native) { if (pending?.sessionId === sessionId) pending = null; return false; }
    // Pause zuerst: das Vormerken nach dem Speichern läuft parallel zur Navigation.
    await (deps.wait ?? (ms => new Promise(r => setTimeout(r, ms))))(REVIEW_DELAY_MS);
    const p = pending;
    if (!p || p.sessionId !== sessionId) return false;
    pending = null;   // höchstens ein Versuch pro Vormerkung
    if (deps.isTrackBusy()) return false;
    if (!await native.isAvailableAsync()) return false;
    const now = (deps.nowMs ?? Date.now)();
    const state = await load(p.userId);
    if (!shouldAskForReview(state, now)) return false;
    // Datum vor dem Dialog speichern: auch bei Fehler/Abbruch nicht erneut fragen.
    await save(p.userId, { ...state, lastPromptAt: new Date(now).toISOString() });
    await native.requestReview();
    return true;
  } catch { return false; }
}

/** Nur für Tests. */
export function __resetPendingReviewForTests() { pending = null; }
