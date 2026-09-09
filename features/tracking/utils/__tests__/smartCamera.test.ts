// Kamera-Mathematik der navigationsartigen Kartenansicht. Reine Darstellung —
// diese Tests sichern ausdrücklich auch ab, dass die Kamera NICHTS am
// Tracking verändert (siehe useSmartTrackCamera.test.tsx für den Hook).
import {
  normalizeHeading, shortestAngleDelta, smoothHeading, cameraBearing, cameraDistanceM,
  offsetByBearing, resolveTravelHeading, computeCameraTarget, shouldUpdateCamera,
  CAMERA_DEFAULTS, COURSE_MIN_SPEED_MPS,
} from '@/features/tracking/utils/smartCamera';

const M_PER_DEG = 111320;
const at = (xEastM: number, yNorthM: number) => ({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG });

describe('Winkelmathematik', () => {
  it('normalizeHeading bildet auf [0,360) ab', () => {
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(360)).toBe(0);
    expect(normalizeHeading(-90)).toBe(270);
    expect(normalizeHeading(450)).toBe(90);
  });

  it('359° → 1° nimmt den kurzen Weg (+2°), nicht −358°', () => {
    expect(shortestAngleDelta(359, 1)).toBeCloseTo(2, 6);
    expect(shortestAngleDelta(1, 359)).toBeCloseTo(-2, 6);
    expect(shortestAngleDelta(355, 2)).toBeCloseTo(7, 6);
  });

  it('smoothHeading dreht über die 0°-Grenze ohne Sprung', () => {
    const next = smoothHeading(355, 2, 0.5, 0);
    // Halber kurzer Weg (7°) ab 355° → 358.5°, NICHT irgendwo bei ~180°.
    expect(next).toBeCloseTo(358.5, 3);
  });

  it('smoothHeading ignoriert Schwankungen unterhalb der Deadzone (kein Zittern)', () => {
    expect(smoothHeading(90, 92, 0.5, 3)).toBe(90);
    expect(smoothHeading(90, 100, 0.5, 3)).not.toBe(90);
  });
});

describe('Laufrichtung', () => {
  it('course 0 → Norden, course 90 → Osten (bei ausreichender Geschwindigkeit)', () => {
    expect(resolveTravelHeading({ courseDeg: 0, speedMps: 1.4 }).headingDeg).toBe(0);
    const east = resolveTravelHeading({ courseDeg: 90, speedMps: 1.4 });
    expect(east.headingDeg).toBe(90);
    expect(east.source).toBe('gps_course');
  });

  it('ohne belastbaren course wird die Peilung aus der Positionsfolge genommen', () => {
    const r = resolveTravelHeading({
      courseDeg: -1, speedMps: null,
      position: at(0, 10), lastAnchor: at(0, 0),   // 10 m nach Norden
    });
    expect(r.source).toBe('position_delta');
    expect(r.headingDeg).toBeCloseTo(0, 1);
    expect(r.trustworthy).toBe(true);
  });

  it('sehr langsame Bewegung: Gerätekompass nur als ERSTER Wert, danach nie wieder', () => {
    // Noch keine belastbare Laufrichtung → Kompass darf einspringen.
    const first = resolveTravelHeading({
      courseDeg: null, speedMps: 0.1, deviceHeadingDeg: 120, lastCourseDeg: null,
    });
    expect(first.source).toBe('device_heading');
    expect(first.headingDeg).toBe(120);
    expect(first.trustworthy).toBe(false);

    // Sobald eine echte Laufrichtung existiert, dreht ein gedrehtes Gerät die
    // Karte NICHT mehr mit — die letzte Laufrichtung wird gehalten.
    const later = resolveTravelHeading({
      courseDeg: null, speedMps: 0.1, deviceHeadingDeg: 300, lastCourseDeg: 45,
    });
    expect(later.source).toBe('hold');
    expect(later.headingDeg).toBe(45);
  });

  it('Stillstand: Kamera dreht nicht nervös, letzte Richtung wird gehalten', () => {
    const standing = { position: at(0, 0), lastAnchor: at(0.4, 0.4), speedMps: 0.05, courseDeg: -1, lastCourseDeg: 210 };
    for (let i = 0; i < 5; i++) {
      const r = resolveTravelHeading(standing);
      expect(r.source).toBe('hold');
      expect(r.headingDeg).toBe(210);
      expect(r.trustworthy).toBe(false);
    }
  });

  it('gemeldeter course unterhalb der Mindestgeschwindigkeit gilt nicht als belastbar', () => {
    const r = resolveTravelHeading({ courseDeg: 90, speedMps: COURSE_MIN_SPEED_MPS - 0.1, lastCourseDeg: 10 });
    expect(r.source).not.toBe('gps_course');
  });
});

describe('Kamera-Ziel', () => {
  it('Laufrichtung: Zentrum wird in Blickrichtung nach vorn versetzt (Position ins untere Drittel)', () => {
    const pos = at(0, 0);
    const t = computeCameraTarget({ position: pos, headingDeg: 0, mode: 'heading', pitchDeg: 0 });
    // Nach Norden schauen ⇒ Kartenmittelpunkt liegt NÖRDLICH der Position.
    expect(t.center.lat).toBeGreaterThan(pos.lat);
    expect(t.headingDeg).toBe(0);
    const offsetM = cameraDistanceM(pos, t.center);
    expect(offsetM).toBeCloseTo(CAMERA_DEFAULTS.viewportSpanM * CAMERA_DEFAULTS.lookAheadFraction, 0);
  });

  it('Look-ahead folgt der Blickrichtung (Osten ⇒ Zentrum östlich)', () => {
    const pos = at(0, 0);
    const t = computeCameraTarget({ position: pos, headingDeg: 90, mode: 'heading', pitchDeg: 0 });
    expect(t.center.lng).toBeGreaterThan(pos.lng);
    expect(Math.abs(t.center.lat - pos.lat)).toBeLessThan(1e-6);
  });

  it('Norden: Heading 0 und KEIN Look-ahead-Versatz (Position bleibt zentriert)', () => {
    const pos = at(5, 5);
    const t = computeCameraTarget({ position: pos, headingDeg: 210, mode: 'north', pitchDeg: 0 });
    expect(t.headingDeg).toBe(0);
    expect(t.center).toEqual(pos);
  });

  it('Perspektive reicht den Pitch unverändert durch (2D = 0)', () => {
    const pos = at(0, 0);
    expect(computeCameraTarget({ position: pos, headingDeg: 0, mode: 'heading', pitchDeg: 0 }).pitchDeg).toBe(0);
    expect(computeCameraTarget({ position: pos, headingDeg: 0, mode: 'heading', pitchDeg: CAMERA_DEFAULTS.pitch3D }).pitchDeg).toBe(40);
    expect(CAMERA_DEFAULTS.pitch3D).toBeGreaterThanOrEqual(35);
    expect(CAMERA_DEFAULTS.pitch3D).toBeLessThanOrEqual(45);
  });

  it('offsetByBearing/cameraBearing sind zueinander konsistent', () => {
    const from = at(0, 0);
    const to = offsetByBearing(from, 135, 50);
    expect(cameraBearing(from, to)).toBeCloseTo(135, 1);
    expect(cameraDistanceM(from, to)).toBeCloseTo(50, 1);
  });
});

describe('Kamera-Drosselung (reine UI-Drosselung)', () => {
  it('erlaubt höchstens ~4–5 Updates/s', () => {
    expect(CAMERA_DEFAULTS.minUpdateIntervalMs).toBeGreaterThanOrEqual(200);
    expect(CAMERA_DEFAULTS.minUpdateIntervalMs).toBeLessThanOrEqual(250);
    expect(shouldUpdateCamera({ nowMs: 1000, lastUpdateMs: 900, headingDeltaDeg: 90, centerMovedM: 50 })).toBe(false);
    expect(shouldUpdateCamera({ nowMs: 1300, lastUpdateMs: 900, headingDeltaDeg: 90, centerMovedM: 50 })).toBe(true);
  });

  it('erstes Update ist sofort erlaubt', () => {
    expect(shouldUpdateCamera({ nowMs: 0, lastUpdateMs: null, headingDeltaDeg: 0, centerMovedM: 99 })).toBe(true);
  });

  it('unterhalb von Deadzone UND Mindestbewegung passiert nichts (kein Zittern im Stand)', () => {
    expect(shouldUpdateCamera({ nowMs: 5000, lastUpdateMs: 1000, headingDeltaDeg: 1, centerMovedM: 0.2 })).toBe(false);
  });
});
