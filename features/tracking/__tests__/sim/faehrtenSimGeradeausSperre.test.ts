// T-214: Geradeaus-Sperre in der echten Lege-Verarbeitung — Regressionstest über den Simulator.
// Lichter Wald, Mittelklasse-Handy, rechter Winkel mit 40-m-Schenkeln: vor T-214 meldete die
// Engine hier in 8 Läufen 12 Winkel auf gerader Strecke.
import { buildGroup } from './matrix';
import { runScenario } from './scenario';
import { DEVICE_LABEL, ENV_LABEL } from './profiles';

jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/backgroundLayDiagnostics', () => ({ recordBackgroundLayEvent: jest.fn(async () => {}) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) }));

const cases = buildGroup('geraet', 8).filter(c =>
  c.table.includes('rechter Winkel') && c.row === DEVICE_LABEL.single && c.col === ENV_LABEL.forest);

describe('Geradeaus-Sperre im Lege-Ablauf (T-214)', () => {
  it('mit Bewegungssensor: kaum noch Winkel auf gerader Strecke, echte Winkel bleiben', () => {
    let spurious = 0, found = 0;
    for (const c of cases) { const { score } = runScenario(c.scenario); spurious += score.cornersSpurious; found += score.cornersFound; }
    expect(cases).toHaveLength(8);
    expect(spurious).toBeLessThanOrEqual(2);
    expect(found).toBeGreaterThanOrEqual(2);
  }, 120000);

  it('ohne Bewegungssensor entscheidet die Sperre nichts — Erkennung wie bisher', () => {
    let spurious = 0;
    for (const c of cases) spurious += runScenario({ ...c.scenario, motion: false }).score.cornersSpurious;
    expect(spurious).toBeGreaterThanOrEqual(5);
  }, 120000);
});
