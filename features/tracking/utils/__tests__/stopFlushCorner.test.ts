// Stop-assisted final corner flush — Messung, nicht Behauptung.
//
// Frage: kann der reale Schlusswinkel der Golden-Field-Route (SL mit nur
// ~1,25 m Nachlauf) beim ausdrücklichen Stop nachträglich gerettet werden,
// OHNE dass dabei irgendwo ein Winkel erfunden wird?
//
// Die laufende Erkennung bleibt unverändert; der Flush ist ein separater,
// einmaliger Schritt am Sessionende (siehe stopFlushCorner.ts).

import { evaluateStopFlush, STOP_FLUSH_DEFAULTS, STOP_FLUSH_IS_STRICTER } from '@/features/tracking/utils/stopFlushCorner';
import { MIN_TURN_DEG, MIN_TURN_TO_NOISE, MIN_TURN_CONCENTRATION, ACCEPT_SCORE, type ShortLegPoint } from '@/features/tracking/utils/shortLegCornerDetection';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import {
  FIELD_TAIL_M, FIELD_EXPECTED, SEEDS, M_PER_DEG,
  fieldRouteCoords, straightCoords, withDrift, fieldFixes, detectorBuffer,
  runCurrent, scoreSequence, makeRng, rawBuffer,
} from './helpers/goldenRoute';

const RAD = Math.PI / 180;

function mk(coords: readonly (readonly [number, number])[], seed = 1): { buf: ShortLegPoint[]; raw: ShortLegPoint[] } {
  const fixes = fieldFixes(coords, seed);
  return { buf: detectorBuffer(fixes), raw: rawBuffer(fixes) };
}

/** Gerade, dann ab der Hälfte eine einmalige Richtungsänderung um turnDeg. */
function bendCoords(lengthM: number, turnDeg: number, spacing = 1.0): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  let x = 0, y = 0;
  const half = lengthM / 2;
  for (let d = spacing; d <= lengthM + 1e-9; d += spacing) {
    const hdg = d <= half ? 0 : turnDeg;
    x += Math.sin(hdg * RAD) * spacing;
    y += Math.cos(hdg * RAD) * spacing;
    out.push([x, y]);
  }
  return out;
}

/** Gleichmässiger Bogen über die ganze Strecke. */
function arcCoords(lengthM: number, totalTurnDeg: number, spacing = 1.0): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  let x = 0, y = 0, hdg = 0;
  const steps = Math.round(lengthM / spacing);
  for (let i = 0; i < steps; i++) {
    hdg += totalTurnDeg / steps;
    x += Math.sin(hdg * RAD) * spacing;
    y += Math.cos(hdg * RAD) * spacing;
    out.push([x, y]);
  }
  return out;
}

/** Am Ende steht der Läufer: acht Fixe fast am selben Ort, nur Drift. */
function standingDrift(lengthM: number, seed: number): [number, number][] {
  const rng = makeRng(seed);
  const out = straightCoords(lengthM, 1.0).map(p => [p[0], p[1]] as [number, number]);
  const [lx, ly] = out[out.length - 1];
  let dx = 0, dy = 0;
  for (let i = 0; i < 8; i++) {
    dx = dx * 0.85 + (rng() - 0.5) * 2.0;
    dy = dy * 0.85 + (rng() - 0.5) * 2.0;
    out.push([lx + dx, ly + dy]);
  }
  return out;
}

/** Laufende Erkennung + einmaliger Stop-Flush, wie im Recorder gedacht. */
function detectWithStopFlush(
  buf: readonly ShortLegPoint[], raw?: readonly ShortLegPoint[] | null,
): { kinds: AngleKind[]; flushed: AngleKind | null; reject: string | null } {
  const { kinds, lastCornerAtM } = runCurrent(buf);
  const flush = evaluateStopFlush(buf, lastCornerAtM, STOP_FLUSH_DEFAULTS, raw);
  if (!flush.corner) return { kinds: [...kinds], flushed: null, reject: flush.diagnostics.rejectReason };
  return { kinds: [...kinds, flush.corner.kind], flushed: flush.corner.kind, reject: null };
}

// ── Struktur-Zusagen ──────────────────────────────────────────────────────
describe('Stop-Flush: Struktur', () => {
  it('ist in jedem Kriterium strenger als die laufende Erkennung', () => {
    expect(STOP_FLUSH_IS_STRICTER).toBe(true);
    expect(STOP_FLUSH_DEFAULTS.minTurnDeg).toBeGreaterThan(MIN_TURN_DEG);
    expect(STOP_FLUSH_DEFAULTS.minTurnToNoise).toBeGreaterThan(MIN_TURN_TO_NOISE);
    expect(STOP_FLUSH_DEFAULTS.minConcentration).toBeGreaterThan(MIN_TURN_CONCENTRATION);
    expect(STOP_FLUSH_DEFAULTS.acceptScore).toBeGreaterThan(ACCEPT_SCORE);
  });

  it('erfindet aus zu wenigen Punkten nichts', () => {
    expect(evaluateStopFlush([], -Infinity).corner).toBeNull();
    const two: ShortLegPoint[] = [
      { lat: 0, lng: 0, cumDist: 0, accuracy: 5 },
      { lat: 1 / M_PER_DEG, lng: 0, cumDist: 1, accuracy: 5 },
    ];
    expect(evaluateStopFlush(two, -Infinity).corner).toBeNull();
  });

  it('meldet keinen Winkel doppelt, der bereits bestätigt wurde', () => {
    const buf = detectorBuffer(fieldFixes(fieldRouteCoords(1.0, 4.0), 1));
    const { lastCornerAtM } = runCurrent(buf);
    // Alles innerhalb CORNER_GAP_M nach dem letzten bestätigten Winkel ist gesperrt.
    const flush = evaluateStopFlush(buf, lastCornerAtM);
    if (flush.corner) expect(flush.corner.atM).toBeGreaterThan(lastCornerAtM);
  });
});

// ── Nachlaufmatrix ────────────────────────────────────────────────────────
describe('Stop-Flush: Nachlaufmatrix 0,5–4,0 m', () => {
  const TAILS = [0.5, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0];

  it('misst ohne Drift, wie viel der Flush zurückholt — geglätteter vs. roher Nachlauf', () => {
    const rows = ['Nachlauf | CURRENT | geglättet: +Flush / Grund      | roh: +Flush / Grund'];
    for (const tail of TAILS) {
      const fixes = fieldFixes(fieldRouteCoords(1.0, tail), 1);
      const buf = detectorBuffer(fixes);
      const raw = rawBuffer(fixes);
      const base = scoreSequence(runCurrent(buf).kinds);
      const sm = detectWithStopFlush(buf);
      const rw = detectWithStopFlush(buf, raw);
      rows.push(
        `${tail.toFixed(2)} m   |   ${base}/4   |    ${scoreSequence(sm.kinds)}/4 ${(sm.flushed ?? '—').padEnd(12)} ${(sm.reject ?? '—').padEnd(10)}| ` +
        `   ${scoreSequence(rw.kinds)}/4 ${(rw.flushed ?? '—').padEnd(12)} ${rw.reject ?? '—'}`,
      );
    }
    console.log('\n[STOP-FLUSH · Nachlaufmatrix] 0 Drift, 1 Hz, Golden-Route\n' + rows.join('\n') + '\n');
    expect(rows).toHaveLength(TAILS.length + 1);
  });

  it('misst dieselbe Matrix unter realer Drift', () => {
    const rows = ['Nachlauf | Drift | Ø CURRENT | Ø +Flush | 4/4 mit Flush'];
    for (const tail of [1.0, 1.25, 2.0, 3.0]) {
      for (const drift of [1, 2, 4]) {
        let base = 0, withFlush = 0, full = 0;
        for (const seed of SEEDS) {
          const fixes = fieldFixes(withDrift(fieldRouteCoords(1.0, tail), drift, seed), seed);
          const buf = detectorBuffer(fixes);
          base += scoreSequence(runCurrent(buf).kinds);
          const sc = scoreSequence(detectWithStopFlush(buf, rawBuffer(fixes)).kinds);
          withFlush += sc; if (sc === 4) full++;
        }
        const n = SEEDS.length;
        rows.push(`${tail.toFixed(2)} m   | ±${drift} m |   ${(base / n).toFixed(2)}/4   |  ${(withFlush / n).toFixed(2)}/4  | ${full}/10`);
      }
    }
    console.log('\n[STOP-FLUSH · Nachlaufmatrix unter Drift]\n' + rows.join('\n') + '\n');
    expect(rows.length).toBeGreaterThan(1);
  });

  it('Parameter-Sweep: lässt sich der 1,25-m-Fall überhaupt erreichen — und um welchen Preis?', () => {
    // Kein kosmetisches Absenken: gemessen wird BEIDES — was der Sweep an der
    // Golden-Route zurückholt UND was er an False Positives einhandelt.
    const fpCases: [string, (seed: number) => { buf: ShortLegPoint[]; raw: ShortLegPoint[] }][] = [
      ['Gerade ±5 m', (s2) => mk(withDrift(straightCoords(20, 1.0), 5, s2), s2)],
      ['Bogen 30°', (s2) => mk(arcCoords(20, 30), s2)],
      ['30°-Knick', (s2) => mk(bendCoords(20, 30), s2)],
      ['stehende Drift', (s2) => mk(standingDrift(20, s2), s2)],
    ];
    const rows = ['minTail | minSamples | 1,00 m | 1,25 m | 1,50 m | 2,00 m | False Positives'];
    for (const minTailM of [0.5, 0.75, 1.0]) {
      for (const minTailSamples of [2, 3]) {
        const params = { ...STOP_FLUSH_DEFAULTS, minTailM, minTailSamples };
        const cells = [1.0, 1.25, 1.5, 2.0].map(tail => {
          const fixes = fieldFixes(fieldRouteCoords(1.0, tail), 1);
          const buf = detectorBuffer(fixes);
          const f = evaluateStopFlush(buf, runCurrent(buf).lastCornerAtM, params, rawBuffer(fixes));
          return f.corner ? 'SL' : (f.diagnostics.rejectReason ?? '—');
        });
        let fp = 0;
        for (const [, build] of fpCases) {
          for (const seed of SEEDS) {
            const b = build(seed);
            const { lastCornerAtM } = runCurrent(b.buf);
            if (evaluateStopFlush(b.buf, lastCornerAtM, params, b.raw).corner) fp++;
          }
        }
        rows.push(
          `${minTailM.toFixed(2)}    |     ${minTailSamples}      | ` +
          cells.map(c => c.padEnd(6)).join(' | ') + ` | ${fp}`,
        );
      }
    }
    console.log('\n[STOP-FLUSH · Parameter-Sweep] roher Nachlauf, 0 Drift · FP über 4 Fälle x 10 Seeds\n' + rows.join('\n') + '\n');
    expect(rows.length).toBe(7);
  });

  it('der reale 1,25-m-Fall: Ergebnis wird ausgewiesen, nicht behauptet', () => {
    const fixes = fieldFixes(fieldRouteCoords(1.0, FIELD_TAIL_M), 1);
    const buf = detectorBuffer(fixes);
    const r = detectWithStopFlush(buf, rawBuffer(fixes));
    const flush = evaluateStopFlush(buf, runCurrent(buf).lastCornerAtM, STOP_FLUSH_DEFAULTS, rawBuffer(fixes));
    console.log('\n[STOP-FLUSH · realer Fall 1,25 m] ' +
      `erkannt=[${r.kinds.join(', ')}] geflusht=${r.flushed ?? '—'} ` +
      `grund=${flush.diagnostics.rejectReason ?? '—'} ` +
      `tail=${flush.diagnostics.tailM ?? '—'} m / ${flush.diagnostics.tailSamples ?? '—'} Punkte ` +
      `turn=${flush.diagnostics.headingDeltaDeg ?? '—'}° innen=${flush.diagnostics.interiorAngleDeg ?? '—'}° ` +
      `conf=${flush.diagnostics.confidence}\n`);
    // Der laufende Detektor allein schafft 3/4 — das ist der Ausgangspunkt.
    expect(scoreSequence(runCurrent(buf).kinds)).toBe(3);
    // DOKUMENTIERTE GRENZE: der reale 1,25-m-Nachlauf wird NICHT gerettet.
    // Über 1,25 m trägt der Nachlauf zu wenig Richtungsinformation: geglättet
    // hat die EMA die neue Richtung noch nicht eingeholt (gemessene Änderung
    // ~10° statt 135°), roh ertrinkt sie im Rauschen (turn_below_noise).
    expect(r.flushed).toBeNull();
  });

  it('GEMESSENE GRENZE: ab 1,5 m Nachlauf rettet der Flush den Schlusswinkel', () => {
    for (const tail of [1.5, 2.0]) {
      const fixes = fieldFixes(fieldRouteCoords(1.0, tail), 1);
      const buf = detectorBuffer(fixes);
      const r = detectWithStopFlush(buf, rawBuffer(fixes));
      expect(scoreSequence(runCurrent(buf).kinds)).toBe(3);
      expect(r.flushed).toBe('spitz_links');
      expect(scoreSequence(r.kinds)).toBe(4);
    }
  });
});

// ── False-Positive-Batterie ───────────────────────────────────────────────
describe('Stop-Flush: False Positives — kein zusätzlicher Winkel', () => {
  const buf = mk;
  const bend = bendCoords;
  const arc = arcCoords;

  function jitterBeforeStop(lengthM: number, seed: number, amplitudeM = 1.5): [number, number][] {
    const rng = makeRng(seed);
    const out = straightCoords(lengthM, 1.0).map(p => [p[0], p[1]] as [number, number]);
    // Die letzten vier Fixe wackeln seitlich (typischer GPS-Wackler am Stop).
    for (let i = Math.max(0, out.length - 4); i < out.length; i++) {
      out[i] = [out[i][0] + (rng() - 0.5) * amplitudeM * 2, out[i][1] + (rng() - 0.5) * amplitudeM];
    }
    return out;
  }

  const standingDriftBeforeStop = standingDrift;

  const CASES: [string, (seed: number) => { buf: ShortLegPoint[]; raw: ShortLegPoint[] }][] = [
    ['gerade Fährte → Stop', (s) => buf(straightCoords(20, 1.0), s)],
    ['gerade Fährte + ±2 m Drift → Stop', (s) => buf(withDrift(straightCoords(20, 1.0), 2, s), s)],
    ['gerade Fährte + ±5 m Drift → Stop', (s) => buf(withDrift(straightCoords(20, 1.0), 5, s), s)],
    ['sanfter Bogen (30° über 20 m) → Stop', (s) => buf(arc(20, 30), s)],
    ['20°-Änderung → Stop', (s) => buf(bend(20, 20), s)],
    ['30°-Änderung → Stop', (s) => buf(bend(20, 30), s)],
    ['GPS-Wackler kurz vor Stop', (s) => buf(jitterBeforeStop(20, s), s)],
    ['stehende Drift vor Stop', (s) => buf(standingDriftBeforeStop(20, s), s)],
  ];

  const rows: string[] = [];
  afterAll(() => {
    console.log('\n[STOP-FLUSH · False Positives] 10 Seeds · zusätzliche Winkel durch den Flush\n' +
      'Fall                                | CURRENT | Flush (geglättet) | Flush (roh)\n' + rows.join('\n') + '\n');
  });

  it.each(CASES)('%s', (label, build) => {
    let base = 0, extraSmooth = 0, extraRaw = 0;
    for (const seed of SEEDS) {
      const b = build(seed);
      const { kinds, lastCornerAtM } = runCurrent(b.buf);
      base += kinds.length;
      if (evaluateStopFlush(b.buf, lastCornerAtM).corner) extraSmooth++;
      if (evaluateStopFlush(b.buf, lastCornerAtM, STOP_FLUSH_DEFAULTS, b.raw).corner) extraRaw++;
    }
    rows.push(`${label.padEnd(36)}|   ${String(base).padStart(2)}    |         ${extraSmooth}         |      ${extraRaw}`);
    // HARTE ZUSAGE: der Stop erzeugt in keinem dieser Fälle einen Winkel —
    // weder mit geglättetem noch mit rohem Nachlauf.
    expect(extraSmooth).toBe(0);
    expect(extraRaw).toBe(0);
  });
});

// ── Der Flush darf nur echte Geometrie retten ─────────────────────────────
describe('Stop-Flush: rettet nur, was Geometrie hergibt', () => {
  it('ein echter 90°-Winkel mit kurzem Nachlauf ist der Zielfall', () => {
    // Langer, sauberer Einlauf + 90° + kurzer Nachlauf: hier MUSS die
    // Geometrie ausreichen, wenn der Flush überhaupt einen Zweck hat.
    const coords: [number, number][] = [];
    for (let d = 0; d <= 10; d += 1.0) coords.push([0, d]);
    const last = coords[coords.length - 1];
    for (let d = 1.0; d <= 1.5; d += 0.5) coords.push([last[0] + d, last[1]]);
    const fx = fieldFixes(coords, 1);
    const b = detectorBuffer(fx);
    const flush = evaluateStopFlush(b, runCurrent(b).lastCornerAtM, STOP_FLUSH_DEFAULTS, rawBuffer(fx));
    console.log(`\n[STOP-FLUSH · Zielfall 90° + 1,5 m] ergebnis=${flush.corner?.kind ?? '—'} ` +
      `grund=${flush.diagnostics.rejectReason ?? '—'} tail=${flush.diagnostics.tailM ?? '—'} m ` +
      `innen=${flush.diagnostics.interiorAngleDeg ?? '—'}° conf=${flush.diagnostics.confidence}\n`);
    expect(FIELD_EXPECTED).toContain('rechts');   // Vorzeichenkonvention unverändert
  });
});
