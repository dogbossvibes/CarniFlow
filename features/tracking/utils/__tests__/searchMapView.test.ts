// Reine Darstellungs-Mathematik der Absuche-Karte (GitHub-Issue #33):
// Laufrichtung aus der Soll-Fährte, Zoomstufen, Look-ahead, Kürzel-Versatz,
// Kollisionsregel und der Hinweis «Nächstes Ereignis».
import { buildArc, type LL } from '@/features/tracking/utils/searchGeometry';
import {
  SEARCH_VIEW, appleAltitudeForSpanM, distanceToNextEventM, googleZoomForSpanM, isEventPassed,
  lookAheadFractionForInsets, nextSearchEvents, placeSearchLabels, searchLaidStroke, searchViewSpanM,
  SEARCH_ZOOM, SEARCH_ZOOM_LEVELS, nextSearchZoomLevel, isSearchZoomLevel,
  trackHeadingAtProgress, type LabelFeature,
} from '@/features/tracking/utils/searchMapView';

const M_PER_DEG = 111320;
const LAT0 = 47;
const COS = Math.cos(LAT0 * Math.PI / 180);
/** Punkt in lokalen Metern (x Ost, y Nord) um 47° N. */
const at = (xEastM: number, yNorthM: number): LL => ({ latitude: LAT0 + yNorthM / M_PER_DEG, longitude: 8 + xEastM / (M_PER_DEG * COS) });
const xy = (p: { lat: number; lng: number }) => ({ x: (p.lng - 8) * M_PER_DEG * COS, y: (p.lat - LAT0) * M_PER_DEG });
const feature = (key: string, kind: 'angle' | 'object', x: number, y: number, arcM?: number): LabelFeature => {
  const p = at(x, y);
  return { key, kind, lat: p.latitude, lng: p.longitude, arcM };
};
/** Linie in 1-m-Schritten durch die Eckpunkte (wie eine aufgezeichnete Fährte). */
function polyline(corners: [number, number][]): LL[] {
  const out: LL[] = [at(...corners[0])];
  for (let i = 1; i < corners.length; i++) {
    const [x0, y0] = corners[i - 1], [x1, y1] = corners[i];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 1; k <= n; k++) out.push(at(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n));
  }
  return out;
}
const near = (actual: number, expected: number, tol: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
const headingNear = (actual: number | null, expected: number, tol = 1) => {
  expect(actual).not.toBeNull();
  const d = Math.abs((((actual as number) - expected + 540) % 360) - 180);
  expect(d).toBeLessThanOrEqual(tol);
};

// 40 m nach Norden, 90° rechts, 40 m nach Osten.
const L_TRACK = polyline([[0, 0], [0, 40], [40, 40]]);
const L_ARC = buildArc(L_TRACK);

describe('A — Laufrichtung aus der gelegten Fährte', () => {
  it('folgt dem aktuellen Schenkel, auch im Stand (unabhängig von GPS-Bewegung)', () => {
    headingNear(trackHeadingAtProgress(L_TRACK, L_ARC.cum, 0, [40]), 0);
    headingNear(trackHeadingAtProgress(L_TRACK, L_ARC.cum, 10, [40]), 0);
    headingNear(trackHeadingAtProgress(L_TRACK, L_ARC.cum, 60, [40]), 90);
  });

  it('dreht NICHT vor dem Winkel — auch unmittelbar davor bleibt die alte Richtung', () => {
    headingNear(trackHeadingAtProgress(L_TRACK, L_ARC.cum, 30, [40]), 0);
    headingNear(trackHeadingAtProgress(L_TRACK, L_ARC.cum, 39.5, [40]), 0);
  });

  it('dreht erst einige Meter NACH dem Winkel', () => {
    headingNear(trackHeadingAtProgress(L_TRACK, L_ARC.cum, 40 + SEARCH_VIEW.turnDelayM - 0.5, [40]), 0);
    headingNear(trackHeadingAtProgress(L_TRACK, L_ARC.cum, 40 + SEARCH_VIEW.turnDelayM + 0.1, [40]), 90);
  });

  it('ohne Winkelmarker folgt die Sehne weich einem Bogen', () => {
    const before = trackHeadingAtProgress(L_TRACK, L_ARC.cum, 20, []);
    const across = trackHeadingAtProgress(L_TRACK, L_ARC.cum, 33, []);
    headingNear(before, 0);
    expect(across as number).toBeGreaterThan(5);
    expect(across as number).toBeLessThan(85);
  });

  it('Spitzwinkel: nach dem Winkel zeigt die Richtung zurück', () => {
    const sharp = polyline([[0, 0], [0, 40], [8, 0]]);
    const arc = buildArc(sharp);
    headingNear(trackHeadingAtProgress(sharp, arc.cum, 20, [40]), 0);
    headingNear(trackHeadingAtProgress(sharp, arc.cum, 50, [40]), 180 - Math.atan2(8, 40) * 180 / Math.PI, 1.5);
  });

  it('kurzer Schenkel zwischen zwei Winkeln wird nicht aus Zentimetern gepeilt', () => {
    const track = polyline([[0, 0], [0, 30], [6, 30], [6, 60]]);
    const arc = buildArc(track);
    headingNear(trackHeadingAtProgress(track, arc.cum, 30 + SEARCH_VIEW.turnDelayM + 0.5, [30, 36]), 90, 2);
  });

  it('klemmt Fortschritt ausserhalb der Linie und liefert null ohne belastbare Linie', () => {
    headingNear(trackHeadingAtProgress(L_TRACK, L_ARC.cum, -5, [40]), 0);
    headingNear(trackHeadingAtProgress(L_TRACK, L_ARC.cum, 999, [40]), 90);
    expect(trackHeadingAtProgress([], [], 5)).toBeNull();
    expect(trackHeadingAtProgress([at(0, 0)], [0], 5)).toBeNull();
    expect(trackHeadingAtProgress([at(0, 0), at(0, 0)], [0, 0], 0)).toBeNull();
    expect(trackHeadingAtProgress(L_TRACK, L_ARC.cum, Number.NaN, [40])).toBeNull();
  });

  it('verändert die übergebene Linie und Winkel-Liste nicht (reine Funktion)', () => {
    const corners = [60, 40];
    const snapshot = JSON.stringify(L_TRACK);
    trackHeadingAtProgress(L_TRACK, L_ARC.cum, 50, corners);
    expect(corners).toEqual([60, 40]);
    expect(JSON.stringify(L_TRACK)).toBe(snapshot);
  });
});

describe('Zoom-Stufen (T-218)', () => {
  it('normal ist der bisherige Ausschnitt; nah zeigt weniger, weit mehr', () => {
    expect(SEARCH_ZOOM.normal.spanM).toBe(SEARCH_VIEW.spanM);
    expect(SEARCH_ZOOM.near.spanM).toBeLessThan(SEARCH_ZOOM.normal.spanM);
    expect(SEARCH_ZOOM.far.spanM).toBeGreaterThan(SEARCH_ZOOM.normal.spanM);
    expect(searchViewSpanM(null, null, 'near')).toBe(SEARCH_ZOOM.near.spanM);
    expect(searchViewSpanM(null, 60, 'far')).toBe(SEARCH_ZOOM.far.spanM);
    expect(searchViewSpanM(null, 60)).toBe(SEARCH_VIEW.spanM);
  });

  it('vor einem Ereignis geht jede Stufe näher heran, mit Hysterese', () => {
    for (const level of SEARCH_ZOOM_LEVELS) {
      const { spanM, nearSpanM } = SEARCH_ZOOM[level];
      expect(nearSpanM).toBeLessThan(spanM);
      expect(searchViewSpanM(spanM, 19.9, level)).toBe(nearSpanM);
      expect(searchViewSpanM(spanM, 22, level)).toBe(spanM);
      expect(searchViewSpanM(nearSpanM, 22, level)).toBe(nearSpanM);
      expect(searchViewSpanM(nearSpanM, 40, level)).toBe(spanM);
    }
  });

  it('im Nah-Zoom bleibt das Ereignis im Bild: 20 m voraus passen in den Ausschnitt vor der Position', () => {
    // Die Position liegt bei 78 % der Kartenhöhe → so viel Karte liegt voraus.
    expect(SEARCH_ZOOM.normal.nearSpanM * SEARCH_VIEW.positionFraction).toBeGreaterThanOrEqual(SEARCH_VIEW.nearEnterM);
  });

  it('Antippen schaltet normal → nah → weit → normal; ungültige Werte werden nicht als Stufe gelesen', () => {
    expect(nextSearchZoomLevel('normal')).toBe('near');
    expect(nextSearchZoomLevel('near')).toBe('far');
    expect(nextSearchZoomLevel('far')).toBe('normal');
    expect(isSearchZoomLevel('near')).toBe(true);
    expect(isSearchZoomLevel('gross')).toBe(false);
    expect(isSearchZoomLevel(null)).toBe(false);
  });
});

describe('B — Fährten-Zoom und freie Sicht', () => {
  it('Standard ≈ 60–80 m sichtbare Höhe, nahe am Ereignis etwas näher', () => {
    expect(SEARCH_VIEW.spanM).toBeGreaterThanOrEqual(60);
    expect(SEARCH_VIEW.spanM).toBeLessThanOrEqual(80);
    expect(SEARCH_VIEW.nearSpanM).toBeLessThan(SEARCH_VIEW.spanM);
    expect(searchViewSpanM(null, null)).toBe(SEARCH_VIEW.spanM);
    expect(searchViewSpanM(null, 60)).toBe(SEARCH_VIEW.spanM);
    expect(searchViewSpanM(SEARCH_VIEW.spanM, 19.9)).toBe(SEARCH_VIEW.nearSpanM);
  });

  it('Hysterese: kein Pumpen an der 20-m-Grenze, nach dem Ereignis zurück', () => {
    expect(searchViewSpanM(SEARCH_VIEW.spanM, 22)).toBe(SEARCH_VIEW.spanM);
    expect(searchViewSpanM(SEARCH_VIEW.nearSpanM, 22)).toBe(SEARCH_VIEW.nearSpanM);
    expect(searchViewSpanM(SEARCH_VIEW.nearSpanM, 40)).toBe(SEARCH_VIEW.spanM);
    expect(searchViewSpanM(SEARCH_VIEW.nearSpanM, null)).toBe(SEARCH_VIEW.spanM);
  });

  it('Distanz zum nächsten Ereignis zählt nur vorwärts', () => {
    expect(distanceToNextEventM([40, 70, 10], 25)).toBe(15);
    expect(distanceToNextEventM([40, 70], 40)).toBe(0);
    expect(distanceToNextEventM([40, 70], 71)).toBeNull();
    expect(distanceToNextEventM([], 5)).toBeNull();
  });

  it('Apple Maps: Kamerahöhe aus sichtbarer Höhe (30° Öffnungswinkel), proportional', () => {
    near(appleAltitudeForSpanM(70), 130.6, 0.1);
    near(appleAltitudeForSpanM(50) / appleAltitudeForSpanM(70), 50 / 70, 1e-9);
  });

  it('Google Maps: Zoomstufe aus sichtbarer Höhe; halbe Höhe = +1 Zoom', () => {
    const z70 = googleZoomForSpanM(70, 47, 520) as number;
    near(z70, Math.log2(156543.03392 * Math.cos(47 * Math.PI / 180) / (70 / 520)), 1e-9);
    expect(z70).toBeGreaterThan(19);
    expect(z70).toBeLessThan(20);
    near((googleZoomForSpanM(35, 47, 520) as number) - z70, 1, 1e-9);
    expect(googleZoomForSpanM(70, 47, 0)).toBeNull();
    expect(googleZoomForSpanM(0, 47, 520)).toBeNull();
  });

  it('Look-ahead hält die Position oberhalb der unteren Karten', () => {
    const height = 520, top = 132, bottom = 130;
    const fraction = lookAheadFractionForInsets(height, top, bottom);
    const positionY = (0.5 + fraction) * height;
    expect(positionY).toBeGreaterThan(top);
    expect(positionY).toBeLessThan(height - bottom - 20);   // inkl. Radius des Positionsmarkers
    expect(fraction).toBeGreaterThan(0);
  });

  it('Look-ahead bleibt begrenzt und robust bei unbekannter/kleiner Kartenhöhe', () => {
    expect(lookAheadFractionForInsets(0, 100, 100)).toBe(0.22);
    expect(lookAheadFractionForInsets(520, 0, 0)).toBeLessThanOrEqual(SEARCH_VIEW.maxLookAheadFraction);
    expect(lookAheadFractionForInsets(200, 180, 180)).toBeGreaterThanOrEqual(0);
  });

  it('Linie: ca. 6 pt in der Fährtenfarbe mit dunkler Kontur', () => {
    const stroke = searchLaidStroke({ strokeColor: '#15e6c3', strokeWidth: 4 });
    expect(stroke.strokeWidth).toBe(6);
    expect(stroke.strokeColor).toBe('#15e6c3');
    expect(stroke.outlineWidth).toBeGreaterThan(stroke.strokeWidth);
    expect(stroke.outlineColor).toBe('#04110F');
  });
});

describe('C — Kürzel-Platzierung', () => {
  const MPP = SEARCH_VIEW.spanM / 520;   // Meter je Punkt beim Absuche-Zoom
  const minSepM = SEARCH_VIEW.labelMinSepPt * MPP;
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  /** Abstand eines Punkts zur Polyline (m). */
  const lineDistance = (p: { x: number; y: number }, corners: [number, number][]) => {
    let best = Infinity;
    for (let i = 1; i < corners.length; i++) {
      const [ax, ay] = corners[i - 1], [bx, by] = corners[i];
      const l2 = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / l2));
      best = Math.min(best, Math.hypot(p.x - (ax + (bx - ax) * t), p.y - (ay + (by - ay) * t)));
    }
    return best;
  };

  it('Winkelkürzel steht auf der Aussenseite des Knicks, ca. 2–3,5 m versetzt', () => {
    const placed = placeSearchLabels(L_TRACK, [feature('w1', 'angle', 0, 40, 40)], MPP).get('w1')!;
    const label = xy(placed.label), anchor = xy(placed.anchor);
    near(anchor.x, 0, 0.05); near(anchor.y, 40, 0.05);   // der Knick selbst bleibt der Ankerpunkt
    // Rechtswinkel Nord→Ost: aussen = Nordwest.
    expect(label.x).toBeLessThan(-1);
    expect(label.y).toBeGreaterThan(41);
    const offset = dist(label, anchor);
    expect(offset).toBeGreaterThanOrEqual(SEARCH_VIEW.labelOffsetM);
    expect(offset).toBeLessThanOrEqual(3.6);
    expect(offset / MPP).toBeGreaterThanOrEqual(SEARCH_VIEW.labelClearancePt - 0.01);   // Badge verdeckt den Knick nicht
  });

  it('Linkswinkel spiegelt die Aussenseite', () => {
    const track = polyline([[0, 0], [0, 40], [-40, 40]]);
    const label = xy(placeSearchLabels(track, [feature('w1', 'angle', 0, 40, 40)], MPP).get('w1')!.label);
    expect(label.x).toBeGreaterThan(1);
    expect(label.y).toBeGreaterThan(41);
  });

  it('G-Kürzel steht quer neben der Linie, auf der anderen Seite als das Winkelkürzel', () => {
    const placed = placeSearchLabels(L_TRACK, [feature('w1', 'angle', 0, 40, 40), feature('g1', 'object', 0, 20, 20)], MPP);
    const angle = xy(placed.get('w1')!.label), object = xy(placed.get('g1')!.label);
    expect(angle.x).toBeLessThan(0);        // Winkelkürzel links (aussen)
    expect(object.x).toBeGreaterThan(2);    // G-Kürzel rechts der Linie
    near(object.y, 20, 0.2);
    expect(placed.get('g1')!.paired).toBe(false);
  });

  it('Winkel und G näher als 5 m stehen nebeneinander und überlappen nicht', () => {
    const placed = placeSearchLabels(L_TRACK, [feature('w1', 'angle', 0, 40, 40), feature('g1', 'object', 3, 40, 43)], MPP);
    const angle = xy(placed.get('w1')!.label), object = xy(placed.get('g1')!.label);
    expect(placed.get('g1')!.paired).toBe(true);
    near(dist(angle, object), SEARCH_VIEW.pairSepPt * MPP, 0.05);
    // beide auf der Aussenseite, keines auf der Linie
    const corners: [number, number][] = [[0, 0], [0, 40], [40, 40]];
    expect(lineDistance(angle, corners)).toBeGreaterThan(1.5);
    expect(lineDistance(object, corners)).toBeGreaterThan(1.5);
    // der Ankerpunkt des Gegenstands bleibt sein echter Ablagepunkt
    near(xy(placed.get('g1')!.anchor).x, 3, 0.05);
  });

  it('Gegenstand weiter als 5 m vom Winkel wird nicht gepaart', () => {
    const placed = placeSearchLabels(L_TRACK, [feature('w1', 'angle', 0, 40, 40), feature('g1', 'object', 9, 40, 49)], MPP);
    expect(placed.get('g1')!.paired).toBe(false);
  });

  it('kein Kürzel überdeckt ein anderes — auch bei dicht liegenden Ereignissen', () => {
    const corners: [number, number][] = [[0, 0], [0, 30], [6, 30], [6, 60], [30, 60]];
    const track = polyline(corners);
    const features = [
      feature('w1', 'angle', 0, 30, 30), feature('w2', 'angle', 6, 30, 36), feature('w3', 'angle', 6, 60, 66),
      feature('g1', 'object', 0, 27, 27), feature('g2', 'object', 6, 33, 39), feature('g3', 'object', 6, 36, 42),
      feature('g4', 'object', 10, 60, 70),
    ];
    const placed = placeSearchLabels(track, features, MPP);
    expect(placed.size).toBe(features.length);
    const labels = [...placed.values()].map(p => ({ key: p.key, ...xy(p.label) }));
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      expect(dist(labels[i], labels[j])).toBeGreaterThanOrEqual(Math.min(minSepM, SEARCH_VIEW.pairSepPt * MPP) - 0.05);
    }
    // und kein Kürzel sitzt auf einem Knick
    for (const label of labels) for (const [cx, cy] of [[0, 30], [6, 30], [6, 60]]) {
      expect(dist(label, { x: cx, y: cy })).toBeGreaterThan(2);
    }
  });

  it('ohne Bogenlänge wird der Marker auf die Linie projiziert (gleiches Ergebnis)', () => {
    const withArc = placeSearchLabels(L_TRACK, [feature('w1', 'angle', 0, 40, 40)], MPP).get('w1')!;
    const projected = placeSearchLabels(L_TRACK, [feature('w1', 'angle', 0, 40)], MPP).get('w1')!;
    near(xy(projected.label).x, xy(withArc.label).x, 0.05);
    near(xy(projected.label).y, xy(withArc.label).y, 0.05);
  });

  it('deterministisch und robust: gleiche Eingabe → gleiche Positionen; leere/kaputte Eingaben', () => {
    const features = [feature('w1', 'angle', 0, 40, 40), feature('g1', 'object', 0, 20, 20)];
    expect([...placeSearchLabels(L_TRACK, features, MPP)]).toEqual([...placeSearchLabels(L_TRACK, features, MPP)]);
    expect(placeSearchLabels(L_TRACK, [], MPP).size).toBe(0);
    expect(placeSearchLabels([], features, MPP).size).toBe(2);   // ohne Linie: trotzdem versetzt statt Absturz
    expect(placeSearchLabels(L_TRACK, [{ key: 'x', kind: 'angle', lat: Number.NaN, lng: 8 }], MPP).size).toBe(0);
    const fallbackScale = placeSearchLabels(L_TRACK, features, 0).get('w1')!;
    expect(Number.isFinite(fallbackScale.label.lat)).toBe(true);
  });
});

describe('E — Hinweis «Nächstes Ereignis»', () => {
  const events = [
    { id: 'g2', arcM: 61, label: 'G2' },
    { id: 'w1', arcM: 53, label: '90 R' },
    { id: 'g1', arcM: 20, label: 'G1' },
  ];

  it('nennt das nächste Ereignis relativ zur Hundeposition und das danach', () => {
    const next = nextSearchEvents(events, 40)!;
    expect(next.next).toEqual({ id: 'w1', label: '90 R', distanceM: 13 });
    expect(next.then).toEqual({ id: 'g2', label: 'G2', gapM: 8 });
    expect(next.highlight).toBe(false);
  });

  it('hebt unter ca. 6 m hervor', () => {
    expect(nextSearchEvents(events, 47.5)!.highlight).toBe(true);
    expect(nextSearchEvents(events, 47)!.highlight).toBe(false);
  });

  it('passierte Ereignisse fallen weg; letztes Ereignis ohne «danach»; danach nichts', () => {
    expect(nextSearchEvents(events, 53)!.next.id).toBe('g2');
    expect(nextSearchEvents(events, 53)!.then).toBeNull();
    expect(nextSearchEvents(events, 61)).toBeNull();
    expect(nextSearchEvents([], 0)).toBeNull();
    expect(nextSearchEvents(events, Number.NaN)).toBeNull();
  });

  it('passierte Kürzel werden blasser (ca. 45 %), kommende nicht', () => {
    expect(SEARCH_VIEW.passedOpacity).toBeCloseTo(0.45);
    expect(isEventPassed(20, 40)).toBe(true);
    expect(isEventPassed(53, 40)).toBe(false);
    expect(isEventPassed(39.5, 40)).toBe(false);   // gerade erst erreicht
    expect(isEventPassed(null, 40)).toBe(false);
    expect(isEventPassed(undefined, 40)).toBe(false);
  });
});
