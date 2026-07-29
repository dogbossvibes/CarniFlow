import {
  createActiveSegment, finalizeSegment, sanitizeRestoredSegments,
  activeOrPlannedSegment, buildTrackSegmentPolylines, coerceTrackSegments,
  type TrackSegment,
} from '@/features/tracking/utils/trackSegments';
import type { TrackPointSample } from '@/features/tracking/store/trackingStore';

const pt = (lat: number, lng: number): TrackPointSample => ({ lat, lng, accuracy: 4, t: 0 });

const active = (over: Partial<TrackSegment> = {}): TrackSegment => createActiveSegment({
  dogId: 'd1', trackSessionId: 's1', type: 'no_food', currentStep: 12,
  startTrackPointIndex: 2, startCoordinate: { lat: 47.0, lng: 8.0 }, voiceEnabled: true, ...over as any,
});

describe('Teilstrecke Start/Stop — createActiveSegment', () => {
  const seg = active();
  it('1) Start erzeugt status=active', () => expect(seg.status).toBe('active'));
  it('2) startTrackPointIndex korrekt', () => expect(seg.startTrackPointIndex).toBe(2));
  it('3) startCoordinate korrekt', () => expect(seg.startCoordinate).toEqual({ lat: 47.0, lng: 8.0 }));
  it('startStep aus currentStep abgeleitet, keine Vorabplanung', () => {
    expect(seg.startStep).toBe(12);
    expect(seg.endStep).toBe(12);
    expect(seg.plannedLengthSteps).toBe(0);
    expect(seg.endTrackPointIndex).toBeNull();
  });
});

describe('Teilstrecke Start/Stop — finalizeSegment', () => {
  const done = finalizeSegment(active({ startTrackPointIndex: 2 }), { currentStep: 20, endTrackPointIndex: 9, endCoordinate: { lat: 47.1, lng: 8.1 } });
  it('4) Stop erzeugt status=completed', () => expect(done.status).toBe('completed'));
  it('5) endTrackPointIndex korrekt', () => expect(done.endTrackPointIndex).toBe(9));
  it('6) endCoordinate korrekt', () => expect(done.endCoordinate).toEqual({ lat: 47.1, lng: 8.1 }));
  it('7) plannedLengthSteps = endStep - startStep', () => {
    expect(done.endStep).toBe(20);
    expect(done.plannedLengthSteps).toBe(8);   // 20 - 12
  });
  it('Stop vor Start-Schritt → endStep auf startStep geklemmt, Länge 0', () => {
    const d = finalizeSegment(active(), { currentStep: 5, endTrackPointIndex: 3, endCoordinate: null });
    expect(d.endStep).toBe(12);
    expect(d.plannedLengthSteps).toBe(0);
  });
});

describe('Teilstrecke Start/Stop — Guard & mehrere Segmente', () => {
  it('8) zweite TS während aktiver TS blockiert (activeOrPlannedSegment liefert die aktive)', () => {
    const segs = [finalizeSegment(active(), { currentStep: 18, endTrackPointIndex: 5, endCoordinate: null }), active({ startTrackPointIndex: 6 })];
    expect(activeOrPlannedSegment(segs)?.status).toBe('active');   // Start eines zweiten wird im Handler dadurch verhindert
  });
  it('9) mehrere abgeschlossene TS bleiben als eigene Segment-Polylines erhalten', () => {
    const points = [pt(0, 0), pt(0, 1), pt(0, 2), pt(0, 3), pt(0, 4), pt(0, 5)];
    const s1: TrackSegment = { ...active({ startTrackPointIndex: 0 }), status: 'completed', endTrackPointIndex: 1 };
    const s2: TrackSegment = { ...active({ startTrackPointIndex: 3 }), status: 'completed', endTrackPointIndex: 4 };
    const parts = buildTrackSegmentPolylines(points, [s1, s2]);
    expect(parts.filter(p => p.kind === 'segment')).toHaveLength(2);
  });
});

describe('Teilstrecke Start/Stop — Live-Rendering aktive TS (Phase 6/12)', () => {
  it('12) aktive TS wird live von Start bis zum letzten TrackPoint gerendert', () => {
    const points = [pt(0, 0), pt(0, 1), pt(0, 2), pt(0, 3), pt(0, 4)];
    const seg = active({ startTrackPointIndex: 1 });   // aktiv, kein endIndex
    const parts = buildTrackSegmentPolylines(points, [seg]);
    const segPart = parts.find(p => p.kind === 'segment');
    expect(segPart).toBeTruthy();
    expect(segPart!.coordinates).toHaveLength(4);   // Index 1..4
  });
});

describe('Teilstrecke Start/Stop — Recovery (Phase 8)', () => {
  it('10) genau eine gültige aktive TS wird beibehalten', () => {
    const segs = [active({ startTrackPointIndex: 2 })];
    const out = sanitizeRestoredSegments(segs);
    expect(out[0].status).toBe('active');
    expect(out[0].startTrackPointIndex).toBe(2);
  });
  it('aktive TS ohne gültigen startTrackPointIndex → kontrolliert cancelled', () => {
    const bad: TrackSegment = { ...active(), startTrackPointIndex: null };
    expect(sanitizeRestoredSegments([bad])[0].status).toBe('cancelled');
  });
  it('nie mehr als eine aktive TS nach Recovery', () => {
    const out = sanitizeRestoredSegments([active({ startTrackPointIndex: 1 }), active({ startTrackPointIndex: 2 })]);
    expect(out.filter(s => s.status === 'active')).toHaveLength(1);
    expect(out[1].status).toBe('cancelled');
  });
  it('coerceTrackSegments akzeptiert das Start/Stop-Segment (JSON-Roundtrip)', () => {
    const done = finalizeSegment(active(), { currentStep: 20, endTrackPointIndex: 9, endCoordinate: { lat: 1, lng: 2 } });
    const round = coerceTrackSegments(JSON.parse(JSON.stringify([done])));
    expect(round[0].status).toBe('completed');
    expect(round[0].endTrackPointIndex).toBe(9);
  });
});
