// ──────────────────────────────────────────────────────────────────────────
// Search Start Acquisition — REINE, testbare Logik (kein React/Expo, KEINE
// neue Search-Engine, kein Map-Matching, keine externe Routing-Engine).
//
// Feldtest 06.09.2026: der reale Fährtenansatz lag räumlich sehr nah an einem
// SPÄTEREN Streckenabschnitt (Startbereich und späterer Schenkel eng
// nebeneinander). Ohne Absicherung würden zwei bestehende Mechanismen SOFORT
// ab dem allerersten Fix nach dem Start-Tap greifen, obwohl noch gar nicht
// eindeutig feststeht, dass der Handler wirklich am Anfang der Fährte steht:
//   1. die fensterbasierte Track-Projektion (projectForward, Fenster
//      [cursor-BACK_M, cursor+LOOKAHEAD_M], cursor startet bei 0 → initiales
//      Fenster ist bereits [0, 20] m Bogenlänge),
//   2. die virtuelle Hundeposition (Handler-Fortschritt + gewählter Hund-
//      abstand, z. B. 5 m) — die addiert den Hundabstand schon beim allerersten
//      Fix, bevor der Handler nachweislich am Start steht.
//
// State Machine: SEEKING_START → START_CANDIDATE → START_LOCKED. Danach
// arbeitet die bestehende, UNVERÄNDERTE order-aware Cursor-/Projektionslogik
// in useSearchRecorder normal weiter (LOOKAHEAD_M/BACK_M/ADVANCE_DEV_M) —
// dieses Modul ersetzt sie nicht. Es beschränkt nur (a) das Startfenster, in
// dem VOR dem Lock überhaupt ein Kandidat gesucht wird, und (b) den Zeitpunkt,
// ab dem der Hundabstand auf den Fortschritt addiert wird.
// ──────────────────────────────────────────────────────────────────────────

import { calculateHeading, type LatLng as GpsLatLng } from '@/features/tracking/utils/gpsFilter';
import { projectForward, type LL } from '@/features/tracking/utils/searchGeometry';

export type SearchStartState = 'SEEKING_START' | 'START_CANDIDATE' | 'START_LOCKED';

export interface SearchStartConfig {
  /** Bogenlänge-Korridor ab Track-Beginn, in dem VOR dem Lock ein Kandidat gesucht wird (m). Punkt 3. */
  startWindowM: number;
  /** So viele aufeinanderfolgende plausible Fixes nötig, bevor gelockt wird. Punkt 2/6. */
  requiredFixes: number;
  /** Jenseits dieser Genauigkeit wird ein Fix gar nicht mehr für den Lock gewertet — grosszügig, kein Zwang auf perfektes GPS (Punkt 7). */
  maxAccuracyM: number;
  /** Grobe Kurstoleranz (Grad) gegen den ersten Schenkel — nur zusätzliche Evidenz, kein Hard-Gate (Punkt 5/16). */
  maxHeadingDeviationDeg: number;
  /**
   * Core-Motion-Bonus (Meter) auf die erlaubte seitliche Abweichung, NUR wenn
   * ein Motion-Sample mit ausreichender Confidence aktive Fussbewegung zeigt
   * (walking/running) — reine Zusatzevidenz analog zur Kurstoleranz, niemals
   * ein Gate. Ohne Motion (Android, iOS-Permission verweigert, Modul fehlt)
   * bleibt das Verhalten exakt wie zuvor: `motion` ist optional/`undefined`
   * und dieser Bonus greift schlicht nie.
   */
  motionAllowanceBonusM: number;
  /** Mindest-Confidence des Motion-Samples, damit der Bonus überhaupt zählt. */
  minMotionConfidenceForBonus: number;
}

// Bewusst dieselbe "3 aufeinanderfolgende Fixes"-Konvention wie beim
// Fährtenansatz-Arming (startApproach.ts REQUIRED_CONSECUTIVE_FIXES) — ein
// Wert, eine Konvention, kein zweiter Magic-Number-Ursprung.
export const DEFAULT_SEARCH_START_CONFIG: SearchStartConfig = {
  startWindowM: 12,
  requiredFixes: 3,
  maxAccuracyM: 25,
  maxHeadingDeviationDeg: 70,
  motionAllowanceBonusM: 2,
  minMotionConfidenceForBonus: 0.6,
};

// Bewegungszustand analog zu AnyvoMotionModule/trackFusionEngine — bewusst
// hier noch einmal lokal deklariert (statt importiert), damit dieses reine
// Engine-Modul weiterhin ohne Abhängigkeit zu modules/anyvo-motion testbar
// bleibt (gleiches Prinzip wie der bestehende LL-Import aus searchGeometry).
export type SearchStartMovementState = 'stationary' | 'walking' | 'running' | 'automotive' | 'unknown';

// Optionales, aggregiertes Motion-Sample seit dem letzten Fix (Punkt 3/7 der
// Core-Motion-Spezifikation). headingDelta ist bewusst NICHT hier enthalten,
// da CMDeviceMotion ohne Kompass-Referenzrahmen keine verlässliche absolute
// Peilung liefert — hier zählt nur "bewegt sich der Handler aktiv", nicht
// "in welche Richtung", um keine falsche Präzision vorzutäuschen.
export interface SearchStartMotionInput {
  movementState: SearchStartMovementState;
  /** 0..1, aus AnyvoMotionManager/trackFusionEngine — je höher, desto verlässlicher movementState. */
  motionConfidence: number;
}

export interface SearchStartAcqState {
  state: SearchStartState;
  support: number;            // aufeinanderfolgende plausible Fixes im aktuellen Anlauf
  lockedAtM: number | null;   // gesetzt genau einmal bei START_LOCKED: initialer Cursor-Progress
}

export const INITIAL_SEARCH_START: SearchStartAcqState = { state: 'SEEKING_START', support: 0, lockedAtM: null };

// Ein Fix, wie ihn useSearchRecorder für die Start-Acquisition übergibt.
export interface SearchStartFixInput {
  position: LL;
  accuracy: number | null;
  /** Bewegungsrichtung SEIT dem letzten akzeptierten Punkt (Grad), oder null ohne plausible Bewegung. */
  headingDeg: number | null;
  /**
   * OPTIONAL: aggregiertes Core-Motion-Sample seit dem letzten Fix (Punkt 7).
   * `undefined`/`null`, wenn Core Motion nicht verfügbar/erlaubt ist (Android,
   * iOS-Permission verweigert, natives Modul fehlt) — reine Zusatzevidenz,
   * niemals ein Gate. Bestehende Aufrufer, die dieses Feld nicht setzen,
   * verhalten sich exakt wie vor dieser Erweiterung.
   */
  motion?: SearchStartMotionInput | null;
}

export interface SearchStartEvaluation {
  /** Kandidaten-Bogenlänge INNERHALB [0, startWindowM] — null, falls kein Kandidat im Fenster liegt. */
  candidateAtM: number | null;
  /** Seitliche Abweichung zu diesem Kandidaten (m). */
  candidateDevM: number | null;
  /** Diagnose (Punkt 8/24): grober Hinweis, ob ausserhalb des Startfensters ein annähernd ebenso naher Abschnitt liegt. Beeinflusst NICHT die Entscheidung — das Startfenster selbst ist die Sicherheitsgrenze. */
  ambiguityM: number | null;
}

// Kandidaten-Suche NUR innerhalb des Startfensters [0, startWindowM] — bewusst
// dieselbe Projektionsfunktion wie die normale Cursor-Logik (projectForward),
// nur mit einem viel engeren, festen Fenster statt cursor-relativ. Spätere
// Schenkel ausserhalb dieses Fensters werden vor dem Lock NIE als Kandidat
// betrachtet, selbst wenn sie geometrisch näher an der aktuellen Position
// liegen (Punkt 3, Testfall E).
export function evaluateStartCandidate(
  position: LL, laidPoints: LL[], cum: number[], cfg: SearchStartConfig,
): SearchStartEvaluation {
  if (laidPoints.length < 2) {
    return { candidateAtM: null, candidateDevM: null, ambiguityM: null };
  }
  const windowed = projectForward(position, laidPoints, cum, 0, cfg.startWindowM, 0);
  if (!Number.isFinite(windowed.devM)) {
    return { candidateAtM: null, candidateDevM: null, ambiguityM: null };
  }
  // Rein diagnostisch: volle Bogenlänge als Vergleichsfenster, um zu sehen, ob
  // ausserhalb des Startfensters ein nahezu ebenso naher (oder näherer)
  // Abschnitt existiert — genau der Fall aus dem Feldtest. Ändert nichts an
  // candidateAtM/candidateDevM, nur am geloggten ambiguityM.
  const total = cum.length ? cum[cum.length - 1] : 0;
  const full = total > cfg.startWindowM
    ? projectForward(position, laidPoints, cum, 0, total, 0)
    : windowed;
  const ambiguityM = Number.isFinite(full.devM) ? Math.max(0, windowed.devM - full.devM) : null;
  return { candidateAtM: windowed.atM, candidateDevM: windowed.devM, ambiguityM };
}

// Kleinster Winkelunterschied (0..180°), robust gegen den 0/360°-Wrap.
function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Plausibilität EINES Fixes für den Start-Lock. Kein Mehrsegment-Vergleich
// nötig — die Kandidatensuche ist bereits per Startfenster beschränkt
// (evaluateStartCandidate); hier wird nur bewertet, ob DIESER eine Kandidat
// gut genug ist: Abweichung passend zur Genauigkeit (degradiert graziös,
// Punkt 7), Kurs nur als zusätzliche, nie hart blockierende Evidenz (Punkt 5/16).
export function isPlausibleStartFix(evalu: SearchStartEvaluation, sample: SearchStartFixInput, firstLegHeadingDeg: number | null, cfg: SearchStartConfig): boolean {
  if (evalu.candidateAtM == null || evalu.candidateDevM == null) return false;
  if (sample.accuracy != null && sample.accuracy > cfg.maxAccuracyM) return false;

  // Erlaubte seitliche Abweichung skaliert mit der gemeldeten Genauigkeit
  // (accuracy 3 m → strenge ~3 m Toleranz; accuracy 15 m → grosszügige ~15 m) —
  // kein starrer Meter-Wert, degradiert graziös statt fest zu blockieren.
  let allowance = sample.accuracy != null ? Math.max(3, sample.accuracy) : 6;

  // Core-Motion-Zusatzevidenz (Punkt 7): zeigt das Motion-Sample mit
  // ausreichender Confidence aktive Fussbewegung (walking/running), wird die
  // Toleranz leicht aufgeweitet — der Handler bewegt sich nachweislich, ein
  // etwas grösserer seitlicher Versatz ist dann eher normales GPS-Rauschen
  // als ein falscher Kandidat. "stationary"/fehlende Motion-Daten bleiben
  // NEUTRAL (kein Malus) — ein ruhig stehender Handler direkt am Start darf
  // nicht schlechter bewertet werden als einer ohne Motion-Modul (Punkt 16,
  // gleiche Lehre wie aus dem Stillstands-Regressions-Fix c7eba84).
  if (
    sample.motion != null &&
    sample.motion.motionConfidence >= cfg.minMotionConfidenceForBonus &&
    (sample.motion.movementState === 'walking' || sample.motion.movementState === 'running')
  ) {
    allowance += cfg.motionAllowanceBonusM;
  }

  if (evalu.candidateDevM > allowance) return false;

  // Kurs: nur zusätzliche Evidenz. Fehlender/instabiler Kurs blockiert nie
  // (Punkt 16). Ein STARKER Widerspruch verhindert das Locken — Toleranz
  // wächst mit schlechterer Genauigkeit (grobe Kursschätzung bei viel Jitter).
  if (sample.headingDeg != null && firstLegHeadingDeg != null) {
    const tolerance = cfg.maxHeadingDeviationDeg + (sample.accuracy != null ? Math.min(sample.accuracy, 20) : 0);
    if (angleDiffDeg(sample.headingDeg, firstLegHeadingDeg) > tolerance) return false;
  }

  return true;
}

// Reiner Reducer: ein Fix → nächster Zustand.
//   • plausibel   → Support +1; ab requiredFixes → START_LOCKED
//   • unplausibel → Support zurück auf 0 (ein Ausreisser darf nicht falsch
//     locken, Punkt 6/14), Zustand fällt auf SEEKING_START zurück
//   • einmal START_LOCKED → bleibt gelockt (Punkt 9/11: kein Zurückfallen
//     durch GPS-Jitter nach dem Lock).
export function stepSearchStart(
  prev: SearchStartAcqState, evalu: SearchStartEvaluation, sample: SearchStartFixInput,
  firstLegHeadingDeg: number | null, cfg: SearchStartConfig,
): SearchStartAcqState {
  if (prev.state === 'START_LOCKED') return prev;

  if (!isPlausibleStartFix(evalu, sample, firstLegHeadingDeg, cfg)) {
    return { state: 'SEEKING_START', support: 0, lockedAtM: null };
  }

  const support = prev.support + 1;
  if (support >= cfg.requiredFixes) {
    return { state: 'START_LOCKED', support, lockedAtM: Math.max(0, evalu.candidateAtM ?? 0) };
  }
  return { state: 'START_CANDIDATE', support, lockedAtM: null };
}

// Richtung des ERSTEN Schenkels der gelegten Fährte (Grad) — Vergleichsbasis
// für die Kurs-Evidenz (Punkt 5/16). Nimmt einen Punkt spürbar weiter vorn
// (statt nur der ersten zwei Rohpunkte), damit kurze, verrauschte
// Anfangssegmente die Richtung nicht verfälschen. Null bei zu kurzer/keiner Fährte.
export function firstLegHeadingDeg(laidPoints: LL[], cum: number[], sampleAtM = 5): number | null {
  if (laidPoints.length < 2) return null;
  const total = cum.length ? cum[cum.length - 1] : 0;
  if (total <= 0) return null;
  const target = Math.min(sampleAtM, total);
  // pointAtDistance ist bewusst nicht hier importiert (kleiner Kreis, keine
  // weitere Abhängigkeit) — dieselbe lineare Interpolation reicht hier aus,
  // eine Bogenlänge zu finden, die spürbar vor dem ersten Rohpunkt liegt.
  for (let i = 1; i < laidPoints.length; i++) {
    if (target <= cum[i]) {
      const segLen = cum[i] - cum[i - 1];
      const t = segLen > 0 ? (target - cum[i - 1]) / segLen : 0;
      const at: GpsLatLng = {
        lat: laidPoints[i - 1].latitude + (laidPoints[i].latitude - laidPoints[i - 1].latitude) * t,
        lng: laidPoints[i - 1].longitude + (laidPoints[i].longitude - laidPoints[i - 1].longitude) * t,
      };
      const from: GpsLatLng = { lat: laidPoints[0].latitude, lng: laidPoints[0].longitude };
      if (at.lat === from.lat && at.lng === from.lng) return null;
      return calculateHeading(from, at);
    }
  }
  return null;
}

// UI-/Voice-Text je Zustand (Punkt 17/19) — bewusst zentral, damit run.tsx
// keine eigene Text-Logik dafür braucht.
export function searchStartStatusText(state: SearchStartState): string | null {
  if (state === 'START_CANDIDATE') return 'Fährtenansatz wird erkannt …';
  if (state === 'START_LOCKED') return 'Fährtenansatz erkannt';
  return null;   // SEEKING_START zeigt weiterhin den bestehenden Ansatz-Annäherungstext (unverändert)
}
