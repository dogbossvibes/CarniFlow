import {
  createGpsQualityTracker, DEFAULT_GPS_QUALITY_CONFIG,
  type GpsQualitySample,
} from '@/features/tracking/utils/gpsQualityState';
import { formatGpsQuality } from '@/features/tracking/utils/angleDiagnostics';

// ──────────────────────────────────────────────────────────────────────────
// GPS Quality Engine — Rolling-Window-Score/Level, Robustheit, Warmup.
// Samples werden synthetisch gefüttert (t schreitet fort; Standard 1 Hz).
// ──────────────────────────────────────────────────────────────────────────

interface Spec { acc: number | null; dtMs?: number; dist?: number; reject?: 'accuracy' | 'jump' | null; speed?: number }

function run(specs: Spec[], cfg = DEFAULT_GPS_QUALITY_CONFIG) {
  const tr = createGpsQualityTracker(cfg);
  let t = 1000;
  let state = tr.observe({ t, accuracy: specs[0].acc, distFromPrevM: null, dtMs: null, rejected: specs[0].reject != null, rejectReason: specs[0].reject ?? null, speedMps: specs[0].speed });
  for (let i = 1; i < specs.length; i++) {
    const sp = specs[i];
    const dtMs = sp.dtMs ?? 1000;
    t += dtMs;
    const s: GpsQualitySample = {
      t, accuracy: sp.acc, distFromPrevM: sp.dist ?? 1.2, dtMs,
      rejected: sp.reject != null, rejectReason: sp.reject ?? null, speedMps: sp.speed,
    };
    state = tr.observe(s);
  }
  return { tr, state };
}
const rep = (acc: number, n: number, extra: Partial<Spec> = {}): Spec[] =>
  Array.from({ length: n }, () => ({ acc, dist: 1.2, ...extra }));

// ── Score / Level ──────────────────────────────────────────────────────────
describe('GPS Quality — Score/Level Bänder', () => {
  it('stabile sehr gute Accuracy, regelmäßig, keine Rejects → excellent', () => {
    const { state } = run(rep(3, 12));
    expect(state.valid).toBe(true);
    expect(state.score).toBeGreaterThanOrEqual(0.85);
    expect(state.level).toBe('excellent');
  });

  it('moderate Accuracy + leichte Varianz + 1 Reject → good (nicht excellent)', () => {
    const specs: Spec[] = [];
    for (let i = 0; i < 12; i++) specs.push({ acc: [16, 20, 18, 21, 17][i % 5], dist: 1.2 });
    specs[6].reject = 'accuracy'; specs[6].acc = 50;
    const { state } = run(specs);
    expect(state.valid).toBe(true);
    expect(['good', 'excellent']).toContain(state.level);
    expect(state.score).toBeLessThan(0.9);
  });

  it('schlechte Accuracy + viele Rejects + Sprünge + unregelmäßig → poor', () => {
    const specs: Spec[] = [];
    for (let i = 0; i < 16; i++) {
      const bad = i % 2 === 0;
      specs.push({
        acc: bad ? 32 : 12, dist: bad ? 30 : 1.2,
        dtMs: i % 3 === 0 ? 4200 : 700,
        reject: bad ? 'jump' : null,
      });
    }
    const { state } = run(specs);
    expect(state.level).toBe('poor');
    expect(state.score).toBeLessThan(0.45);
    expect(state.reasons.length).toBeGreaterThan(0);
  });

  it('degraded liegt zwischen good und poor', () => {
    const specs: Spec[] = [];
    for (let i = 0; i < 14; i++) {
      specs.push({ acc: [10, 26, 12, 28, 11][i % 5], dist: 1.4, reject: i % 5 === 0 ? 'accuracy' : null, dtMs: i % 4 === 0 ? 2600 : 1000 });
      if (i % 5 === 0) specs[i].acc = 46;
    }
    const { state } = run(specs);
    expect(['degraded', 'poor', 'good']).toContain(state.level);
    expect(state.score).toBeLessThan(0.85);
    expect(state.score).toBeGreaterThan(0.2);
  });
});

// ── Robustheit ─────────────────────────────────────────────────────────────
describe('GPS Quality — Robustheit', () => {
  it('einzelner schlechter Fix bei sonst guten Daten → NICHT sofort poor, nur leichter Rückgang', () => {
    const good = run(rep(3, 10));
    const before = good.state.score;
    good.tr.observe({ t: 12_000, accuracy: 42, distFromPrevM: 1.2, dtMs: 1000, rejected: true, rejectReason: 'accuracy' });
    const after = good.tr.current()!;
    expect(after.level).not.toBe('poor');
    expect(before - after.score).toBeLessThan(0.25);   // nur leicht gefallen
  });

  it('mehrere schlechte Fixes → downgrade, danach gute Fixes → Recovery', () => {
    const tr = createGpsQualityTracker();
    let t = 1000;
    const obs = (acc: number, reject: 'accuracy' | null = null, dist = 1.2) =>
      tr.observe({ t: (t += 1000), accuracy: acc, distFromPrevM: dist, dtMs: 1000, rejected: reject != null, rejectReason: reject });
    for (let i = 0; i < 8; i++) obs(3);                       // gut
    const goodScore = tr.current()!.score;
    for (let i = 0; i < 8; i++) obs(48, 'accuracy', 25);      // schlecht
    const badState = tr.current()!;
    expect(badState.score).toBeLessThan(goodScore);
    expect(['degraded', 'poor']).toContain(badState.level);
    for (let i = 0; i < 12; i++) obs(3);                      // Erholung
    const recovered = tr.current()!;
    expect(recovered.score).toBeGreaterThan(badState.score);
    expect(['good', 'excellent']).toContain(recovered.level);
  });

  it('Stillstand (dist ~0, speed ~0) bei guter Accuracy → Qualität bleibt gut', () => {
    const { state } = run(rep(4, 12, { dist: 0.05, speed: 0 }));
    expect(['good', 'excellent']).toContain(state.level);
  });

  it('langsames Gehen (dist ~0.6, speed 0.5) → Qualität bleibt gut', () => {
    const { state } = run(rep(4, 12, { dist: 0.6, speed: 0.5 }));
    expect(['good', 'excellent']).toContain(state.level);
  });

  it('realistischer rejecteter Jump → jumpStability sinkt, aber nicht sofort poor', () => {
    const specs = rep(4, 10);
    specs[5] = { acc: 6, dist: 35, reject: 'jump' };
    const { state } = run(specs);
    expect(state.components.jumpStability).toBeLessThan(1);
    expect(state.level).not.toBe('poor');
  });

  it('temporalStability: gleiche Median-Nähe, aber hohe Varianz → schlechter', () => {
    const stable = run([3, 4, 3, 4, 5, 4, 3, 4].map(a => ({ acc: a }))).state;
    const jumpy = run([3, 18, 4, 25, 3, 20, 4, 22].map(a => ({ acc: a }))).state;
    expect(jumpy.components.temporalStability).toBeLessThan(stable.components.temporalStability);
    expect(jumpy.score).toBeLessThan(stable.score);
  });
});

// ── Warmup ─────────────────────────────────────────────────────────────────
describe('GPS Quality — Warmup / insufficient_data', () => {
  it('erster Fix ist NICHT sofort valid; Grund insufficient_data', () => {
    const tr = createGpsQualityTracker();
    const s1 = tr.observe({ t: 1000, accuracy: 3, distFromPrevM: null, dtMs: null, rejected: false });
    expect(s1.valid).toBe(false);
    expect(s1.reasons).toContain('insufficient_data');
  });
  it('ab minSamplesValid Fixes → valid', () => {
    const { state } = run(rep(3, DEFAULT_GPS_QUALITY_CONFIG.minSamplesValid));
    expect(state.valid).toBe(true);
    expect(state.reasons).not.toContain('insufficient_data');
  });
});

// ── Diagnostics ────────────────────────────────────────────────────────────
describe('GPS Quality — Diagnostics-Formatter', () => {
  it('formatGpsQuality enthält Level, Score und Komponenten', () => {
    const { state } = run(rep(3, 10));
    const line = formatGpsQuality(state);
    expect(line).toContain('[gpsQuality]');
    expect(line).toContain(state.level);
    expect(line).toContain('acc=');
    expect(line).toContain('reject=');
  });
});
