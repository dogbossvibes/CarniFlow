import { buildRunInsights, detectArcs, elevationProfile, type InsightLayPoint } from '@/features/tracking/insights/runInsights';
import type { TrackAnalytics } from '@/features/tracking/engine/trackAnalytics';
import { runInsightsResources } from '@/features/tracking/insights/i18n';

const LAT0 = 47.4, LNG0 = 8.5;
const M_LAT = 111_320, M_LNG = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const ll = (x: number, y: number) => ({ latitude: LAT0 + y / M_LAT, longitude: LNG0 + x / M_LNG });

/** 50 m nach Norden, 90°-Rechtsbogen (Radius 20 m), 40 m nach Osten. */
function arcTrack(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let y = 0; y <= 50; y += 2) pts.push({ x: 0, y });
  const r = 20;
  for (let a = 5; a <= 90; a += 5) {
    const rad = (a * Math.PI) / 180;
    pts.push({ x: r - r * Math.cos(rad), y: 50 + r * Math.sin(rad) });
  }
  for (let x = 22; x <= 60; x += 2) pts.push({ x, y: 70 });
  return pts;
}

/** 50 m nach Norden, harter 90°-Rechtswinkel, 40 m nach Osten. */
function cornerTrack(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let y = 0; y <= 50; y += 2) pts.push({ x: 0, y });
  for (let x = 2; x <= 40; x += 2) pts.push({ x, y: 50 });
  return pts;
}

function analytics(over: Partial<TrackAnalytics> = {}): TrackAnalytics {
  return {
    analyticsVersion: 1,
    analysisConfidence: 0.9,
    analysisConfidenceBand: 'excellent',
    analysisConfidenceHint: null,
    deviation: { meanM: 1, medianM: 1, p95M: 2, maxReliableM: 2, maxRawM: 2, timeWithinM15S: 0, timeWithinM2S: 0, timeOutsideM3S: 0, timeOutsideM5S: 0 },
    corners: [],
    objects: [],
    reacquisition: { count: 0, completedCount: 0, meanSec: null, maxSec: null, medianSec: null },
    pace: { avgMps: 0.8, medianMps: 0.8, consistency: 0.8 },
    trackScore: 90,
    ...over,
  };
}

describe('detectArcs', () => {
  it('erkennt einen 90°-Rechtsbogen auf der gelegten Linie', () => {
    const arcs = detectArcs(arcTrack().map(p => ll(p.x, p.y)), []);
    expect(arcs).toHaveLength(1);
    expect(arcs[0].side).toBe('rechts');
    expect(arcs[0].turnDeg).toBeGreaterThanOrEqual(70);
    expect(arcs[0].turnDeg).toBeLessThanOrEqual(100);
    expect(arcs[0].startM).toBeGreaterThan(40);
    expect(arcs[0].quality).toBe('unknown');
  });

  it('meldet einen harten Winkel nicht als Bogen', () => {
    expect(detectArcs(cornerTrack().map(p => ll(p.x, p.y)), [50])).toEqual([]);
  });

  it('meldet eine gerade Linie mit leichtem GPS-Zittern nicht als Bogen', () => {
    const pts = Array.from({ length: 60 }, (_, i) => ll(i % 2 ? 0.4 : -0.4, i * 2));
    expect(detectArcs(pts, [])).toEqual([]);
  });

  it('erkennt, wenn der Hund innen abkürzt', () => {
    const lay = arcTrack();
    // Innen bei einem Rechtsbogen = Richtung Bogenmittelpunkt (20, 50): Spur 4 m näher dran.
    const run = lay.map(p => {
      if (p.y <= 50 || p.y >= 70) return { lat: ll(p.x, p.y).latitude, lng: ll(p.x, p.y).longitude };
      const dx = 20 - p.x, dy = 50 - p.y, d = Math.hypot(dx, dy);
      const q = ll(p.x + (dx / d) * 4, p.y + (dy / d) * 4);
      return { lat: q.latitude, lng: q.longitude };
    });
    const arcs = detectArcs(lay.map(p => ll(p.x, p.y)), [], run);
    expect(arcs[0].quality).toBe('cut_inside');
    expect(arcs[0].meanOffsetM).toBeGreaterThan(2.5);
  });

  it('erkennt, wenn der Hund aussen läuft, und bewertet eine enge Spur als sauber', () => {
    const lay = arcTrack();
    const outside = lay.map(p => {
      if (p.y <= 50 || p.y >= 70) return { lat: ll(p.x, p.y).latitude, lng: ll(p.x, p.y).longitude };
      const dx = p.x - 20, dy = p.y - 50, d = Math.hypot(dx, dy);
      const q = ll(p.x + (dx / d) * 4, p.y + (dy / d) * 4);
      return { lat: q.latitude, lng: q.longitude };
    });
    expect(detectArcs(lay.map(p => ll(p.x, p.y)), [], outside)[0].quality).toBe('wide_outside');
    const exact = lay.map(p => ({ lat: ll(p.x, p.y).latitude, lng: ll(p.x, p.y).longitude }));
    expect(detectArcs(lay.map(p => ll(p.x, p.y)), [], exact)[0].quality).toBe('clean');
  });
});

describe('elevationProfile', () => {
  it('berechnet Anstieg und Abstieg mit Glättung und ignoriert einzelne Ausreisser', () => {
    const pts: InsightLayPoint[] = Array.from({ length: 41 }, (_, i) => {
      const alt = i <= 20 ? 400 + i : 420 - (i - 20) * 0.5;
      return { ...ll(0, i * 5), altitude: i === 10 ? 480 : alt };
    });
    const e = elevationProfile(pts)!;
    expect(e).not.toBeNull();
    expect(e.ascentM).toBeGreaterThanOrEqual(15);
    expect(e.ascentM).toBeLessThanOrEqual(21);
    expect(e.descentM).toBeGreaterThanOrEqual(6);
    expect(e.maxM).toBeLessThan(430);
    expect(e.flat).toBe(false);
    expect(e.profile.length).toBeLessThanOrEqual(49);
  });

  it('liefert null ohne Höhenwerte (ältere Fährten)', () => {
    expect(elevationProfile(Array.from({ length: 20 }, (_, i) => ll(0, i * 3)))).toBeNull();
  });

  it('erkennt eine flache Fährte', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({ ...ll(0, i * 3), altitude: 500 + (i % 2) }));
    expect(elevationProfile(pts)!.flat).toBe(true);
  });
});

describe('buildRunInsights', () => {
  it('liefert null ohne Analyse', () => {
    expect(buildRunInsights({ analytics: null })).toBeNull();
  });

  it('bewertet einen sauberen Lauf als stark mit Stärken', () => {
    const r = buildRunInsights({
      analytics: analytics({
        corners: [{ atM: 50, side: 'rechts', sharpness: 'rechtwinklig', arrivalTSec: 60, speedBeforeMps: 0.8, minDistanceM: 0.5, maxLateralDeviationM: 1.2, overshootM: 0.5, reacquisitionSec: null }],
      }),
      layPoints: cornerTrack().map(p => ll(p.x, p.y)),
      objectsFound: 3, objectsTotal: 3,
    })!;
    expect(r.verdict.level).toBe('strong');
    expect(r.findRate).toMatchObject({ found: 3, total: 3, percent: 100 });
    expect(r.angles[0].quality).toBe('clean');
    expect(r.elementsClean).toBe(1);
    expect(r.verdict.strengths.map(m => m.key)).toEqual(['strength.angles', 'strength.allFound', 'strength.line']);
    expect(r.verdict.tips.map(m => m.key)).toEqual(['tip.nextStep']);
    expect(r.pace).toMatchObject({ avgKmh: 2.9, band: 'calm' });
  });

  it('gibt konkrete Tipps bei überschossenem Winkel, fehlenden Gegenständen und hohem Tempo', () => {
    const r = buildRunInsights({
      analytics: analytics({
        corners: [{ atM: 50, side: 'links', sharpness: 'rechtwinklig', arrivalTSec: 60, speedBeforeMps: 1.8, minDistanceM: 2, maxLateralDeviationM: 6, overshootM: 7.4, reacquisitionSec: 4 }],
        pace: { avgMps: 1.8, medianMps: 1.7, consistency: 0.7 },
      }),
      objectsFound: 1, objectsTotal: 3,
    })!;
    expect(r.verdict.level).toBe('work');
    const keys = r.verdict.tips.map(m => m.key);
    expect(keys).toEqual(['tip.angleOvershoot', 'tip.findRate', 'tip.paceFast']);
    expect(r.verdict.tips[0].params).toEqual({ n: 1, m: 7.4 });
    expect(r.findRate?.percent).toBe(33);
  });

  it('nennt bei unsicherem GPS zuerst die Datengrundlage', () => {
    const r = buildRunInsights({ analytics: analytics({ analysisConfidenceBand: 'unreliable' }) })!;
    expect(r.verdict.level).toBe('uncertain');
    expect(r.verdict.tips[0].key).toBe('tip.gps');
  });

  it('übersetzt jeden erzeugten Text in allen Sprachen', () => {
    for (const dict of Object.values(runInsightsResources)) {
      for (const key of ['tip.angleOvershoot', 'tip.sharpOvershoot', 'tip.angleLongSearch', 'tip.arcCut', 'tip.arcWide', 'tip.findRate', 'tip.indication', 'tip.deviations', 'tip.paceFast', 'tip.paceSlower', 'tip.paceFaster', 'tip.paceUneven', 'tip.elevation', 'tip.gps', 'tip.nextStep', 'strength.angles', 'strength.arcs', 'strength.allFound', 'strength.indication', 'strength.line', 'strength.pace']) {
        expect((dict as Record<string, string>)[key]).toBeTruthy();
      }
    }
  });
});
