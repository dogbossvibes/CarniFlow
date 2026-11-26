// ── Regeln für die System-Bewertungsabfrage (reine Funktionen, ohne I/O) ──
// Nur `StoreReview.requestReview()` – kein eigenes Vorschaltfenster
// (App-Store-Richtlinie 5.6.1, Google-Play-Richtlinie).

export const REVIEW_MIN_SAVES = 3;
export const REVIEW_MIN_DAYS_SINCE_FIRST_LAUNCH = 7;
export const REVIEW_MIN_DAYS_BETWEEN_PROMPTS = 90;
export const REVIEW_PROMPT_DELAY_MS = 2500;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lokaler Zähler/Zeitpunkte je Nutzer (AsyncStorage, nichts wird hochgeladen). */
export interface ReviewPromptState {
  /** Anzahl erfolgreich gespeicherter Fährten und Trainingseinheiten. */
  successfulSaves: number;
  /** Zeitpunkt der letzten Abfrage (ms) oder null. */
  lastPromptAt: number | null;
  /** App-Version, in der zuletzt abgefragt wurde, oder null. */
  lastPromptVersion: string | null;
  /** Zuletzt gezählte Fährten-/Einheits-IDs (dieselbe nur einmal zählen). */
  countedIds: string[];
}

export const EMPTY_REVIEW_STATE: ReviewPromptState = {
  successfulSaves: 0,
  lastPromptAt: null,
  lastPromptVersion: null,
  countedIds: [],
};

export type ReviewOutcome = 'success' | 'error' | 'cancelled';

export interface ReviewContext {
  now: number;
  /** Erster App-Start auf diesem Gerät (ms) oder null, wenn unbekannt. */
  firstLaunchAt: number | null;
  /** Installierte App-Version (z. B. "1.0.8") oder null, wenn unbekannt. */
  appVersion: string | null;
  /** Läuft gerade Legen, Liegezeit oder Absuche (oder ist es unbekannt)? */
  trackingActive: boolean;
  /** Ergebnis der Aktion, nach der gefragt würde. */
  outcome: ReviewOutcome;
}

export type ReviewDecision =
  | { ask: true }
  | { ask: false; reason:
      | 'not-success' | 'tracking-active' | 'too-few-saves' | 'first-launch-unknown'
      | 'too-early' | 'version-unknown' | 'already-asked-this-version' | 'asked-recently' };

/** Entscheidet, ob jetzt die System-Bewertungsabfrage angefordert werden darf. */
export function decideReviewPrompt(state: ReviewPromptState, ctx: ReviewContext): ReviewDecision {
  if (ctx.outcome !== 'success') return { ask: false, reason: 'not-success' };
  if (ctx.trackingActive) return { ask: false, reason: 'tracking-active' };
  if (state.successfulSaves < REVIEW_MIN_SAVES) return { ask: false, reason: 'too-few-saves' };
  if (ctx.firstLaunchAt == null) return { ask: false, reason: 'first-launch-unknown' };
  if (ctx.now - ctx.firstLaunchAt < REVIEW_MIN_DAYS_SINCE_FIRST_LAUNCH * DAY_MS) {
    return { ask: false, reason: 'too-early' };
  }
  if (!ctx.appVersion) return { ask: false, reason: 'version-unknown' };
  if (state.lastPromptVersion === ctx.appVersion) return { ask: false, reason: 'already-asked-this-version' };
  if (state.lastPromptAt != null && ctx.now - state.lastPromptAt < REVIEW_MIN_DAYS_BETWEEN_PROMPTS * DAY_MS) {
    return { ask: false, reason: 'asked-recently' };
  }
  return { ask: true };
}

const toCount = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const toTime = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const toText = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);

/** Gespeicherten Stand robust lesen; beschädigte Werte fallen auf Leerwerte zurück. */
export function sanitizeReviewState(raw: unknown): ReviewPromptState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_REVIEW_STATE, countedIds: [] };
  const r = raw as Record<string, unknown>;
  return {
    successfulSaves: toCount(r.successfulSaves),
    lastPromptAt: toTime(r.lastPromptAt),
    lastPromptVersion: toText(r.lastPromptVersion),
    countedIds: Array.isArray(r.countedIds)
      ? r.countedIds.filter((x): x is string => typeof x === 'string' && x.length > 0) : [],
  };
}

export function parseFirstLaunch(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
