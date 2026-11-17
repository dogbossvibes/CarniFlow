// Fährten-Simulator (T-192/T-205) — reiner Testcode.
// Übergabepunkt zwischen den Jest-Mocks (searchMocks.ts) und dem Suchlauf
// (searchRunner.tsx): die gemockte Positionsquelle und der gemockte
// Bewegungssensor legen hier ihre Callbacks ab; dazu eine nachgebildete
// Sprachausgabe (mit Sprechdauer) und ein In-Memory-Ersatz für die SQLite-Suchpunkte.
export interface BridgeFix { lat: number; lng: number; accuracy: number | null; speed: number | null; course: number | null; t: number }
export interface BridgeMotion {
  timestamp: number; movementState: string | null; stepDelta: number | null; accelerationMagnitude: number | null;
  rotationMagnitude: number | null; headingDelta: number | null; motionConfidence: number | null; activityAgeMs?: number | null;
}

/** Trennzeichen, mit dem der Simulator den onceKey an den Sprechtext hängt (nur im Test). */
export const VOICE_TAG = '⁣';

export interface SpokenEntry {
  text: string;
  /** onceKey der Ansage, z. B. `feature:winkel-0`, `track-end:…`. */
  key: string | null;
  startMs: number; endMs: number | null;
  /** Durch eine neue Ansage oder einen Abbruch beendet, bevor der Satz zu Ende war. */
  stopped: boolean;
}

interface SpeechOptions { onStart?: () => void; onDone?: () => void; onStopped?: () => void; onError?: () => void }
interface Utterance { text: string; opts: SpeechOptions | undefined }
interface Slot { u: Utterance; entry: SpokenEntry; timer: ReturnType<typeof setTimeout> | null }

/** Annahmen: Anlaufzeit der Sprachausgabe und Sprechtempo (deutsche Systemstimme, Tempo 1). */
export const SPEECH_START_LATENCY_MS = 120;
export const SPEECH_MS_PER_CHAR = 70;

export class FakeSpeech {
  private current: Slot | null = null;
  private queue: Utterance[] = [];
  log: SpokenEntry[] = [];

  reset(): void { this.current = null; this.queue = []; this.log = []; }

  speak(text: string, opts?: SpeechOptions): void {
    this.queue.push({ text, opts });
    if (!this.current) this.next();
  }

  stop(): void {
    this.queue = [];
    const cur = this.current;
    if (!cur) return;
    if (cur.timer) clearTimeout(cur.timer);
    this.current = null;
    cur.entry.endMs = Date.now(); cur.entry.stopped = true;
    cur.u.opts?.onStopped?.();
  }

  /** App-Prozess beendet: alles verstummt, ohne Rückrufe. */
  kill(): void {
    this.queue = [];
    if (this.current) { if (this.current.timer) clearTimeout(this.current.timer); this.current.entry.endMs = Date.now(); this.current.entry.stopped = true; }
    this.current = null;
  }

  private next(): void {
    const u = this.queue.shift();
    if (!u) return;
    const [plain, key] = u.text.split(VOICE_TAG);
    const entry: SpokenEntry = { text: plain, key: key ?? null, startMs: Date.now() + SPEECH_START_LATENCY_MS, endMs: null, stopped: false };
    this.log.push(entry);
    const slot: Slot = { u, entry, timer: null };
    this.current = slot;
    // Wie auf dem Gerät: Rückrufe kommen asynchron, nie innerhalb von speak().
    slot.timer = setTimeout(() => {
      if (this.current !== slot) return;
      u.opts?.onStart?.();
      if (this.current !== slot) return;
      slot.timer = setTimeout(() => {
        if (this.current !== slot) return;
        this.current = null;
        entry.endMs = Date.now();
        u.opts?.onDone?.();
        this.next();
      }, plain.length * SPEECH_MS_PER_CHAR);
    }, SPEECH_START_LATENCY_MS);
  }
}

export interface SqliteRow {
  sessionId: string; latitude: number; longitude: number; accuracy: number | null; altitude: number | null;
  speed: number | null; timestamp: string; breakBefore?: boolean;
}

export const searchBridge: {
  feedFix: ((fix: BridgeFix) => void) | null;
  feedMotion: ((sample: BridgeMotion) => void) | null;
  motionAvailable: boolean;
  /** Hat der Recorder Hintergrund-Ortung angefordert? (iOS: Positionen auch bei gesperrtem Bildschirm) */
  backgroundAllowed: boolean;
  /** Läuft der Android-Wachhalter der Absuche (T-209, Vordergrund-Dienst)? */
  keepaliveActive: boolean;
  speech: FakeSpeech;
  /** Was die App tatsächlich in SQLite geschrieben hätte (übersteht einen App-Abbruch). */
  sqlite: SqliteRow[];
} = { feedFix: null, feedMotion: null, motionAvailable: true, backgroundAllowed: false, keepaliveActive: false, speech: new FakeSpeech(), sqlite: [] };
