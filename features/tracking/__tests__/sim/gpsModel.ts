// Fährten-Simulator (T-192) — reiner Testcode.
// Macht aus der wahren Fährte die GPS-Positionen, die ein Handy liefern würde.
//
// Fehlermodell je Achse (Ost/Nord unabhängig), Quellen siehe README.md:
//   • langsamer Anteil   — Atmosphäre/Satellitenbild, über Minuten fast konstant
//   • schneller Anteil   — Mehrwegeffekte/Gerätefilter, wandert über ~30 s
//   • weisser Anteil     — kleines Zittern von Messung zu Messung
//   • Störphasen         — zeitweise deutlich grösserer schneller Fehler (schwere Ausläufer)
//   • Sprünge/Ausfälle   — seltene grobe Ausreisser und Lücken
// Die gemeldete Genauigkeit folgt dem wahren Fehler nur ungefähr (wie im Feld).
import { gauss, gaussMarkovStep, type Rng } from './rng';
import { truthAt, type Timeline } from './truthTrack';

export interface GpsProfile {
  name: string;
  slowSigmaM: number; slowTauS: number;
  fastSigmaM: number; fastTauS: number;
  whiteSigmaM: number;
  /** Zeitanteil in Störphasen (0..1), Faktor auf den schnellen Fehler, mittlere Dauer. */
  burstFraction: number; burstFactor: number; burstMeanS: number;
  /** Wahrscheinlichkeit eines groben Sprungs (15–40 m) je Messung. */
  jumpProbPerFix: number;
  /** Zeitanteil ohne Position (0..1) und mittlere Dauer einer Lücke. */
  dropoutFraction: number; dropoutMeanS: number;
  /** Gemeldete Genauigkeit = wahrer 68-%-Radius × accuracyBias (>1 vorsichtig, <1 zu optimistisch). */
  accuracyBias: number; accuracyFloorM: number;
  intervalS: number; intervalJitterS: number;
  /** Erste Messung ist eine alte, zwischengespeicherte Position. */
  staleFirstFix?: { offsetM: number; ageS: number };
  /** Zusatzfehler direkt nach dem Einschalten, klingt in wenigen Sekunden ab. */
  settleM: number;
}

export interface DeliverySpec {
  name: string;
  /** live = jede Messung sofort; batch = gebündelt alle `batchPeriodS` (Android im Hintergrund). */
  mode: 'live' | 'batch';
  latencyMs: number;
  batchPeriodS: number;
  /** Bündelung beginnt erst nach so vielen Sekunden (Handy wird dann weggesteckt/gesperrt). */
  batchAfterS: number;
}

export interface SimFix {
  /** Messzeit und Zustellzeit (ms, absolut). */
  tMs: number; receivedMs: number;
  x: number; y: number;
  accuracy: number;
  speedMps: number;
  /** Wahrer Lagefehler dieser Messung (m) — nur für die Auswertung. */
  trueErrM: number;
  background: boolean;
}

export const IDEAL_GPS: GpsProfile = {
  name: 'ideal', slowSigmaM: 0, slowTauS: 900, fastSigmaM: 0, fastTauS: 30, whiteSigmaM: 0,
  burstFraction: 0, burstFactor: 1, burstMeanS: 10, jumpProbPerFix: 0, dropoutFraction: 0, dropoutMeanS: 5,
  accuracyBias: 1, accuracyFloorM: 3, intervalS: 1, intervalJitterS: 0, settleM: 0,
};

export const LIVE_DELIVERY: DeliverySpec = { name: 'live', mode: 'live', latencyMs: 150, batchPeriodS: 0, batchAfterS: 0 };

/** Verhältnis 68-%-Radius zu Streuung je Achse bei kreisförmiger Normalverteilung. */
const R68_PER_SIGMA = 1.51;

export function simulateGps(truth: Timeline, profile: GpsProfile, delivery: DeliverySpec, rng: Rng, t0Ms: number): SimFix[] {
  const fixes: SimFix[] = [];
  const axis = () => ({
    slow: profile.slowSigmaM * gauss(rng), fast: profile.fastSigmaM * gauss(rng), burst: 0,
  });
  const ex = axis(), ey = axis();
  const burstSigma = profile.fastSigmaM * Math.sqrt(Math.max(0, profile.burstFactor ** 2 - 1));
  const burstEnterPerS = profile.burstFraction > 0 && profile.burstFraction < 1
    ? profile.burstFraction / (profile.burstMeanS * (1 - profile.burstFraction)) : 0;
  const dropEnterPerS = profile.dropoutFraction > 0 && profile.dropoutFraction < 1
    ? profile.dropoutFraction / (profile.dropoutMeanS * (1 - profile.dropoutFraction)) : 0;
  let inBurst = false, inDropout = false, accLog = 0, jumpLeft = 0, jumpX = 0, jumpY = 0;
  const settleDir = rng() * 2 * Math.PI;

  let tS = 0, prevS = 0, first = true;
  while (tS <= truth.durationS) {
    const dt = first ? profile.intervalS : tS - prevS;
    for (const e of [ex, ey]) {
      e.slow = gaussMarkovStep(e.slow, profile.slowSigmaM, profile.slowTauS, dt, rng);
      e.fast = gaussMarkovStep(e.fast, profile.fastSigmaM, profile.fastTauS, dt, rng);
      e.burst = inBurst ? gaussMarkovStep(e.burst, burstSigma, 8, dt, rng) : e.burst * Math.exp(-dt / 8);
    }
    if (inBurst) { if (rng() < dt / profile.burstMeanS) inBurst = false; } else if (rng() < burstEnterPerS * dt) inBurst = true;
    if (inDropout) { if (rng() < dt / profile.dropoutMeanS) inDropout = false; } else if (rng() < dropEnterPerS * dt) inDropout = true;
    accLog = gaussMarkovStep(accLog, 0.15, 20, dt, rng);

    if (!inDropout) {
      const p = truthAt(truth, tS);
      if (jumpLeft <= 0 && rng() < profile.jumpProbPerFix) {
        const a = rng() * 2 * Math.PI, m = 15 + rng() * 25;
        jumpX = Math.cos(a) * m; jumpY = Math.sin(a) * m; jumpLeft = 1 + Math.floor(rng() * 3);
      }
      const jumping = jumpLeft > 0;
      const settle = profile.settleM * Math.exp(-tS / 4);
      let errX = ex.slow + ex.fast + ex.burst + profile.whiteSigmaM * gauss(rng) + Math.cos(settleDir) * settle + (jumping ? jumpX : 0);
      let errY = ey.slow + ey.fast + ey.burst + profile.whiteSigmaM * gauss(rng) + Math.sin(settleDir) * settle + (jumping ? jumpY : 0);
      let measuredS = tS;
      if (first && profile.staleFirstFix) {
        const a = rng() * 2 * Math.PI;
        errX += Math.cos(a) * profile.staleFirstFix.offsetM; errY += Math.sin(a) * profile.staleFirstFix.offsetM;
        measuredS = tS - profile.staleFirstFix.ageS;
      }
      if (jumping) jumpLeft--;

      const sigmaNow = Math.sqrt(profile.slowSigmaM ** 2 + profile.fastSigmaM ** 2 * (inBurst ? profile.burstFactor ** 2 : 1) + profile.whiteSigmaM ** 2);
      let accuracy = Math.max(profile.accuracyFloorM, (sigmaNow * R68_PER_SIGMA + settle) * profile.accuracyBias * Math.exp(accLog));
      // Nur etwa jeder zweite Sprung wird vom Gerät auch als ungenau gemeldet.
      if (jumping && rng() < 0.5) accuracy *= 3 + rng() * 3;

      const tMs = Math.round(t0Ms + measuredS * 1000);
      const liveMs = Math.round(t0Ms + tS * 1000 + delivery.latencyMs);
      const batching = delivery.mode === 'batch' && tS >= delivery.batchAfterS;
      const receivedMs = batching
        ? Math.round(t0Ms + (Math.floor(tS / delivery.batchPeriodS) + 1) * delivery.batchPeriodS * 1000 + delivery.latencyMs)
        : liveMs;
      fixes.push({
        tMs, receivedMs, x: p.x + errX, y: p.y + errY,
        accuracy: Math.round(accuracy * 10) / 10,
        speedMps: Math.max(0, p.speedMps + 0.1 * gauss(rng)),
        trueErrM: Math.hypot(errX, errY), background: batching,
      });
    }
    first = false;
    prevS = tS;
    tS += Math.max(0.2, profile.intervalS + (rng() * 2 - 1) * profile.intervalJitterS);
  }
  return fixes;
}
