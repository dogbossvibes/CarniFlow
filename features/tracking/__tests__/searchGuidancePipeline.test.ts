// ──────────────────────────────────────────────────────────────────────────
// Fährten-Absuche: End-zu-End-Lokalisierung des Winkel-Pfades (Prod-Bugfix).
//
// Ziel: deterministisch beweisen, WO im Pfad automatische Winkel ankommen oder
// verloren gehen — OHNE Produktiv-Schwellen zu ändern. Der Pfad wird durch die
// ECHTEN Bausteine getrieben:
//   detectAutoCorner  → Marker-Erzeugung (wie commitMarker) → Tracking-Store
//   → JSON-Snapshot → restoreSearchSession → laidMarkers
//   → Map-Marker-Aufbereitung (angleMarkerKind/ANGLE_SHORT, wie TrackingMap)
//   → Guidance-Angles/-Objects (wie run.tsx) → Voice/Haptik-Auswahl
//   (forwardDistanceFromDog — dieselbe Distanzlogik für beide).
//
// Es werden KEINE künstlichen Winkel kurz vor Renderer/Guidance eingespeist:
// die angleKind stammen aus echter Detection, die Marker laufen durch den echten
// Store-Restore-Zyklus.
// ──────────────────────────────────────────────────────────────────────────

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { detectAutoCorner, type AutoCornerPoint } from '@/features/tracking/utils/autoCornerDetection';
import { useTrackingStore, type MarkerSample, type AngleKind } from '@/features/tracking/store/trackingStore';
import type { PendingTrack } from '@/features/tracking/store/trackPersist';
import { angleMarkerKind, ANGLE_SHORT } from '@/features/tracking/utils/angleClassify';
import { forwardDistanceFromDog } from '@/features/tracking/utils/searchGeometry';

// ── Fixture-Helfer (identisch zur autoCornerDetection-Suite) ────────────────
const METERS_PER_DEGREE = 111_320;
function points(coords: readonly (readonly [number, number])[], accuracy = 5): AutoCornerPoint[] {
  let cumDist = 0;
  return coords.map(([x, y], index) => {
    if (index > 0) { const [px, py] = coords[index - 1]; cumDist += Math.hypot(x - px, y - py); }
    return { lat: y / METERS_PER_DEGREE, lng: x / METERS_PER_DEGREE, cumDist, accuracy };
  });
}
const RAD = Math.PI / 180;
function twoLeg(inHeadingDeg: number, outHeadingDeg: number, legM = 10, stepM = 2): (readonly [number, number])[] {
  const inR = inHeadingDeg * RAD, outR = outHeadingDeg * RAD;
  const coords: (readonly [number, number])[] = [];
  for (let d = legM; d >= 0; d -= stepM) coords.push([-Math.sin(inR) * d, -Math.cos(inR) * d]);
  for (let e = stepM; e <= legM; e += stepM) coords.push([Math.sin(outR) * e, Math.cos(outR) * e]);
  return coords;
}
function corner(interiorDeg: number, dir: 'rechts' | 'links', legM = 10, stepM = 2) {
  const turn = 180 - interiorDeg;
  const out = dir === 'rechts' ? turn : (360 - turn) % 360;
  return twoLeg(0, out, legM, stepM);
}

// Marker exakt so bauen, wie der Recorder es tut (commitMarker/auto-Pfad):
function angleMarker(id: string, kind: AngleKind, apex: AutoCornerPoint, arcM: number): MarkerSample {
  return {
    id, type: 'winkel', material: null, angleKind: kind,
    lat: apex.lat, lng: apex.lng, accuracy: apex.accuracy,
    distance_from_start: arcM, note: null, audio_url: null, found: false, t: 1,
  } as MarkerSample;
}
function objectMarker(id: string, arcM: number, material: MarkerSample['material'] = null): MarkerSample {
  return {
    id, type: 'gegenstand', material, angleKind: null,
    lat: 1, lng: 1, accuracy: 5,
    distance_from_start: arcM, note: null, audio_url: null, found: false, t: 1,
  } as MarkerSample;
}

// Realistische Testfährte: Start → 90° rechts → G1 → Spitzwinkel links → G2 → 90° links → Ende.
// KINDS aus echter Detection; die Bogenlängen bilden die Reihenfolge auf der Fährte ab.
function detectKind(interiorDeg: number, dir: 'rechts' | 'links') {
  return detectAutoCorner(points(corner(interiorDeg, dir)), -Infinity);
}

describe('Absuche-Pipeline — Detection (Stufe 1)', () => {
  it('erzeugt exakt rechts / spitz_links / links mit gültigem Apex', () => {
    const c1 = detectKind(90, 'rechts');
    const c2 = detectKind(45, 'links');
    const c3 = detectKind(90, 'links');
    for (const c of [c1, c2, c3]) {
      expect(c).not.toBeNull();
      expect(typeof c!.apex.lat).toBe('number');
      expect(typeof c!.apex.lng).toBe('number');
      expect(Number.isFinite(c!.apex.cumDist)).toBe(true);
    }
    expect(c1!.kind).toBe('rechts');
    expect(c2!.kind).toBe('spitz_links');
    expect(c3!.kind).toBe('links');
  });
});

// Gemeinsame Fixture-Marker für Store/Map/Voice-Stufen.
function buildFixtureMarkers(): MarkerSample[] {
  const a1 = detectKind(90, 'rechts')!;
  const a2 = detectKind(45, 'links')!;
  const a3 = detectKind(90, 'links')!;
  return [
    angleMarker('w-rechts', a1.kind, a1.apex, 8),
    objectMarker('g1', 14),
    angleMarker('w-spitzL', a2.kind, a2.apex, 20),
    objectMarker('g2', 26, 'duebel'),
    angleMarker('w-links', a3.kind, a3.apex, 32),
  ];
}

describe('Absuche-Pipeline — Store → Snapshot → Restore (Stufen 2–4)', () => {
  beforeEach(() => useTrackingStore.getState().reset());

  it('addMarker → JSON-Snapshot → restoreSearchSession erhält type/angleKind/distance_from_start', () => {
    const markers = buildFixtureMarkers();
    // Stufe 2 — Store: über die echte addMarker-Action ablegen.
    markers.forEach(m => useTrackingStore.getState().addMarker(m));
    expect(useTrackingStore.getState().markers).toHaveLength(5);

    // Stufe 3 — Pending-Snapshot (JSON-Serialisierung wie AsyncStorage-Puffer).
    const pending = JSON.parse(JSON.stringify({
      sessionId: 's1', dogId: 'd1', trackPoints: [], markers: useTrackingStore.getState().markers,
      runPoints: [], distanceMeters: 0, durationSeconds: 0, layFinishedAt: null, startAnchor: null,
      savedAt: 0, status: 'searching',
    })) as PendingTrack;

    // Stufe 4 — Restore in einen frischen Store (echte Recovery-Action).
    useTrackingStore.getState().reset();
    useTrackingStore.getState().restoreSearchSession(pending);
    const restored = useTrackingStore.getState().markers;

    const angles = restored.filter(m => m.type === 'winkel');
    expect(angles.map(a => a.angleKind).sort()).toEqual(['links', 'rechts', 'spitz_links']);
    for (const a of angles) {
      expect(a.type).toBe('winkel');
      expect(a.angleKind).not.toBeNull();          // angleKind geht NIE verloren
      expect(Number.isFinite(a.distance_from_start)).toBe(true);
      expect(a.lat).not.toBeNull();
      expect(a.lng).not.toBeNull();
    }
    // Bogenlängen bleiben identisch (order-korrekt, keine Neuberechnung).
    expect(restored.find(m => m.id === 'w-rechts')!.distance_from_start).toBe(8);
    expect(restored.find(m => m.id === 'w-spitzL')!.distance_from_start).toBe(20);
    expect(restored.find(m => m.id === 'w-links')!.distance_from_start).toBe(32);
  });
});

// Map-Aufbereitung exakt wie run.tsx + TrackingMap.
function mapMarkerKinds(laidMarkers: MarkerSample[]) {
  return laidMarkers
    .filter(m => m.lat != null && m.lng != null)
    .map(m => {
      if (m.type === 'winkel') {
        const ak = angleMarkerKind(m.angleKind);
        return ak === 'angle'
          ? { render: 'angle', label: (m.angleKind && ANGLE_SHORT[m.angleKind]) || '∠' }
          : { render: ak };
      }
      if (m.type === 'gegenstand') return { render: m.material === 'duebel' ? 'cylinder' : 'object' };
      return { render: 'dot' };
    });
}

describe('Absuche-Pipeline — Map-Renderer (Stufe 5)', () => {
  it('automatische Winkel werden NICHT herausgefiltert und korrekt gerendert', () => {
    const rendered = mapMarkerKinds(buildFixtureMarkers());
    expect(rendered).toEqual([
      { render: 'angle', label: '90 R' },
      { render: 'object' },
      { render: 'angle', label: 'SL' },
      { render: 'cylinder' },           // Dübel
      { render: 'angle', label: '90 L' },
    ]);
  });

  it('manuelle Winkeltypen GW/OW/BW/Abriss bleiben eigene Darstellungen (Legacy-sicher)', () => {
    const legacy: MarkerSample[] = (['gw', 'ow', 'bw', 'abriss', 'spitz'] as AngleKind[]).map((k, i) =>
      angleMarker(`m-${k}`, k, { lat: 1, lng: 1, cumDist: i, accuracy: 5 }, i));
    // + ein Marker OHNE angleKind (fehlertoleranter Fallback → generischer Winkel)
    legacy.push({ ...angleMarker('m-null', 'links', { lat: 1, lng: 1, cumDist: 9, accuracy: 5 }, 9), angleKind: null });
    const rendered = mapMarkerKinds(legacy);
    expect(rendered.map(r => r.render)).toEqual(['gw', 'ow', 'bw', 'abriss', 'angle', 'angle']);
  });
});

// Voice/Haptik nutzen DIESELBE Event-Distanz (forwardDistanceFromDog). Mirror der
// Auswahl-Kernlogik beider Hooks (nächstes noch nicht angesagtes Event VOR dem Hund
// in Reichweite), deterministisch über einen dogProgress-Sweep.
type Ev = { id: string; arcM: number; group: 'angle' | 'object' };
function guidanceEvents(laidMarkers: MarkerSample[]): Ev[] {
  return [
    ...laidMarkers.filter(m => m.type === 'winkel').map(m => ({ id: m.id, arcM: m.distance_from_start, group: 'angle' as const })),
    ...laidMarkers.filter(m => m.type === 'gegenstand').map(m => ({ id: m.id, arcM: m.distance_from_start, group: 'object' as const })),
  ];
}
function simulateGuidance(events: Ev[], aheadM: number, sweepEndM = 40): { order: string[]; pulses: Record<string, number> } {
  const spoken = new Set<string>();
  const order: string[] = [];
  const pulses: Record<string, number> = {};
  for (let dog = 0; dog <= sweepEndM; dog += 1) {
    let best: Ev | null = null, bestD = Infinity;
    for (const e of events) {
      if (spoken.has(e.id)) continue;
      const d = forwardDistanceFromDog(e.arcM, dog);
      if (d != null && d < bestD) { bestD = d; best = e; }
    }
    if (best && bestD <= aheadM) {
      spoken.add(best.id);
      order.push(best.id);
      pulses[best.id] = best.group === 'angle' ? 2 : 1;   // Winkel 2×, Gegenstand 1×
    }
  }
  return { order, pulses };
}

describe('Absuche-Pipeline — Voice/Haptik-Reihenfolge (Stufen 6, identische Distanzlogik)', () => {
  it('kündigt in korrekter Reihenfolge an: Winkel R → G1 → Spitz L → G2 → Winkel L', () => {
    const { order, pulses } = simulateGuidance(guidanceEvents(buildFixtureMarkers()), 6);
    expect(order).toEqual(['w-rechts', 'g1', 'w-spitzL', 'g2', 'w-links']);
    // kein Event doppelt, keiner fehlt
    expect(new Set(order).size).toBe(5);
    // Haptik: Winkel = 2 Impulse, Gegenstand = 1 Impuls (dieselbe Eventauswahl)
    expect(pulses['w-rechts']).toBe(2);
    expect(pulses['w-spitzL']).toBe(2);
    expect(pulses['w-links']).toBe(2);
    expect(pulses['g1']).toBe(1);
    expect(pulses['g2']).toBe(1);
  });

  it('1/5/10-m-Versatz ändert nur den Zeitpunkt, nicht Typ/Reihenfolge der Events', () => {
    // dogProgress = handlerProgress + Abstand; die Eventreihenfolge bleibt gleich.
    const evs = guidanceEvents(buildFixtureMarkers());
    const base = simulateGuidance(evs, 6).order;
    for (const ahead of [1, 5, 10]) {
      // größerer Vorschau-Radius (früher), aber gleiche Reihenfolge/Typen
      expect(simulateGuidance(evs, 6 + ahead).order).toEqual(base);
    }
  });
});

describe('Absuche-Pipeline — Confidence statt hartem Accuracy-Gate', () => {
  // NEUE Logik: eine klare 90°-Geometrie wird bei JEDER Accuracy-Marke erkannt —
  // die GPS-Genauigkeit allein vetot einen sauberen Winkel nicht mehr (früher
  // hartes MAX_ANGLE_ACCURACY_M=20). Schutz gegen schlechtes GPS ist die Geometrie.
  for (const acc of [3, 5, 10, 15, 19, 21, 25, 30]) {
    it(`saubere 90°-Ecke @ ${acc} m Accuracy-Marke → weiterhin erkannt`, () => {
      expect(detectAutoCorner(points(corner(90, 'rechts'), acc), -Infinity)?.kind).toBe('rechts');
    });
  }
  it('erst geometrisches GPS-Rauschen (nicht die Accuracy-Marke) verhindert Erkennung', () => {
    // Starkes Positions-Zittern → Schenkel nicht mehr gerade → kein Accept.
    const noisy = corner(90, 'rechts', 10, 2).map(([x, y], i) => [x + (i % 2 ? -2.2 : 2.4), y + (i % 3 ? 1.8 : -2.0)] as const);
    expect(detectAutoCorner(points(noisy, 25), -Infinity)).toBeNull();
  });
});

describe('Absuche-Pipeline — STRAIGHTNESS-MATRIX (T-45 bleibt korrekt)', () => {
  const S = (amp: number, period: number, n = 15) =>
    Array.from({ length: n }, (_, i) => { const y = i * 2; return [amp * Math.sin(Math.PI * y / period), y] as const; });
  it('A) echte stabile 90°-Ecke → erkannt', () => {
    expect(detectAutoCorner(points(corner(90, 'rechts')), -Infinity)?.kind).toBe('rechts');
  });
  it('B) echte stabile Spitzwinkel-Ecke → erkannt', () => {
    expect(detectAutoCorner(points(corner(45, 'links')), -Infinity)?.kind).toBe('spitz_links');
  });
  it('C) sanfte S-Kurve → NICHT erkannt', () => {
    expect(detectAutoCorner(points(S(2, 20, 21)), -Infinity)).toBeNull();
  });
  it('D) Schlangenlinie → NICHT erkannt', () => {
    expect(detectAutoCorner(points(S(3, 8, 13)), -Infinity)).toBeNull();
  });
  it('E) GPS-Zickzack auf Gerade → NICHT erkannt', () => {
    expect(detectAutoCorner(points([[0, 0], [0.25, 2], [-0.2, 4], [0.18, 6], [-0.15, 8], [0.2, 10], [-0.18, 12]]), -Infinity)).toBeNull();
  });
});
