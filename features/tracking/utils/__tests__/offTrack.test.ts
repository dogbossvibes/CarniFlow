import {
  getOffTrackThreshold, stepOffTrack, initialOffTrack, offTrackTotalDurationMs,
  OFF_TRACK, type OffTrackSnapshot,
} from '@/features/tracking/utils/offTrack';

// Fixe Genauigkeit 3 m → warning=4.5, offTrack=6.5, recovery=2.7 (gutes GPS).
const ACC = 3;
let t = 0;
const feed = (snap: OffTrackSnapshot, crossTrackM: number, opts?: { accuracyM?: number | null; accepted?: boolean }) =>
  stepOffTrack(snap, { crossTrackM, accuracyM: opts?.accuracyM ?? ACC, accepted: opts?.accepted ?? true, nowMs: (t += 1000) });
const drive = (snap: OffTrackSnapshot, crossTrackM: number, n: number, opts?: { accuracyM?: number | null }) => {
  let last = { snap, transition: null as any, thresholds: getOffTrackThreshold({ accuracyM: ACC }), reliable: true, freezeProgress: false };
  for (let i = 0; i < n; i++) last = feed(last.snap, crossTrackM, opts);
  return last;
};

beforeEach(() => { t = 0; });

describe('getOffTrackThreshold — GPS-adaptiv', () => {
  it('gutes GPS: warning ab MIN, off = warning+extra, recovery < warning, reliable', () => {
    const th = getOffTrackThreshold({ accuracyM: 3 });
    expect(th.warningM).toBeCloseTo(4.5);
    expect(th.offTrackM).toBeCloseTo(6.5);
    expect(th.recoveryM).toBeCloseTo(2.7);
    expect(th.recoveryM).toBeLessThan(th.warningM);   // Hysterese
    expect(th.reliable).toBe(true);
  });
  it('sehr gutes GPS greift Mindest-Warngrenze (kein Zentimeter-Alarm)', () => {
    const th = getOffTrackThreshold({ accuracyM: 0.5 });
    expect(th.warningM).toBe(OFF_TRACK.MIN_WARNING_M);
  });
  it('schlechtes GPS: großzügiger UND reliable=false', () => {
    const th = getOffTrackThreshold({ accuracyM: 30 });
    expect(th.warningM).toBeGreaterThan(30);
    expect(th.reliable).toBe(false);
  });
});

describe('Off-Track State Machine', () => {
  it('12) on_track bleibt on_track bei kleinem Abstand', () => {
    const r = drive(initialOffTrack(), 1, 6);
    expect(r.snap.state).toBe('on_track');
    expect(r.transition).toBeNull();
  });

  it('13) einzelner Ausreißer löst KEIN off_track (und kein warning) aus', () => {
    let r = feed(initialOffTrack(), 1);        // on_track
    r = feed(r.snap, 20);                        // 1 Ausreißer → warnStreak 1
    r = feed(r.snap, 1);                         // wieder gut → reset
    expect(r.snap.state).toBe('on_track');
  });

  it('14) warning nach WARN_CONSECUTIVE bestätigten Fixes über der Warngrenze', () => {
    let r = feed(initialOffTrack(), 5);
    expect(r.snap.state).toBe('on_track');       // 1. Fix
    r = feed(r.snap, 5);
    expect(r.snap.state).toBe('warning');        // 2. Fix → WARNING
    expect(r.transition).toBe('warning');
  });

  it('15) off_track nach warning + OFF_CONSECUTIVE Fixes über der Off-Schwelle', () => {
    const r = drive(initialOffTrack(), 7, 4);    // 2× warn + Eskalation
    expect(r.snap.state).toBe('off_track');
    expect(r.snap.events).toBe(1);
  });

  it('16) schlechte GPS-Accuracy erzeugt keine Warnung (State gehalten)', () => {
    const r = drive(initialOffTrack(), 30, 6, { accuracyM: 40 });
    expect(r.snap.state).toBe('on_track');
    expect(r.reliable).toBe(false);
  });

  it('17) Hysterese: Totzone zwischen recovery und warning hält WARNING (kein Flattern)', () => {
    let r = drive(initialOffTrack(), 5, 2);      // → warning
    expect(r.snap.state).toBe('warning');
    r = feed(r.snap, 4);                          // 2.7 < 4 < 4.5 → Totzone
    expect(r.snap.state).toBe('warning');
    r = feed(r.snap, 4);
    expect(r.snap.state).toBe('warning');         // kein Recover, kein Flackern
  });

  it('18/19) Recovery erst nach RECOVER_CONSECUTIVE guten Fixes', () => {
    let r = drive(initialOffTrack(), 7, 4);       // off_track
    expect(r.snap.state).toBe('off_track');
    r = feed(r.snap, 1); expect(r.snap.state).toBe('off_track');   // 1 gut
    r = feed(r.snap, 1); expect(r.snap.state).toBe('off_track');   // 2 gut
    r = feed(r.snap, 1);
    expect(r.snap.state).toBe('on_track');        // 3 gut → recovered
    expect(r.transition).toBe('recovered');
  });

  it('22) freezeProgress ist true während bestätigtem off_track, sonst false', () => {
    const on = drive(initialOffTrack(), 1, 3);
    expect(on.freezeProgress).toBe(false);
    const off = drive(initialOffTrack(), 7, 4);
    expect(off.freezeProgress).toBe(true);
  });

  it('35/37/38) Statistik: Ereigniszähler + max. Abweichung + mehrere Ereignisse', () => {
    // 1. Off-Track
    let r = drive(initialOffTrack(), 7, 4);
    r = feed(r.snap, 9);                           // größere Abweichung während off
    expect(r.snap.maxDeviationM).toBeGreaterThanOrEqual(9);
    // zurück
    r = drive(r.snap, 1, 3);
    expect(r.snap.state).toBe('on_track');
    expect(r.snap.events).toBe(1);
    // 2. Off-Track
    r = drive(r.snap, 7, 4);
    expect(r.snap.events).toBe(2);
  });

  it('36) Off-Track-Dauer wird summiert (abgeschlossen + laufend)', () => {
    let r = drive(initialOffTrack(), 7, 4);        // off_track @ ~t
    const startNow = t;
    r = feed(r.snap, 8);                            // +1000 ms off
    const live = offTrackTotalDurationMs(r.snap, t);
    expect(live).toBeGreaterThanOrEqual(1000);
    // recover → abgeschlossene Dauer bleibt erhalten
    r = drive(r.snap, 1, 3);
    expect(r.snap.offDurationMs).toBeGreaterThan(0);
    expect(offTrackTotalDurationMs(r.snap, t)).toBe(r.snap.offDurationMs);
    expect(startNow).toBeGreaterThan(0);
  });
});
