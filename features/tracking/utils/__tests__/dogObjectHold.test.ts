import { DOG_OBJECT_HOLD, dogProgressWithObjectHold, type DogHoldObject } from '@/features/tracking/utils/dogObjectHold';
import { estimateDogProgressM } from '@/features/tracking/utils/searchGeometry';

const run = (handlerProgressM: number, objects: DogHoldObject[], leadM = 5, nowS = 0, trackTotalM = 200) =>
  dogProgressWithObjectHold({ handlerProgressM, leadM, trackTotalM, objects, nowS });

describe('Virtuelle Hundeposition mit Halt am Gegenstand (T-203)', () => {
  it('ohne Gegenstände unverändert: Hundeführer-Fortschritt + Hundeabstand, am Ende geklemmt', () => {
    for (const lead of [1, 5, 10]) for (const handler of [0, 12.5, 80, 199]) {
      expect(run(handler, [], lead).dogProgressM).toBe(estimateDogProgressM(handler, lead, 200));
    }
  });

  it('läuft normal auf den Gegenstand zu und bleibt dort stehen, während der Hundeführer zum Hund geht', () => {
    const objects: DogHoldObject[] = [{ arcM: 50, status: 'pending' }];
    expect(run(40, objects, 5)).toEqual({ dogProgressM: 45, heldObjectIndex: null });
    // Hund liegt bei 50 m; der Hundeführer geht von 45 m bis zum Gegenstand.
    for (const handler of [45.5, 47, 49, 50, 51.5]) {
      expect(run(handler, objects, 5)).toEqual({ dogProgressM: 50, heldObjectIndex: 0 });
    }
  });

  it('gilt für jeden Hundeabstand (1 / 5 / 10 m)', () => {
    const objects: DogHoldObject[] = [{ arcM: 50, status: 'pending' }];
    expect(run(49.5, objects, 1).dogProgressM).toBe(50);
    expect(run(44, objects, 10).dogProgressM).toBe(50);
  });

  it('gibt die Pfote frei, sobald der Recorder den Gegenstand als verpasst führt (Hund hat überlaufen)', () => {
    expect(run(54.5, [{ arcM: 50, status: 'missed' }], 5)).toEqual({ dogProgressM: 59.5, heldObjectIndex: null });
    expect(run(54.5, [{ arcM: 50, status: 'unobserved' }], 5).dogProgressM).toBe(59.5);
    expect(run(51, [{ arcM: 50, status: 'user_removed' }], 5).dogProgressM).toBe(56);
  });

  it('nach dem Fund läuft die Pfote in Hundetempo wieder voraus statt zu springen', () => {
    const found = (resolvedAtS: number): DogHoldObject[] => [{ arcM: 50, status: 'auto_dwell_found', resolvedAtS }];
    expect(run(50, found(100), 5, 100).dogProgressM).toBe(50);
    expect(run(50, found(100), 5, 102).dogProgressM).toBeCloseTo(50 + 2 * DOG_OBJECT_HOLD.restartSpeedMps, 6);
    // Nach genügend Zeit wieder der normale Abstand — nie darüber hinaus.
    expect(run(50, found(100), 5, 130).dogProgressM).toBe(55);
    expect(run(50, [{ arcM: 50, status: 'manual_found', resolvedAtS: 100 }], 10, 103).dogProgressM).toBeCloseTo(52.4, 6);
  });

  it('kein Rücksprung: spät bestätigter Fund weit hinter dem Hundeführer bremst die Pfote nicht', () => {
    expect(run(70, [{ arcM: 50, status: 'manual_found', resolvedAtS: 100 }], 5, 100).dogProgressM).toBe(75);
    // Wiederaufnahme: Fund ohne Zeitpunkt (aus früherer Sitzung) → kein Wiederanlauf.
    expect(run(50, [{ arcM: 50, status: 'manual_found', resolvedAtS: null }], 5, 0).dogProgressM).toBe(55);
  });

  it('mehrere Gegenstände: der erste offene hält; nach dessen Fund der nächste', () => {
    const objects: DogHoldObject[] = [{ arcM: 30, status: 'pending' }, { arcM: 33, status: 'pending' }];
    expect(run(29, objects, 5)).toEqual({ dogProgressM: 30, heldObjectIndex: 0 });
    const afterFirst: DogHoldObject[] = [{ arcM: 30, status: 'manual_found', resolvedAtS: 10 }, { arcM: 33, status: 'pending' }];
    expect(run(30, afterFirst, 5, 60)).toEqual({ dogProgressM: 33, heldObjectIndex: 1 });
  });

  it('Gegenstand ohne bestimmbare Lage auf der Fährte hält nichts fest; fehlender Status zählt als offen', () => {
    expect(run(48, [{ arcM: null, status: 'pending' }], 5).dogProgressM).toBe(53);
    expect(run(48, [{ arcM: 50, status: undefined }], 5).dogProgressM).toBe(50);
  });

  it('der Fortschritt der Pfote geht beim Zulaufen und Halten nie rückwärts', () => {
    const objects: DogHoldObject[] = [{ arcM: 50, status: 'pending' }];
    let last = -Infinity;
    for (let handler = 30; handler <= 52; handler += 0.5) {
      const now = run(handler, objects, 10).dogProgressM;
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(last).toBe(50);
  });
});
