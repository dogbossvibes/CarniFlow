import {
  computeTrackSegments, computeSegmentHighlights,
  START_ZONE_M, FINISH_ZONE_M, CORNER_ZONE_BEFORE_M, CORNER_ZONE_AFTER_M, OBJECT_ZONE_RADIUS_M,
  type TrackSegmentationInput, type SegmentationCornerInput, type SegmentationObjectInput,
} from '@/features/tracking/engine/trackSegmentAnalysis';
import { analyzeCorners, analyzeObjects, type AnalyticsSample } from '@/features/tracking/engine/trackAnalytics';

function sample(atM: number, tSec: number, devM: number, confidence = 1, speedMps: number | null = null): AnalyticsSample {
  return { atM, tSec, devM, confidence, speedMps };
}

function straightSamples(lengthM: number, speedMps: number, devM = 0.3, confidence = 1): AnalyticsSample[] {
  const out: AnalyticsSample[] = [];
  for (let atM = 0; atM <= lengthM; atM += 2) out.push(sample(atM, atM / speedMps, devM, confidence, speedMps));
  return out;
}

function buildInput(overrides: Partial<TrackSegmentationInput> & { corners?: SegmentationCornerInput[]; objects?: SegmentationObjectInput[] } = {}): TrackSegmentationInput {
  const samples = overrides.samples ?? straightSamples(100, 1.2);
  const corners = overrides.corners ?? [];
  const objects = overrides.objects ?? [];
  return {
    samples,
    corners,
    cornerAnalysis: overrides.cornerAnalysis ?? analyzeCorners(samples, corners.map(c => ({ atM: c.atM, angleKind: 'links' }))),
    objects,
    objectAnalysis: overrides.objectAnalysis ?? analyzeObjects(samples, objects.map(o => ({ atM: o.atM, material: null, found: true }))),
    breaks: overrides.breaks ?? [],
    trackLengthM: overrides.trackLengthM ?? 100,
  };
}

describe('trackSegmentAnalysis — Segmentierung', () => {
  it('keine Winkel/Gegenstände → Start, eine lange Gerade, Ziel', () => {
    const input = buildInput();
    const segs = computeTrackSegments(input);
    expect(segs.map(s => s.type)).toEqual(['start', 'straight', 'finish']);
    expect(segs[0].startDistanceM).toBe(0);
    expect(segs[segs.length - 1].endDistanceM).toBe(100);
    // lückenlos aneinander
    for (let i = 1; i < segs.length; i++) expect(segs[i].startDistanceM).toBe(segs[i - 1].endDistanceM);
  });

  it('1 Winkel → Start, Gerade, Winkel, Gerade, Ziel', () => {
    const input = buildInput({ corners: [{ atM: 50 }], trackLengthM: 100 });
    const segs = computeTrackSegments(input);
    expect(segs.map(s => s.type)).toEqual(['start', 'straight', 'corner', 'straight', 'finish']);
    const corner = segs.find(s => s.type === 'corner')!;
    expect(corner.cornerIndex).toBe(0);
    expect(corner.startDistanceM).toBeCloseTo(50 - CORNER_ZONE_BEFORE_M, 5);
    expect(corner.endDistanceM).toBeCloseTo(50 + CORNER_ZONE_AFTER_M, 5);
  });

  it('mehrere Winkel (weit auseinander) → je eine eigene Corner-Zone', () => {
    const input = buildInput({ samples: straightSamples(300, 1.2), corners: [{ atM: 60 }, { atM: 200 }], trackLengthM: 300 });
    const segs = computeTrackSegments(input);
    const corners = segs.filter(s => s.type === 'corner');
    expect(corners).toHaveLength(2);
    expect(corners[0].cornerIndex).toBe(0);
    expect(corners[1].cornerIndex).toBe(1);
  });

  it('Gegenstand zwischen zwei Winkeln → Winkel/Gegenstand/Winkel in der richtigen Reihenfolge', () => {
    const input = buildInput({
      samples: straightSamples(300, 1.2),
      corners: [{ atM: 60 }, { atM: 240 }],
      objects: [{ atM: 150 }],
      trackLengthM: 300,
    });
    const segs = computeTrackSegments(input);
    const types = segs.map(s => s.type);
    const cornerIdx = types.indexOf('corner');
    const objectIdx = types.indexOf('object_zone');
    const secondCornerIdx = types.lastIndexOf('corner');
    expect(cornerIdx).toBeGreaterThan(-1);
    expect(objectIdx).toBeGreaterThan(cornerIdx);
    expect(secondCornerIdx).toBeGreaterThan(objectIdx);
  });

  it('Gegenstand nah am Winkel → beide Zonen bleiben eigenständig, werden am Mittelpunkt getrennt (keine Überlappung)', () => {
    // Winkel bei 50, Gegenstand nur 5 m weiter bei 55 — die Rohzonen (50±8/15,
    // 55±8) würden sich massiv überlappen.
    const input = buildInput({ samples: straightSamples(150, 1.2), corners: [{ atM: 50 }], objects: [{ atM: 55 }], trackLengthM: 150 });
    const segs = computeTrackSegments(input);
    const corner = segs.find(s => s.type === 'corner')!;
    const object = segs.find(s => s.type === 'object_zone')!;
    expect(corner.endDistanceM).toBeLessThanOrEqual(object.startDistanceM);
    expect(corner.cornerIndex).toBe(0);
    expect(object.objectIndex).toBe(0);
  });

  it('sehr kurze Gerade zwischen zwei nahen Winkeln wird nicht unterschlagen (oder sauber weggelassen, wenn Länge 0)', () => {
    const input = buildInput({ samples: straightSamples(200, 1.2), corners: [{ atM: 40 }, { atM: 70 }], trackLengthM: 200 });
    const segs = computeTrackSegments(input);
    // Kein Crash, lückenlose Kette bleibt erhalten.
    for (let i = 1; i < segs.length; i++) expect(segs[i].startDistanceM).toBe(segs[i - 1].endDistanceM);
    expect(segs[segs.length - 1].endDistanceM).toBe(200);
  });

  it('Start/Ende: kurze Fährte (kürzer als Start+Ziel-Zone zusammen) klemmt sauber, kein Crash', () => {
    const input = buildInput({ samples: straightSamples(6, 1.2), trackLengthM: 6 });
    const segs = computeTrackSegments(input);
    expect(segs[0].type).toBe('start');
    expect(segs[segs.length - 1].type).toBe('finish');
    expect(segs[segs.length - 1].endDistanceM).toBe(6);
    for (const s of segs) expect(s.startDistanceM).toBeLessThanOrEqual(s.endDistanceM);
  });
});

describe('trackSegmentAnalysis — Segmentmetriken', () => {
  it('perfekte Gerade (0 m Abweichung) → meanDeviationM ~0, hoher Score', () => {
    const input = buildInput({ samples: straightSamples(100, 1.2, 0) });
    const straight = computeTrackSegments(input).find(s => s.type === 'straight')!;
    expect(straight.meanDeviationM).toBeCloseTo(0, 1);
    expect(straight.score).toBeGreaterThanOrEqual(95);
  });

  it('konstante 2 m Abweichung → meanDeviationM ~2, mittlerer/niedrigerer Score', () => {
    const input = buildInput({ samples: straightSamples(100, 1.2, 2.0) });
    const straight = computeTrackSegments(input).find(s => s.type === 'straight')!;
    expect(straight.meanDeviationM).toBeCloseTo(2.0, 1);
    expect(straight.score!).toBeLessThan(100);
  });

  it('einzelner Outlier innerhalb eines Segments beeinflusst maxDeviationM (reliable) nicht unfair', () => {
    const clean = straightSamples(100, 1.2, 0.3);
    const outlierIdx = Math.floor(clean.length / 2);
    const withOutlier = clean.map((s, i) => i === outlierIdx ? { ...s, devM: 40, confidence: 0.1 } : s);
    const straight = computeTrackSegments(buildInput({ samples: withOutlier })).find(s => s.type === 'straight')!;
    expect(straight.maxDeviationM!).toBeLessThan(10);   // maxReliableM-Logik greift auch pro Segment
  });

  it('schlechte Confidence im gesamten Segment senkt analysisConfidence, aber NICHT die Geometrie/den Score im Vergleich zu identischer Bewegung', () => {
    const good = computeTrackSegments(buildInput({ samples: straightSamples(100, 1.2, 0.3, 1.0) })).find(s => s.type === 'straight')!;
    const bad = computeTrackSegments(buildInput({ samples: straightSamples(100, 1.2, 0.3, 0.3) })).find(s => s.type === 'straight')!;
    expect(bad.score).toBe(good.score);
    expect(bad.analysisConfidence).toBeLessThan(good.analysisConfidence);
  });

  it('Tempo: averageSpeedMps und speedConsistency plausibel für gleichmässige Bewegung', () => {
    const straight = computeTrackSegments(buildInput({ samples: straightSamples(100, 1.5, 0.3) })).find(s => s.type === 'straight')!;
    expect(straight.averageSpeedMps!).toBeCloseTo(1.5, 0);
    expect(straight.speedConsistency!).toBeGreaterThan(0.8);
  });

  it('Re-Acquisition: abgeschlossener Break ausserhalb einer Winkelzone erzeugt ein eigenes reacquisition-Segment mit Dauer', () => {
    const samples = straightSamples(200, 1.2, 0.3);
    const input = buildInput({
      samples, trackLengthM: 200,
      breaks: [{ startedAtSec: 60, recoveredAtSec: 66, durationSec: 6 }],
    });
    const segs = computeTrackSegments(input);
    const reacq = segs.find(s => s.type === 'reacquisition');
    expect(reacq).toBeDefined();
    expect(reacq!.durationSec).toBeCloseTo(6, 0);
    expect(reacq!.score).not.toBeNull();
  });

  it('Re-Acquisition innerhalb einer Winkelzone erzeugt KEIN zusätzliches Segment (keine doppelte Analyse)', () => {
    const samples = straightSamples(200, 1.2, 0.3);
    // Winkel bei atM=100 → Zone [92, 115]. Break-Zeitpunkt entspricht atM≈100.
    const input = buildInput({
      samples, trackLengthM: 200, corners: [{ atM: 100 }],
      breaks: [{ startedAtSec: 100 / 1.2, recoveredAtSec: 100 / 1.2 + 4, durationSec: 4 }],
    });
    const segs = computeTrackSegments(input);
    expect(segs.some(s => s.type === 'reacquisition')).toBe(false);
  });

  it('offener Break (kein recoveredAtSec) erzeugt kein reacquisition-Segment und keinen erfundenen Score', () => {
    const samples = straightSamples(200, 1.2, 0.3);
    const input = buildInput({ samples, trackLengthM: 200, breaks: [{ startedAtSec: 60, recoveredAtSec: null, durationSec: null }] });
    const segs = computeTrackSegments(input);
    expect(segs.some(s => s.type === 'reacquisition')).toBe(false);
  });
});

describe('trackSegmentAnalysis — Score-Fairness', () => {
  it('Segment-Score verschlechtert sich bei gleicher Geometrie NICHT durch schlechtere Analysis Confidence', () => {
    const goodConf = computeTrackSegments(buildInput({ samples: straightSamples(100, 1.2, 1.0, 1.0) }));
    const badConf = computeTrackSegments(buildInput({ samples: straightSamples(100, 1.2, 1.0, 0.2) }));
    for (let i = 0; i < goodConf.length; i++) {
      expect(badConf[i].score).toBe(goodConf[i].score);
    }
  });

  it('Gegenstandssegment ohne (bekannten) Objekt-Index bekommt keinen erfundenen Score', () => {
    const input = buildInput({ objects: [{ atM: 40 }], objectAnalysis: [] });   // absichtlich inkonsistent
    const segs = computeTrackSegments(input);
    const objSeg = segs.find(s => s.type === 'object_zone')!;
    expect(objSeg.score).toBeNull();
  });
});

describe('trackSegmentAnalysis — Highlights (Punkt 16)', () => {
  it('liefert 2-4 sachliche Highlights aus echten Metriken, keine Wertungssätze', () => {
    const input = buildInput({
      samples: straightSamples(200, 1.2, 0.3), trackLengthM: 200,
      corners: [{ atM: 100 }],
    });
    const segs = computeTrackSegments(input);
    const highlights = computeSegmentHighlights(segs);
    expect(highlights.length).toBeGreaterThanOrEqual(2);
    expect(highlights.length).toBeLessThanOrEqual(4);
    for (const h of highlights) {
      expect(h.valueText).toMatch(/^[\d.]+\s*(m|s|%)$/);   // reine Zahl + Einheit, kein Fliesstext
      expect(typeof h.labelKey).toBe('string');
    }
  });
});

describe('trackSegmentAnalysis — Konstanten', () => {
  it('Zonen-Konstanten sind zentral definiert (Punkt 3)', () => {
    expect(START_ZONE_M).toBeGreaterThan(0);
    expect(FINISH_ZONE_M).toBeGreaterThan(0);
    expect(CORNER_ZONE_BEFORE_M).toBeGreaterThan(0);
    expect(CORNER_ZONE_AFTER_M).toBeGreaterThan(0);
    expect(OBJECT_ZONE_RADIUS_M).toBeGreaterThan(0);
  });
});
