// Startprüfung für OTA-Updates beim Kaltstart.
//
// Problem: expo-updates lädt eine neue OTA standardmässig erst im Hintergrund und
// verwendet sie beim NÄCHSTEN Start. Kund:innen sehen deshalb nach jeder OTA (und nach
// jeder Neuinstallation) zuerst den alten Stand.
//
// Lösung: Beim Kaltstart dem Start-Download von expo-updates ZUSCHAUEN. Lädt er eine neue
// OTA, erscheint «ANYVO wird aktualisiert …»; ist sie fertig geladen, startet die App sofort
// neu – aber NIE, wenn eine Fährte aufgenommen wird oder eine unterbrochene Aufnahme wartet.
// Ohne Netz, bei Fehlern oder nach Ablauf der Zeit startet die App normal; die OTA greift
// dann beim nächsten Start.
//
// Warum zuschauen statt selbst nachfragen (Befund 2026-11-21): expo-updates arbeitet seine
// Aufgaben streng nacheinander ab. Die Start-Phase gibt die Warteschlange erst frei, wenn
// der Hintergrund-Download fertig ist. Ein eigenes checkForUpdateAsync() beim Start wartet
// deshalb genau dann am längsten, wenn es eine neue OTA gibt – die frühere Zeitgrenze von
// 1,5 s lief ab und der Hinweis erschien nie.
//
// Diese Datei enthält nur die Ablauflogik (ohne React/Native), damit sie testbar ist.

export const CHECK_TIMEOUT_MS = 1500;   // warten, bis klar ist, ob eine neue OTA kommt
export const FETCH_TIMEOUT_MS = 8000;   // Laden der neuen OTA (im Mockup «höchstens 8 Sekunden»)

export type StartCheckOutcome =
  | 'reload'        // neue OTA geladen, App darf neu starten
  | 'continue'      // nichts Neues, Fehler, Timeout oder gesperrt → normal starten
  | 'pending';      // neue OTA geladen, aber Neustart gesperrt → Hinweis «Update bereit»

/** Ausschnitt aus dem Zustand von expo-updates, den die Startprüfung braucht. */
export interface StartState {
  isStartupProcedureRunning: boolean;   // Start-Phase (Nachfrage + Hintergrund-Download) läuft
  isUpdateAvailable: boolean;           // Server hat eine neuere OTA gemeldet
  isUpdatePending: boolean;             // neue OTA ist fertig geladen
  isDownloading: boolean;
  restartCount: number;                 // Neustarts des JS seit dem Kaltstart
  downloadProgress?: number;            // 0..1, nur während des Ladens
}

export interface StartCheckDeps {
  enabled: boolean;                                   // Updates aktiv, kein Dev-Build, kein Notfallstart
  isProtected: () => Promise<boolean>;                // laufende/unterbrochene Aufnahme?
  getState: () => StartState;
  subscribe: (listener: (state: StartState) => void) => () => void;
  onFetching?: () => void;                            // UI: «ANYVO wird aktualisiert …» zeigen
  onProgress?: (progress: number) => void;            // UI: Fortschritt 0..1
  checkTimeoutMs?: number;
  fetchTimeoutMs?: number;
}

const TIMEOUT = Symbol('timeout');

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(TIMEOUT), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(TIMEOUT); });
  });
}

/** Schutzprüfung mit Zeitgrenze: hängt sie, gilt die App als geschützt (kein Neustart). */
async function protectedNow(deps: StartCheckDeps): Promise<boolean> {
  const r = await withTimeout(deps.isProtected(), deps.checkTimeoutMs ?? CHECK_TIMEOUT_MS);
  return r === TIMEOUT ? true : r;
}

export type StartPhase = 'unknown' | 'loading' | 'ready' | 'none';

/** Ordnet den Zustand von expo-updates ein. */
export function classifyStartState(s: StartState): StartPhase {
  if (s.isUpdatePending) return 'ready';                      // fertig geladen
  if (!s.isStartupProcedureRunning) return 'none';            // Start-Phase vorbei, nichts geladen (kein Update oder Fehler)
  if (s.isDownloading || s.isUpdateAvailable) return 'loading';
  return 'unknown';                                           // Nachfrage beim Server läuft noch
}

/** Wartet, bis `done` für einen Zustand zutrifft, höchstens `ms`. Meldet jeden Zustand an `seen`. */
function waitForPhase(
  deps: StartCheckDeps, done: (p: StartPhase) => boolean, ms: number, seen?: (s: StartState) => void,
): Promise<StartPhase | typeof TIMEOUT> {
  return new Promise(resolve => {
    let finished = false;
    let unsubscribe: () => void = () => {};
    const finish = (v: StartPhase | typeof TIMEOUT) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(v);
    };
    const look = (s: StartState) => {
      if (finished) return;
      seen?.(s);
      const p = classifyStartState(s);
      if (done(p)) finish(p);
    };
    const timer = setTimeout(() => finish(TIMEOUT), ms);
    const off = deps.subscribe(look);
    unsubscribe = off;
    if (finished) off(); else look(deps.getState());   // Zustand kann sich vor dem Anmelden schon geändert haben
  });
}

/** Nach einem Timeout weiter zuschauen: wird die OTA später fertig, nur den Hinweis zeigen. */
function watchLate(deps: StartCheckDeps, late?: (outcome: 'pending') => void) {
  if (!late) return;
  let closed = false;
  let unsubscribe: () => void = () => {};
  const look = (s: StartState) => {
    if (closed) return;
    const p = classifyStartState(s);
    if (p !== 'ready' && p !== 'none') return;
    closed = true;
    unsubscribe();
    if (p === 'ready') late('pending');
  };
  const off = deps.subscribe(look);
  unsubscribe = off;
  if (closed) off(); else look(deps.getState());
}

/**
 * Entscheidet beim Kaltstart, ob die App mit einer neuen OTA neu startet.
 * Wirft nie. Der Schutz wird am Anfang UND direkt vor dem Neustart geprüft.
 * `late` wird aufgerufen, wenn das Laden erst nach der Zeitgrenze fertig wird (→ Hinweis).
 */
export async function runStartCheck(
  deps: StartCheckDeps,
  late?: (outcome: 'pending') => void,
): Promise<StartCheckOutcome> {
  if (!deps.enabled) return 'continue';
  try {
    // Nach einem Neustart in derselben Sitzung nie nochmals neu laden (keine Schleife).
    if (deps.getState().restartCount > 0) return 'continue';
    if (await protectedNow(deps)) return 'continue';

    const first = await waitForPhase(deps, p => p !== 'unknown', deps.checkTimeoutMs ?? CHECK_TIMEOUT_MS);
    if (first === TIMEOUT) { watchLate(deps, late); return 'continue'; }
    if (first === 'none') return 'continue';

    let phase: StartPhase = first;
    if (phase === 'loading') {
      deps.onFetching?.();
      const loaded = await waitForPhase(
        deps, p => p === 'ready' || p === 'none', deps.fetchTimeoutMs ?? FETCH_TIMEOUT_MS,
        s => { if (typeof s.downloadProgress === 'number') deps.onProgress?.(Math.min(1, Math.max(0, s.downloadProgress))); },
      );
      // Laden läuft weiter; ist es später fertig, nur Hinweis zeigen (kein Neustart mitten in der Nutzung).
      if (loaded === TIMEOUT) { watchLate(deps, late); return 'continue'; }
      phase = loaded;
    }
    if (phase !== 'ready') return 'continue';

    // Direkt vor dem Neustart nochmals prüfen: könnte inzwischen eine Aufnahme begonnen haben?
    if (await protectedNow(deps)) return 'pending';
    return 'reload';
  } catch {
    return 'continue';
  }
}
