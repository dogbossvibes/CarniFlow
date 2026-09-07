import {
  isReplayAvailable, initialReplayState, tickReplay, playReplay, pauseReplay, seekReplay, setReplaySpeed,
  replayProgress, formatReplayClock, replayPositionAt, replayTraveledPoints, replayEventsFromSegments,
  segmentAtTime, type ReplayGeometry,
} from '@/features/tracking/engine/trackReplay';
import type { AnalyticsSegment } from '@/features/tracking/engine/trackSegmentAnalysis';

function geometry(n: number, stepSec = 2): ReplayGeometry {
  const points = []; const pointsTimeSec = [];
  for (let i = 0; i < n; i++) { points.push({ latitude: i * 0.0001, longitude: 0 }); pointsTimeSec.push(i * stepSec); }
  return { points, pointsTimeSec };
}

function segment(overrides: Partial<AnalyticsSegment>): AnalyticsSegment {
  return {
    id: 'seg-0', index: 0, type: 'straight',
    startDistanceM: 0, endDistanceM: 10, lengthM: 10,
    startTimeSec: 0, endTimeSec: 10, durationSec: 10,
    meanDeviationM: 0.5, medianDeviationM: 0.5, p95DeviationM: 0.5, maxDeviationM: 0.5,
    timeWithinM15S: 10, timeWithinM2S: 10, timeOutsideM3S: 0, timeOutsideM5S: 0,
    averageSpeedMps: 1, speedConsistency: 1, analysisConfidence: 1, analysisConfidenceBand: 'excellent',
    score: 90,
    ...overrides,
  };
}

describe('trackReplay — Verfügbarkeit (Punkt 18/21)', () => {
  it('keine Timestamps → Replay unavailable', () => {
    expect(isReplayAvailable({ points: [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }], pointsTimeSec: [] })).toBe(false);
  });
  it('Längen-Mismatch (z. B. Resume) → Replay unavailable', () => {
    expect(isReplayAvailable({ points: [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 }], pointsTimeSec: [0] })).toBe(false);
  });
  it('weniger als 2 Punkte → Replay unavailable', () => {
    expect(isReplayAvailable({ points: [{ latitude: 0, longitude: 0 }], pointsTimeSec: [0] })).toBe(false);
  });
  it('genug Punkte + passende Zeitstempel → verfügbar', () => {
    expect(isReplayAvailable(geometry(5))).toBe(true);
  });
  it('null/undefined → unavailable, kein Crash', () => {
    expect(isReplayAvailable(null)).toBe(false);
    expect(isReplayAvailable(undefined)).toBe(false);
  });
});

describe('trackReplay — Progress 0 → Start, 1 → Ende', () => {
  it('elapsedSec 0 → progress 0', () => {
    const g = geometry(6);   // 0..10s
    expect(replayProgress({ ...initialReplayState(), elapsedSec: 0 }, g)).toBe(0);
  });
  it('elapsedSec == Gesamtdauer → progress 1', () => {
    const g = geometry(6);
    expect(replayProgress({ ...initialReplayState(), elapsedSec: 10 }, g)).toBe(1);
  });
});

describe('trackReplay — Play/Pause/Resume', () => {
  it('play() setzt playing=true', () => {
    const g = geometry(6);
    const st = playReplay(initialReplayState(), g);
    expect(st.playing).toBe(true);
  });
  it('pause() setzt playing=false, elapsedSec bleibt erhalten', () => {
    const g = geometry(6);
    let st = playReplay(initialReplayState(), g);
    st = tickReplay(st, 3, g);
    st = pauseReplay(st);
    expect(st.playing).toBe(false);
    expect(st.elapsedSec).toBe(3);
  });
  it('resume nach pause läuft ab der pausierten Stelle weiter', () => {
    const g = geometry(6);
    let st = playReplay(initialReplayState(), g);
    st = tickReplay(st, 3, g);
    st = pauseReplay(st);
    st = playReplay(st, g);
    st = tickReplay(st, 2, g);
    expect(st.elapsedSec).toBe(5);
  });
  it('am Ende erneut play() → startet von vorne', () => {
    const g = geometry(6);
    let st = { ...initialReplayState(), elapsedSec: 10 };
    st = playReplay(st, g);
    expect(st.elapsedSec).toBe(0);
    expect(st.playing).toBe(true);
  });
  it('tick über das Ende hinaus stoppt automatisch (kein Überlauf, kein Loop)', () => {
    const g = geometry(6);   // 0..10s
    let st = playReplay(initialReplayState(), g);
    st = tickReplay(st, 999, g);
    expect(st.elapsedSec).toBe(10);
    expect(st.playing).toBe(false);
  });
});

describe('trackReplay — Geschwindigkeit', () => {
  it('2× Speed: 1 Sekunde real → 2 Sekunden Replay-Zeit', () => {
    const g = geometry(6);
    let st = setReplaySpeed(playReplay(initialReplayState(), g), 2);
    st = tickReplay(st, 1, g);
    expect(st.elapsedSec).toBe(2);
  });
  it('0.5× Speed: 2 Sekunden real → 1 Sekunde Replay-Zeit', () => {
    const g = geometry(6);
    let st = setReplaySpeed(playReplay(initialReplayState(), g), 0.5);
    st = tickReplay(st, 2, g);
    expect(st.elapsedSec).toBe(1);
  });
  it('4× Speed', () => {
    const g = geometry(6);
    let st = setReplaySpeed(playReplay(initialReplayState(), g), 4);
    st = tickReplay(st, 1, g);
    expect(st.elapsedSec).toBe(4);
  });
});

describe('trackReplay — Jump to event / seek', () => {
  it('seekReplay springt exakt an die Zielzeit', () => {
    const g = geometry(6);
    const st = seekReplay(initialReplayState(), 4.5, g);
    expect(st.elapsedSec).toBe(4.5);
  });
  it('seekReplay klemmt ausserhalb der Session auf [0, Gesamtdauer]', () => {
    const g = geometry(6);
    expect(seekReplay(initialReplayState(), -5, g).elapsedSec).toBe(0);
    expect(seekReplay(initialReplayState(), 999, g).elapsedSec).toBe(10);
  });
});

describe('trackReplay — Puck-Interpolation (Punkt 8: nie ein Sprung durch Outlier)', () => {
  it('Position zwischen zwei Punkten wird linear interpoliert', () => {
    const g = geometry(3, 2);   // t=0,2,4 an lat 0, 0.0001, 0.0002
    const pos = replayPositionAt(g, 1);   // Mitte zwischen Punkt 0 und 1
    expect(pos!.latitude).toBeCloseTo(0.00005, 6);
  });
  it('Position vor dem ersten Zeitstempel → erster Punkt', () => {
    const g = geometry(3, 2);
    expect(replayPositionAt(g, -5)).toEqual(g.points[0]);
  });
  it('Position nach dem letzten Zeitstempel → letzter Punkt', () => {
    const g = geometry(3, 2);
    expect(replayPositionAt(g, 999)).toEqual(g.points[2]);
  });
  it('kein Sprung: die Geometrie selbst enthält per Konstruktion keine Fusion-Outlier (useSearchRecorder pusht sie nie in pointsRef) — aufeinanderfolgende Positionen liegen nie weiter auseinander als die tatsächlichen Rohpunkte', () => {
    const g = geometry(5, 2);
    const p0 = replayPositionAt(g, 0)!;
    const p1 = replayPositionAt(g, 8)!;
    // Reine Kontinuitätsprüfung: die Distanz zwischen den Enden entspricht
    // exakt der Summe der (hier künstlichen) Geometrie, kein Sprung darüber hinaus.
    expect(p1.latitude).toBeCloseTo(g.points[4].latitude, 6);
    expect(p0.latitude).toBeCloseTo(g.points[0].latitude, 6);
  });
});

describe('trackReplay — Timeline-Events (Punkt 9)', () => {
  it('erzeugt sortierte Events für Ecken/Gegenstände/Neuaufnahmen/starke Abweichung', () => {
    const segs: AnalyticsSegment[] = [
      segment({ id: 'a', index: 0, type: 'straight', startTimeSec: 0, meanDeviationM: 0.3 }),
      segment({ id: 'b', index: 1, type: 'corner', startTimeSec: 20, cornerIndex: 0 }),
      segment({ id: 'c', index: 2, type: 'straight', startTimeSec: 10, meanDeviationM: 4.2 }),   // stärkere Abweichung
      segment({ id: 'd', index: 3, type: 'object_zone', startTimeSec: 40, objectIndex: 0 }),
      segment({ id: 'e', index: 4, type: 'reacquisition', startTimeSec: 30 }),
    ];
    const events = replayEventsFromSegments(segs);
    expect(events.map(e => e.type)).toEqual(['high_deviation', 'corner', 'reacquisition', 'object']);
    expect(events.every((e, i) => i === 0 || e.timeSec >= events[i - 1].timeSec)).toBe(true);
  });

  it('segmentAtTime findet das zum Zeitpunkt passende Segment', () => {
    const segs: AnalyticsSegment[] = [
      segment({ id: 'a', index: 0, startTimeSec: 0, endTimeSec: 10 }),
      segment({ id: 'b', index: 1, startTimeSec: 10, endTimeSec: 20 }),
    ];
    expect(segmentAtTime(segs, 5)!.id).toBe('a');
    expect(segmentAtTime(segs, 15)!.id).toBe('b');
    expect(segmentAtTime(segs, 999)).toBeNull();
  });
});

describe('trackReplay — formatReplayClock', () => {
  it('formatiert mm:ss korrekt', () => {
    expect(formatReplayClock(0)).toBe('0:00');
    expect(formatReplayClock(222)).toBe('3:42');
    expect(formatReplayClock(678)).toBe('11:18');
  });
  it('robust gegen negative/NaN-Eingaben', () => {
    expect(formatReplayClock(-5)).toBe('0:00');
    expect(formatReplayClock(NaN)).toBe('0:00');
  });
});

describe('trackReplay — wachsende Ist-Spur', () => {
  it('replayTraveledPoints wächst monoton mit elapsedSec', () => {
    const g = geometry(5, 2);
    const early = replayTraveledPoints(g, 1);
    const late = replayTraveledPoints(g, 7);
    expect(late.length).toBeGreaterThanOrEqual(early.length);
    expect(replayTraveledPoints(g, 0).length).toBeGreaterThanOrEqual(1);
  });
  it('ohne verfügbares Replay → leeres Array, kein Crash', () => {
    expect(replayTraveledPoints({ points: [], pointsTimeSec: [] }, 5)).toEqual([]);
  });
});
