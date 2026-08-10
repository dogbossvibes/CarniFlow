// ──────────────────────────────────────────────────────────────────────────
// Off-Track-Erkennung für die Fährtenabsuche — REINE, testbare Logik (kein React/
// Expo, keine zweite Geometrie-Engine). Verbraucht den bereits vorhandenen
// seitlichen Abstand (crossTrackM = projectForward().devM, windowed um den
// Fortschritt) plus die GPS-accuracy und liefert eine deterministische State
// Machine mit GPS-adaptiven Schwellen, Hysterese, Debounce und Session-Statistik.
//
// WICHTIG (fachlich): Das Smartphone ist beim Hundeführer. „off_track" bedeutet
// „Du entfernst dich von der Fährte" — NICHT „der Hund ist abgewichen".
// ──────────────────────────────────────────────────────────────────────────

export type OffTrackState = 'on_track' | 'warning' | 'off_track';
export type OffTrackTransition = null | 'warning' | 'off_track' | 'recovered';

// Zentrale Konstanten (eine Source of Truth; per Tests belegt).
export const OFF_TRACK = {
  MIN_WARNING_M: 3,            // untere Warngrenze auch bei sehr gutem GPS
  ACCURACY_WARN_FACTOR: 1.5,   // warning ≈ accuracy · Faktor
  OFF_EXTRA_M: 2,             // off_track = warning + Sicherheitsabstand
  RECOVERY_FACTOR: 0.6,        // Entwarnung deutlich unter der Warngrenze (Hysterese)
  MAX_RELIABLE_ACCURACY_M: 20, // darüber: GPS zu ungenau → keine aggressive Warnung
  WARN_CONSECUTIVE: 2,         // bestätigte Fixes bis WARNING
  OFF_CONSECUTIVE: 3,          // bestätigte Fixes bis OFF_TRACK
  RECOVER_CONSECUTIVE: 3,      // bestätigte gute Fixes bis Entwarnung
} as const;

export interface OffTrackThresholds {
  warningM: number;
  offTrackM: number;
  recoveryM: number;
  reliable: boolean;   // false = GPS zu ungenau für eine zuverlässige Spurprüfung
}

// GPS-adaptive Schwellen. Kein fixer 1-/2-m-Grenzwert; sehr gutes GPS wird ab
// ~MIN_WARNING_M aufmerksam, schlechteres GPS entsprechend großzügiger.
export function getOffTrackThreshold(input: { accuracyM: number | null }): OffTrackThresholds {
  const acc = input.accuracyM;
  const reliable = acc != null && acc <= OFF_TRACK.MAX_RELIABLE_ACCURACY_M;
  // Für die Schwellenberechnung eine konservative accuracy annehmen, wenn unbekannt.
  const effAcc = acc == null ? OFF_TRACK.MIN_WARNING_M : acc;
  const warningM = Math.max(OFF_TRACK.MIN_WARNING_M, effAcc * OFF_TRACK.ACCURACY_WARN_FACTOR);
  const offTrackM = warningM + OFF_TRACK.OFF_EXTRA_M;
  const recoveryM = warningM * OFF_TRACK.RECOVERY_FACTOR;
  return { warningM, offTrackM, recoveryM, reliable };
}

export interface OffTrackSnapshot {
  state: OffTrackState;
  distanceM: number;          // letzter (zuverlässiger) seitlicher Abstand
  warnStreak: number;
  offStreak: number;
  recoverStreak: number;
  // Session-Statistik (runtime/session-lokal, keine DB):
  events: number;             // bestätigte Off-Track-Ereignisse
  offSinceMs: number | null;  // Start des aktuellen Off-Track (für Live-Dauer)
  offDurationMs: number;      // aufsummierte, abgeschlossene Off-Track-Dauer
  maxDeviationM: number;      // größte bestätigte Abweichung
}

export function initialOffTrack(): OffTrackSnapshot {
  return {
    state: 'on_track', distanceM: 0, warnStreak: 0, offStreak: 0, recoverStreak: 0,
    events: 0, offSinceMs: null, offDurationMs: 0, maxDeviationM: 0,
  };
}

export interface OffTrackInput {
  crossTrackM: number;        // seitlicher Abstand zur Fährte (windowed projectForward().devM)
  accuracyM: number | null;   // GPS-Genauigkeit des Fixes
  accepted: boolean;          // wurde der Fix vom bestehenden GPS-Filter akzeptiert?
  nowMs: number;
}

export interface OffTrackResult {
  snap: OffTrackSnapshot;
  transition: OffTrackTransition;   // nur bei echtem State-Wechsel gesetzt
  thresholds: OffTrackThresholds;
  reliable: boolean;                // false → GPS zu ungenau (State gehalten)
  freezeProgress: boolean;          // true während bestätigtem off_track (Trusted-Progress-Schutz)
}

// Reiner Reducer: ein Fix → nächster State. State-Transitions berücksichtigen
// mehrere plausible Fixes (Debounce) und Hysterese (Entwarnung deutlich unter der
// Warngrenze). Unzuverlässige/verworfene Fixes halten den State (keine Eskalation).
export function stepOffTrack(prev: OffTrackSnapshot, input: OffTrackInput): OffTrackResult {
  const th = getOffTrackThreshold({ accuracyM: input.accuracyM });
  const reliable = input.accepted && th.reliable && Number.isFinite(input.crossTrackM);

  // Unzuverlässig → State halten, Streaks nicht hochzählen, off-Dauer aber weiter mitzählen.
  if (!reliable) {
    const held = accrueDuration(prev, input.nowMs);
    return { snap: held, transition: null, thresholds: th, reliable: false, freezeProgress: prev.state === 'off_track' };
  }

  const x = input.crossTrackM;
  let s: OffTrackSnapshot = { ...prev, distanceM: x };
  let transition: OffTrackTransition = null;

  const far = x >= th.offTrackM;
  const warn = x >= th.warningM;
  const near = x <= th.recoveryM;

  if (s.state === 'off_track') {
    // laufende Off-Track-Dauer + Maximum mitführen
    s = accrueDuration(s, input.nowMs);
    if (x > s.maxDeviationM) s.maxDeviationM = x;
    if (near) {
      s.recoverStreak += 1;
      if (s.recoverStreak >= OFF_TRACK.RECOVER_CONSECUTIVE) {
        // abgeschlossene Off-Track-Phase in die Statistik übernehmen
        s.offDurationMs += s.offSinceMs != null ? Math.max(0, input.nowMs - s.offSinceMs) : 0;
        s.offSinceMs = null;
        s.state = 'on_track'; s.warnStreak = 0; s.offStreak = 0; s.recoverStreak = 0;
        transition = 'recovered';
      }
    } else {
      s.recoverStreak = 0;
    }
  } else if (s.state === 'warning') {
    if (far) {
      s.offStreak += 1; s.recoverStreak = 0;
      if (s.offStreak >= OFF_TRACK.OFF_CONSECUTIVE) {
        s.state = 'off_track'; s.events += 1; s.offSinceMs = input.nowMs;
        s.maxDeviationM = Math.max(s.maxDeviationM, x);
        s.warnStreak = 0; s.recoverStreak = 0;
        transition = 'off_track';
      }
    } else if (near) {
      s.offStreak = 0; s.recoverStreak += 1;
      if (s.recoverStreak >= OFF_TRACK.RECOVER_CONSECUTIVE) {
        s.state = 'on_track'; s.warnStreak = 0; s.recoverStreak = 0;
        transition = 'recovered';
      }
    } else {
      // Hysterese-Totzone (recovery < x < offTrack) → WARNING halten, kein Flattern
      s.offStreak = 0; s.recoverStreak = 0;
    }
  } else { // on_track
    if (warn) {
      s.warnStreak += 1; s.recoverStreak = 0;
      if (s.warnStreak >= OFF_TRACK.WARN_CONSECUTIVE) {
        s.state = 'warning'; s.warnStreak = 0;
        transition = 'warning';
        if (x > s.maxDeviationM) s.maxDeviationM = x;
        // sofort gültige Off-Zählung starten, falls schon jenseits der Off-Schwelle
        if (far) s.offStreak = 1;
      }
    } else {
      s.warnStreak = 0;
    }
  }

  return { snap: s, transition, thresholds: th, reliable: true, freezeProgress: s.state === 'off_track' };
}

// Laufende Off-Track-Dauer fortschreiben, ohne den State zu ändern (auch bei
// unzuverlässigen Fixes, damit die Statistik lückenlos bleibt).
function accrueDuration(prev: OffTrackSnapshot, nowMs: number): OffTrackSnapshot {
  if (prev.state !== 'off_track' || prev.offSinceMs == null) return prev;
  // offSinceMs bleibt der Anker; die Live-Dauer wird bei Recovery final summiert.
  return prev;
}

// Live-Gesamtdauer außerhalb der Spur (abgeschlossene + laufende Phase).
export function offTrackTotalDurationMs(snap: OffTrackSnapshot, nowMs: number): number {
  const ongoing = snap.state === 'off_track' && snap.offSinceMs != null
    ? Math.max(0, nowMs - snap.offSinceMs) : 0;
  return snap.offDurationMs + ongoing;
}
