// ──────────────────────────────────────────────────────────────────────────
// ISOLIERTE Trajektorien-Vorverarbeitung für die Winkelerkennung.
//
// NICHT im Produktionspfad. Diese Datei wird ausschliesslich von der
// Benchmark-Testschicht benutzt, um objektiv zu messen, ob eine
// Vorverarbeitung dem Detektor überhaupt hilft. Der bestehende Short-Leg-
// Detektor ist in dieser Runde eingefroren und ruft hier nichts auf.
//
// Kernfrage: lässt sich langsam wandernder GNSS-Bias (Waldrand) dämpfen,
// OHNE echte 90°-/135°-Ecken abzurunden? Ein Constant-Velocity-Modell neigt
// genau dazu, über einen Richtungswechsel hinauszuschiessen — deshalb hat
// jedes geschwindigkeitsbasierte Modell hier eine Change-Point-Erkennung.
//
// Keine externe Abhängigkeit, alles deterministisch.
// ──────────────────────────────────────────────────────────────────────────

/** Ein Eingangsfix in lokalen Metern (die Benchmark rechnet in Metern). */
export interface TrajFix {
  /** Ost (m) */ x: number;
  /** Nord (m) */ y: number;
  /** Zeit (s) */ t: number;
  /** gemeldete horizontale Genauigkeit (m) — NUR Gewicht, nie Verschiebung. */
  accuracy: number;
}

export interface TrajPoint { x: number; y: number; t: number; accuracy: number }

export interface PreprocessorResult {
  points: TrajPoint[];
  /** Wie viele Fixe hinkt die Ausgabe der Eingabe nach (Modellkonstruktion). */
  lagFixes: number;
  /** Anzahl erkannter Richtungswechsel (Change Points). */
  resets: number;
}

export interface Preprocessor {
  name: string;
  run: (fixes: readonly TrajFix[]) => PreprocessorResult;
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);

/**
 * Messgewicht aus der gemeldeten Genauigkeit. Bewusst KEINE Interpretation
 * als tatsächliche Fehlerdistanz — nur „schlechtere Fixe zählen weniger".
 */
function accuracyWeight(accuracy: number, goodM = 5, badM = 30): number {
  if (!Number.isFinite(accuracy)) return 0.5;
  const a = Math.max(goodM, Math.min(badM, accuracy));
  return (badM - a) / (badM - goodM) * 0.8 + 0.2;   // 0.2 … 1.0
}

// ── Modell A: Alpha-Beta (Constant Velocity) ──────────────────────────────

export interface AlphaBetaOptions {
  /** Grund-Alpha (Positionskorrektur). Wird über die Accuracy gewichtet. */
  alpha: number;
  /** Grund-Beta (Geschwindigkeitskorrektur). */
  beta: number;
  /** Innovation über diesem Vielfachen der erwarteten Streuung = Verdacht. */
  changeSigma: number;
  /** So viele konsistente Verdachtsfixe hintereinander lösen einen Reset aus. */
  changeRun: number;
  /** Maximal plausible Gehgeschwindigkeit (m/s) — begrenzt die Prädiktion. */
  maxSpeedMps: number;
}

export const ALPHA_BETA_DEFAULTS: AlphaBetaOptions = {
  alpha: 0.45, beta: 0.18, changeSigma: 2.0, changeRun: 2, maxSpeedMps: 3.0,
};

/**
 * Alpha-Beta-Filter mit Change-Point-Erkennung.
 *
 * Die Change-Point-Erkennung ist der entscheidende Teil: laufen mehrere
 * Messungen hintereinander konsistent in dieselbe NEUE Richtung (Innovation
 * gleichbleibend gross und richtungsstabil), wird die Geschwindigkeit sofort
 * auf die gemessene Richtung gesetzt, statt den alten Schenkel noch Meter
 * weiterzuziehen. Ein EINZELNER Ausreisser löst das nicht aus.
 */
export function alphaBeta(opts: AlphaBetaOptions = ALPHA_BETA_DEFAULTS): Preprocessor {
  return {
    name: `alphaBeta(a=${opts.alpha},b=${opts.beta})`,
    run(fixes) {
      const out: TrajPoint[] = [];
      let resets = 0;
      if (fixes.length === 0) return { points: out, lagFixes: 0, resets };

      let px = fixes[0].x, py = fixes[0].y;
      let vx = 0, vy = 0;
      out.push({ x: px, y: py, t: fixes[0].t, accuracy: fixes[0].accuracy });

      let suspicion: { dx: number; dy: number }[] = [];
      for (let i = 1; i < fixes.length; i++) {
        const f = fixes[i];
        const dt = Math.max(0.05, f.t - fixes[i - 1].t);

        // Prädiktion mit begrenzter Geschwindigkeit (keine Totrecknung).
        const sp = Math.hypot(vx, vy);
        if (sp > opts.maxSpeedMps) { vx *= opts.maxSpeedMps / sp; vy *= opts.maxSpeedMps / sp; }
        const prx = px + vx * dt, pry = py + vy * dt;

        // Innovation = Messung − Prädiktion.
        const rx = f.x - prx, ry = f.y - pry;
        const rmag = Math.hypot(rx, ry);

        // Erwartete Streuung: Genauigkeit (als Unsicherheit, nicht als Fehler)
        // plus ein Wegbeitrag.
        const expected = Math.max(1.0, f.accuracy * 0.35) + 0.25 * opts.maxSpeedMps * dt;

        // Change-Point: mehrere Innovationen in Folge gross UND gleichgerichtet.
        if (rmag > opts.changeSigma * expected) {
          suspicion.push({ dx: rx / (rmag || 1), dy: ry / (rmag || 1) });
          if (suspicion.length >= opts.changeRun) {
            // Richtungskonsistenz prüfen (Skalarprodukt aller Verdachtsvektoren).
            let consistent = true;
            for (let k = 1; k < suspicion.length; k++) {
              if (suspicion[k].dx * suspicion[0].dx + suspicion[k].dy * suspicion[0].dy < 0.5) consistent = false;
            }
            if (consistent) {
              // Sofort auf die gemessene Realität schnappen: Position = Messung,
              // Geschwindigkeit aus den letzten beiden Messungen.
              const prev = fixes[i - 1];
              px = f.x; py = f.y;
              vx = (f.x - prev.x) / dt; vy = (f.y - prev.y) / dt;
              suspicion = [];
              resets++;
              out.push({ x: px, y: py, t: f.t, accuracy: f.accuracy });
              continue;
            }
          }
        } else {
          suspicion = [];
        }

        const w = accuracyWeight(f.accuracy);
        const a = Math.min(0.95, opts.alpha * w + (1 - w) * 0.15);
        const b = Math.min(0.6, opts.beta * w);
        px = prx + a * rx; py = pry + a * ry;
        vx += (b / dt) * rx; vy += (b / dt) * ry;
        out.push({ x: px, y: py, t: f.t, accuracy: f.accuracy });
      }
      return { points: out, lagFixes: 0, resets };
    },
  };
}

// ── Modell B: kleiner 2D Constant-Velocity-Kalman ─────────────────────────

export interface CvKalmanOptions {
  /** Prozessrauschen (m/s²) — wie stark darf das Modell beschleunigen. */
  processNoise: number;
  /** NIS-Schwelle, ab der eine Messung als „neue Realität" gilt. */
  nisGate: number;
  /** So viele Gate-Verletzungen in Folge lösen ein Aufweiten aus. */
  gateRun: number;
  maxSpeedMps: number;
}

export const CV_KALMAN_DEFAULTS: CvKalmanOptions = {
  processNoise: 1.2, nisGate: 9.0, gateRun: 2, maxSpeedMps: 3.0,
};

/**
 * Minimaler 2D-CV-Kalman (x, y, vx, vy) mit diagonaler Kovarianz je Achse —
 * bewusst als zwei entkoppelte 1D-Filter gerechnet, damit die Matrixalgebra
 * klein und deterministisch bleibt. R kommt aus der gemeldeten Genauigkeit
 * (Unsicherheit, keine Verschiebung). Bei mehreren aufeinanderfolgenden
 * Gate-Verletzungen wird die Kovarianz aufgeweitet — das Modell folgt der
 * neuen Richtung dann sofort, statt den Turn abzurunden.
 */
export function cvKalman(opts: CvKalmanOptions = CV_KALMAN_DEFAULTS): Preprocessor {
  return {
    name: `cvKalman(q=${opts.processNoise})`,
    run(fixes) {
      const out: TrajPoint[] = [];
      let resets = 0;
      if (fixes.length === 0) return { points: out, lagFixes: 0, resets };

      // Zustand je Achse: [pos, vel], Kovarianz [[p00,p01],[p10,p11]]
      const mk = (p: number) => ({ x: p, v: 0, p00: 25, p01: 0, p11: 4 });
      const sx = mk(fixes[0].x), sy = mk(fixes[0].y);
      out.push({ x: fixes[0].x, y: fixes[0].y, t: fixes[0].t, accuracy: fixes[0].accuracy });

      let gateHits = 0;
      for (let i = 1; i < fixes.length; i++) {
        const f = fixes[i];
        const dt = Math.max(0.05, f.t - fixes[i - 1].t);
        const q = opts.processNoise * opts.processNoise;

        const predict = (s: typeof sx) => {
          s.x += s.v * dt;
          const p00 = s.p00 + dt * (2 * s.p01 + dt * s.p11) + 0.25 * q * dt ** 4;
          const p01 = s.p01 + dt * s.p11 + 0.5 * q * dt ** 3;
          const p11 = s.p11 + q * dt * dt;
          s.p00 = p00; s.p01 = p01; s.p11 = p11;
        };
        predict(sx); predict(sy);

        const r = Math.max(1.0, f.accuracy * 0.5) ** 2;   // Messunsicherheit
        const inx = f.x - sx.x, iny = f.y - sy.x;   // `.x` = Positionsfeld beider Achsen-Zustände
        const sxx = sx.p00 + r, syy = sy.p00 + r;
        const nis = (inx * inx) / sxx + (iny * iny) / syy;

        if (nis > opts.nisGate) {
          gateHits++;
          if (gateHits >= opts.gateRun) {
            // Neue Realität: Kovarianz aufweiten → Filter folgt sofort.
            sx.p00 += 50; sy.p00 += 50; sx.p11 += 9; sy.p11 += 9;
            gateHits = 0; resets++;
          }
        } else gateHits = 0;

        const update = (s: typeof sx, inn: number) => {
          const sInn = s.p00 + r;
          const k0 = s.p00 / sInn, k1 = s.p01 / sInn;
          s.x += k0 * inn; s.v += k1 * inn;
          const p00 = (1 - k0) * s.p00;
          const p01 = (1 - k0) * s.p01;
          const p11 = s.p11 - k1 * s.p01;
          s.p00 = p00; s.p01 = p01; s.p11 = Math.max(0.01, p11);
        };
        update(sx, inx); update(sy, iny);

        const sp = Math.hypot(sx.v, sy.v);
        if (sp > opts.maxSpeedMps) { sx.v *= opts.maxSpeedMps / sp; sy.v *= opts.maxSpeedMps / sp; }

        // Hinweis: `.x` ist in beiden Achsen-Zuständen das POSITIONSfeld
        // (derselbe 1D-Struct, einmal für Ost, einmal für Nord).
        out.push({ x: sx.x, y: sy.x, t: f.t, accuracy: f.accuracy });
      }
      return { points: out, lagFixes: 0, resets };
    },
  };
}

// ── Modell C: robuster lokaler Sliding-Fit ────────────────────────────────

export interface SlidingFitOptions {
  /** Halbe Fensterbreite entlang der Strecke (m). */
  halfWindowM: number;
  /** Mindestpunkte im Fenster. */
  minPoints: number;
  /** Huber-Iterationen. */
  iterations: number;
}

export const SLIDING_FIT_DEFAULTS: SlidingFitOptions = {
  halfWindowM: 1.6, minPoints: 3, iterations: 2,
};

/**
 * Für jeden Punkt wird eine robuste Ausgleichsgerade durch die räumlich
 * benachbarten Punkte gelegt (Huber-gewichtet, Genauigkeit als Gewicht) und
 * der Punkt auf diese Gerade projiziert. Seitliches Rauschen und langsamer
 * Bias werden dadurch gedämpft.
 *
 * Bekanntes Risiko, das die Benchmark messen soll: an einem echten Scheitel
 * liegen Punkte BEIDER Schenkel im Fenster — die Ausgleichsgerade halbiert
 * den Winkel und rundet die Ecke ab. Deshalb ist das Fenster bewusst klein.
 * Verzögerung: symmetrisches Fenster ⇒ die letzten halbWindow Meter sind erst
 * verspätet endgültig (im Bericht als Fixed-Lag ausgewiesen).
 */
export function slidingFit(opts: SlidingFitOptions = SLIDING_FIT_DEFAULTS): Preprocessor {
  return {
    name: `slidingFit(w=±${opts.halfWindowM}m)`,
    run(fixes) {
      const n = fixes.length;
      const out: TrajPoint[] = [];
      if (n === 0) return { points: out, lagFixes: 0, resets: 0 };

      // Bogenlänge für das räumliche Fenster.
      const cum: number[] = [0];
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + dist(fixes[i - 1].x, fixes[i - 1].y, fixes[i].x, fixes[i].y));

      for (let i = 0; i < n; i++) {
        let lo = i, hi = i;
        while (lo > 0 && cum[i] - cum[lo - 1] <= opts.halfWindowM) lo--;
        while (hi < n - 1 && cum[hi + 1] - cum[i] <= opts.halfWindowM) hi++;
        const count = hi - lo + 1;
        if (count < opts.minPoints) { out.push({ ...fixes[i] }); continue; }

        const w0: number[] = [];
        for (let k = lo; k <= hi; k++) w0.push(accuracyWeight(fixes[k].accuracy));
        let w = w0.slice();
        let px = fixes[i].x, py = fixes[i].y;

        for (let it = 0; it < opts.iterations; it++) {
          let sw = 0, mx = 0, my = 0;
          for (let k = lo; k <= hi; k++) { const q = w[k - lo]; sw += q; mx += q * fixes[k].x; my += q * fixes[k].y; }
          if (sw <= 0) break;
          mx /= sw; my /= sw;
          let sxx = 0, syy = 0, sxy = 0;
          for (let k = lo; k <= hi; k++) {
            const q = w[k - lo], dx = fixes[k].x - mx, dy = fixes[k].y - my;
            sxx += q * dx * dx; syy += q * dy * dy; sxy += q * dx * dy;
          }
          const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
          const ux = Math.cos(theta), uy = Math.sin(theta);
          const res: number[] = [];
          for (let k = lo; k <= hi; k++) {
            const dx = fixes[k].x - mx, dy = fixes[k].y - my;
            res.push(Math.abs(dx * -uy + dy * ux));
          }
          const sorted = [...res].sort((a, b) => a - b);
          const med = sorted[Math.floor(sorted.length / 2)] || 0;
          const kh = Math.max(0.3, 1.5 * med);
          for (let k = 0; k < res.length; k++) w[k] = w0[k] * (res[k] <= kh ? 1 : kh / res[k]);
          // Punkt auf die Gerade projizieren.
          const dx = fixes[i].x - mx, dy = fixes[i].y - my;
          const along = dx * ux + dy * uy;
          px = mx + along * ux; py = my + along * uy;
        }
        out.push({ x: px, y: py, t: fixes[i].t, accuracy: fixes[i].accuracy });
      }
      // Symmetrisches Fenster ⇒ die Ausgabe am Streckenende ist erst nach
      // halfWindowM Weg endgültig.
      return { points: out, lagFixes: 0, resets: 0 };
    },
  };
}

/** Unveränderte Rohdaten — Referenz der Benchmark. */
export const rawPassthrough: Preprocessor = {
  name: 'raw',
  run: (fixes) => ({ points: fixes.map(f => ({ ...f })), lagFixes: 0, resets: 0 }),
};
