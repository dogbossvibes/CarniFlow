// T-215: sensorverankerter Winkel in der echten Lege-Verarbeitung — Regressionstest über den Simulator.
import { buildGroup } from './matrix';
import { runLay, SIM_T0_MS } from './layRunner';
import { DEVICE_LABEL, ENV_LABEL } from './profiles';
import { runScenario } from './scenario';
import { scoreLay } from './scoring';

jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/backgroundLayDiagnostics', () => ({ recordBackgroundLayEvent: jest.fn(async () => {}) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) }));

// Lichter Wald, Mittelklasse-Handy, rechter Winkel und Spitzwinkel mit 40-m-Schenkeln (16 Läufe).
const cases = buildGroup('geraet', 8).filter(c => c.row === DEVICE_LABEL.single && c.col === ENV_LABEL.forest);

describe('Sensorverankerter Winkel im Lege-Ablauf (T-215)', () => {
  it('mit Bewegungssensor werden im Wald deutlich mehr Winkel gefunden als ohne', () => {
    let withMotion = 0, without = 0, spurious = 0;
    for (const c of cases) {
      const a = runScenario(c.scenario).score; withMotion += a.cornersFound; spurious += a.cornersSpurious;
      without += runScenario({ ...c.scenario, motion: false }).score.cornersFound;
    }
    expect(cases).toHaveLength(16);
    expect(withMotion).toBeGreaterThanOrEqual(8);
    expect(withMotion).toBeGreaterThan(without);
    expect(spurious).toBeLessThanOrEqual(3);
  }, 240000);

  it('Handy auf gerader Strecke um 90° gedreht (schlechtes GPS): der neue Pfad erzeugt daraus keinen Winkel', () => {
    let rotations = 0, extra = 0, anchoredExtra = 0;
    for (const c of cases) {
      const o = runScenario(c.scenario);
      // Drehung mitten auf dem ersten Schenkel, 20 s vor dem echten Winkel — abwechselnd links/rechts.
      const tRot = SIM_T0_MS + (o.truth.corners[0].tS - 20) * 1000;
      const sign = c.scenario.seed % 2 === 0 ? 1 : -1;
      const motion = o.motion.map(m => (m.t > tRot && m.t <= tRot + 1000 ? { ...m, headingDelta: m.headingDelta + sign * 22.5 } : m));
      const run2 = runLay({ fixes: o.fixes, motion, t0Ms: SIM_T0_MS });
      const rotated = scoreLay(o.truth, run2, SIM_T0_MS);
      // Sensorverankerte Winkel haben keine Fusions-Diagnose (fused === null).
      anchoredExtra += Math.max(0, run2.corners.filter(k => !k.fused).length - o.run.corners.filter(k => !k.fused).length);
      rotations++;
      extra += Math.max(0, rotated.cornersSpurious - o.score.cornersSpurious);
    }
    expect(rotations).toBe(16);
    expect(anchoredExtra).toBe(0);
    // Restrisiko im BESTEHENDEN Regelpfad: eine Handydrehung in Richtung eines Drift-Kandidaten
    // stützt ihn (gemessen 5 von 16; ohne die richtungsabhängige Sperre 9 von 16).
    expect(extra).toBeLessThanOrEqual(6);
  }, 240000);
});
