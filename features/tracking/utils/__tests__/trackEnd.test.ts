import {
  stepTrackEnd, DEFAULT_TRACK_END_OPTIONS, type TrackEndState, type TrackEndInput,
} from '@/features/tracking/utils/guidanceEngine';
import { estimateDogProgressM } from '@/features/tracking/utils/searchGeometry';

const L = 100; // gelegte Fährtenlänge (m)

// Sequenz durch die Zustandsmaschine laufen lassen; zählt die Auslösungen.
function runSequence(inputs: TrackEndInput[]): { states: TrackEndState[]; triggers: number } {
  let prev: TrackEndState = 'unseen';
  const states: TrackEndState[] = [];
  let triggers = 0;
  for (const inp of inputs) {
    const r = stepTrackEnd(inp, prev, DEFAULT_TRACK_END_OPTIONS);
    if (r.justReached) triggers++;
    prev = r.state;
    states.push(r.state);
  }
  return { states, triggers };
}

const atEnd = (over: Partial<TrackEndInput> = {}): TrackEndInput => ({
  dogProgressM: L, trackLengthM: L, geomDistanceM: 1.0, openMandatoryObjects: 0, ...over,
});

describe('stepTrackEnd — Fährtenende-Erkennung', () => {
  it('1. Hund erreicht korrekt das Ende → einmalige Erkennung', () => {
    const r = stepTrackEnd(atEnd(), 'unseen');
    expect(r.state).toBe('reached');
    expect(r.justReached).toBe(true);
    // Folge-Tick: completed, kein weiterer Trigger
    const r2 = stepTrackEnd(atEnd(), r.state);
    expect(r2.state).toBe('completed');
    expect(r2.justReached).toBe(false);
  });

  it('2. Hund noch 10 m vor dem Ende → keine Erkennung', () => {
    const r = stepTrackEnd(
      { dogProgressM: L - 10, trackLengthM: L, geomDistanceM: 10, openMandatoryObjects: 0 }, 'unseen');
    expect(r.justReached).toBe(false);
    expect(r.state).not.toBe('reached');
  });

  it('3. Route läuft früher räumlich nahe am Endpunkt vorbei → keine vorzeitige Erkennung', () => {
    // dogProgressM (order-aware) noch niedrig, obwohl die Luftlinie klein wäre.
    const r = stepTrackEnd(
      { dogProgressM: 30, trackLengthM: L, geomDistanceM: 1.0, openMandatoryObjects: 0 }, 'unseen');
    expect(r.justReached).toBe(false);
    expect(r.state).toBe('unseen');
  });

  it('4. Hund virtuell am Ende, Handler noch dahinter → korrekt erkannt', () => {
    // Handler erst bei L-5, Handler-Abstand 5 → virtueller Hundefortschritt = L.
    const dogProgressM = estimateDogProgressM(L - 5, 5, L);
    expect(dogProgressM).toBeCloseTo(L, 5);
    const r = stepTrackEnd(
      { dogProgressM, trackLengthM: L, geomDistanceM: 1.0, openMandatoryObjects: 0 }, 'unseen');
    expect(r.state).toBe('reached');
    expect(r.justReached).toBe(true);
  });

  it('5. GPS-Jitter am Ende → nur einmalige Auslösung', () => {
    const jitter: TrackEndInput[] = [
      atEnd({ geomDistanceM: 1.2 }),
      atEnd({ geomDistanceM: 2.8 }),
      atEnd({ geomDistanceM: 0.9 }),
      atEnd({ geomDistanceM: 3.2 }),
      atEnd({ geomDistanceM: 1.1 }),
    ];
    const { triggers, states } = runSequence(jitter);
    expect(triggers).toBe(1);
    expect(states[0]).toBe('reached');
    expect(states.slice(1)).toEqual(['completed', 'completed', 'completed', 'completed']);
  });

  it('6. Offene Pflicht-Gegenstände blockieren das TATSÄCHLICHE Ende NICHT (Produktentscheidung)', () => {
    // Hund order-aware am Ende (progress+geom erfüllt), aber ein Gegenstand wurde wegen
    // GPS-/EMA-Toleranz nicht automatisch gefunden → Ende trotzdem erreicht, Grund sichtbar.
    const withOpen = stepTrackEnd(atEnd({ openMandatoryObjects: 1 }), 'unseen');
    expect(withOpen.justReached).toBe(true);
    expect(withOpen.state).toBe('reached');
    expect(withOpen.reason).toBe('triggered_open_objects');
  });

  it('6b. Opt-in openObjectsBlockEnd=true → offene Gegenstände blockieren weiterhin', () => {
    const opts = { ...DEFAULT_TRACK_END_OPTIONS, openObjectsBlockEnd: true };
    const withOpen = stepTrackEnd(atEnd({ openMandatoryObjects: 1 }), 'unseen', opts);
    expect(withOpen.justReached).toBe(false);
    expect(withOpen.reason).toBe('open_objects');
    const afterFound = stepTrackEnd(atEnd({ openMandatoryObjects: 0 }), withOpen.state, opts);
    expect(afterFound.state).toBe('reached');
    expect(afterFound.justReached).toBe(true);
  });

  it('7. Nach completed keine erneute Endmeldung', () => {
    const r = stepTrackEnd(atEnd(), 'completed');
    expect(r.state).toBe('completed');
    expect(r.justReached).toBe(false);
  });

  it('ohne gelegte Fährte (trackLengthM ~ 0) → nie reached', () => {
    const r = stepTrackEnd(
      { dogProgressM: 0, trackLengthM: 0, geomDistanceM: null, openMandatoryObjects: 0 }, 'unseen');
    expect(r.state).toBe('unseen');
    expect(r.justReached).toBe(false);
  });

  it('Endkriterien: 97 % Fortschritt UND ≤ 3 m Geometrie erforderlich', () => {
    // 97 % erreicht, aber geometrisch noch 5 m entfernt → nicht reached (nur approaching).
    const farGeom = stepTrackEnd(
      { dogProgressM: 0.98 * L, trackLengthM: L, geomDistanceM: 5, openMandatoryObjects: 0 }, 'unseen');
    expect(farGeom.state).toBe('approaching');
    expect(farGeom.justReached).toBe(false);
  });
});
