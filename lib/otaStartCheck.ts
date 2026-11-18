// Startprüfung für OTA-Updates beim Kaltstart.
//
// Problem: expo-updates lädt eine neue OTA standardmässig erst im Hintergrund und
// verwendet sie beim NÄCHSTEN Start. Kund:innen sehen deshalb nach jeder OTA (und nach
// jeder Neuinstallation) zuerst den alten Stand.
//
// Lösung: Beim Kaltstart kurz nachfragen. Ist eine neue OTA da, wird sie mit klarer
// Zeitgrenze geladen und die App sofort neu gestartet – aber NIE, wenn eine Fährte
// aufgenommen wird oder eine unterbrochene Aufnahme wartet. Ohne Netz, bei Fehlern oder
// nach Ablauf der Zeit startet die App normal; die OTA greift dann beim nächsten Start.
//
// Diese Datei enthält nur die Ablauflogik (ohne React/Native), damit sie testbar ist.

export const CHECK_TIMEOUT_MS = 1500;   // Nachfrage beim Server, sonst normal starten
export const FETCH_TIMEOUT_MS = 8000;   // Laden der neuen OTA (im Mockup «höchstens 8 Sekunden»)

export type StartCheckOutcome =
  | 'reload'        // neue OTA geladen, App darf neu starten
  | 'continue'      // nichts Neues, Fehler, Timeout oder gesperrt → normal starten
  | 'pending';      // neue OTA geladen, aber Neustart gesperrt → Hinweis «Update bereit»

export interface StartCheckDeps {
  enabled: boolean;                                   // Updates aktiv, kein Dev-Build, kein Notfallstart
  isProtected: () => Promise<boolean>;                // laufende/unterbrochene Aufnahme?
  check: () => Promise<{ isAvailable: boolean }>;
  fetch: () => Promise<{ isNew: boolean }>;
  onFetching?: () => void;                            // UI: «ANYVO wird aktualisiert …» zeigen
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

/**
 * Entscheidet beim Kaltstart, ob die App mit einer neuen OTA neu startet.
 * Wirft nie. Der Schutz wird vor der Nachfrage UND direkt vor dem Neustart geprüft.
 * `late` wird aufgerufen, wenn das Laden erst nach dem Timeout fertig wird (→ Hinweis).
 */
export async function runStartCheck(
  deps: StartCheckDeps,
  late?: (outcome: 'pending') => void,
): Promise<StartCheckOutcome> {
  if (!deps.enabled) return 'continue';
  try {
    if (await protectedNow(deps)) return 'continue';

    const checked = await withTimeout(deps.check(), deps.checkTimeoutMs ?? CHECK_TIMEOUT_MS);
    if (checked === TIMEOUT || !checked.isAvailable) return 'continue';

    deps.onFetching?.();
    const fetchPromise = deps.fetch();
    const fetched = await withTimeout(fetchPromise, deps.fetchTimeoutMs ?? FETCH_TIMEOUT_MS);
    if (fetched === TIMEOUT) {
      // Laden läuft weiter; ist es später fertig, nur Hinweis zeigen (kein Neustart mitten in der Nutzung).
      fetchPromise.then(r => { if (r.isNew) late?.('pending'); }, () => { /* still */ });
      return 'continue';
    }
    if (!fetched.isNew) return 'continue';

    // Direkt vor dem Neustart nochmals prüfen: könnte inzwischen eine Aufnahme begonnen haben?
    if (await protectedNow(deps)) return 'pending';
    return 'reload';
  } catch {
    return 'continue';
  }
}
