// Root-Cause-Regressionstest (Feldtest B, CURRENT + EXPO): "Fährtenansatz
// erkannt, Timer läuft, GPS ±5–6 m sehr gut, Karten-Puck wandert — Suchdistanz
// bleibt exakt 0 m, keine Suchlinie, Abweichung —".
//
// Ursache: der Watch-Effect in useSearchRecorder hing an `[onFix]`. `onFix`
// ist ein useCallback über laidPoints/laidObjects/arc — bekommt der Hook diese
// Props mit NEUER Identität pro Render (exakt das run.tsx-Muster
// `snap ?? { laidPoints: [], laidObjects: [], … }`, solange der Snapshot noch
// nicht gesetzt ist), wurde die Positionsquelle bei JEDEM Render abgemeldet
// und neu abonniert; setGpsDebug/setReady lösten das nächste Render aus →
// Endlosschleife. Es wurde nie ein Fix verarbeitet (pts/distRef blieben leer),
// während der native Karten-User-Location-Punkt (TrackingMap
// showUserLocation, unabhängig von dieser Pipeline) weiter wanderte.
//
// Zusätzlich prüft dieser Test die QA-Diagnose (searchFixDiag): pro Fix genau
// EIN Endstatus, plus die Zählung ACCEPTED / REJECT_* / BLOCK_* / SKIP_*.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng } from '@/features/tracking/hooks/useSearchRecorder';
import type { SearchFixDiag, SearchFixStatus } from '@/features/tracking/utils/searchFixDiag';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Accuracy: { BestForNavigation: 6 },
}));

let feedSample: ((s: any) => void) | null = null;
let mockSourceStartCount = 0;
jest.mock('@/features/tracking/utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({
    coords: {
      latitude: s.lat, longitude: s.lng, accuracy: s.accuracy ?? null, altitude: null,
      altitudeAccuracy: null, heading: null, speed: s.speed ?? null,
    },
    timestamp: s.t,
  }),
  startPositionSource: jest.fn(async (cb: any) => {
    mockSourceStartCount++;
    feedSample = cb;
    return { stop: jest.fn(), info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo', provider: 'expo-location-legacy' } };
  }),
}));

jest.mock('@/features/tracking/store/trackingStore', () => ({
  useTrackingStore: { getState: () => ({ addSearchPoint: jest.fn(), resetSearchPoints: jest.fn() }) },
}));
jest.mock('@/features/tracking/store/searchPersist', () => ({
  enqueueSearchPoint: jest.fn(), flushSearchPoints: jest.fn(async () => true), resetSearchBuffer: jest.fn(),
}));
jest.mock('@/features/tracking/native/motionClient', () => ({
  motionClient: {
    isModuleAvailable: () => false, isAvailable: () => false,
    getStatus: jest.fn(async () => ({ deviceMotionAvailable: false, stepCountingAvailable: false, activityAvailable: false, pedometerAuthorized: false, running: false })),
    start: jest.fn(async () => false), stop: jest.fn(async () => {}),
    onSample: () => ({ remove: () => {} }), onError: () => ({ remove: () => {} }),
  },
}));

const M_PER_DEG = 111320;
let renderCount = 0;
const MAX_RENDERS = 300;   // weit über allem, was ein gesunder Mount braucht

// Bildet exakt das run.tsx-Muster nach: solange `snap === null` ist, entsteht
// pro Render ein FRISCHES Fallback-Objekt mit neuen leeren Arrays.
function UnstableHarness({ onReady, onDiag }: { onReady: (s: SearchRecorder) => void; onDiag: (d: SearchFixDiag) => void }) {
  renderCount++;
  if (renderCount > MAX_RENDERS) throw new Error(`RENDER_LOOP: ${renderCount} Renders — Positionsquelle wird endlos neu abonniert`);
  const snap: { laidPoints: LatLng[]; laidObjects: any[] } | null = null;
  const snapData = snap ?? { laidPoints: [], laidObjects: [] };
  const s = useSearchRecorder({
    laidPoints: snapData.laidPoints, laidObjects: snapData.laidObjects,
    level: 'training', handlerDistanceM: 5, onFixDiag: onDiag,
  });
  onReady(s);
  return null;
}

let activeRenderer: ReactTestRenderer | null = null;
let simClockMs = 0;
function feed(accuracy: number, xEastM: number, yNorthM: number) {
  if (!feedSample) throw new Error('positionSource callback not captured');
  simClockMs += 1000;   // ~1 Hz
  // `source` liefert die echte positionSource bei jedem Sample mit (EXPO-Pfad).
  act(() => { feedSample!({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG, accuracy, speed: 1.2, course: null, t: simClockMs, source: 'expo', provider: 'expo-location-legacy' }); });
}

describe('useSearchRecorder — instabile Prop-Identitäten dürfen die Aufnahme nicht blockieren (Feldtest B)', () => {
  beforeEach(() => { feedSample = null; simClockMs = 0; renderCount = 0; mockSourceStartCount = 0; activeRenderer = null; });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); });

  it('START_LOCKED, laufende Aufnahme, plausible Gehstrecke → points wachsen, Distanz > 0, genau ein Diagnose-Status je Fix', async () => {
    const diags: SearchFixDiag[] = [];
    let latest!: SearchRecorder;
    act(() => {
      activeRenderer = TestRenderer.create(
        <UnstableHarness onReady={(s) => { latest = s; }} onDiag={(d) => diags.push(d)} />,
      );
    });
    await act(async () => { await Promise.resolve(); });
    act(() => { latest.start(); });

    expect(latest.recording).toBe(true);
    expect(latest.searchStartState).toBe('START_LOCKED');   // ohne Soll-Fährte sofort gelockt (wie im Video)

    // Die Positionsquelle darf GENAU EINMAL aufgebaut worden sein — vor dem Fix
    // wurde sie bei jedem Render neu abonniert (Endlosschleife).
    expect(mockSourceStartCount).toBe(1);

    // 12 plausible Gehfixe (~2 m/s, GPS ±5–6 m wie im Feldtest).
    let y = 0;
    for (let i = 0; i < 12; i++) { y += 2; feed(i % 2 === 0 ? 5 : 6, 0, y); }

    // Kernaussage: nach wenigen Metern MUSS Linie und Distanz existieren.
    expect(latest.points.length).toBeGreaterThan(1);
    expect(latest.distanceM).toBeGreaterThan(0);

    // Genau ein Endstatus je verarbeitetem Fix, und die Zählung ist plausibel.
    expect(diags.length).toBe(12);
    const count = (st: SearchFixStatus) => diags.filter(d => d.status === st).length;
    expect(count('ACCEPTED')).toBeGreaterThan(1);
    expect(count('REJECT_ACCURACY')).toBe(0);
    expect(count('BLOCK_FUSION_STATIONARY') + count('BLOCK_FUSION_OUTLIER')).toBe(0);
    // Jede Diagnose trägt die geforderten Felder.
    for (const d of diags) {
      expect(d.source).toBe('expo');
      expect(typeof d.pointsBefore).toBe('number');
      expect(typeof d.pointsAfter).toBe('number');
      expect(typeof d.distanceBefore).toBe('number');
      expect(typeof d.distanceAfter).toBe('number');
    }
    console.log('[QA-Zählung] fixes=', diags.length,
      'ACCEPTED=', count('ACCEPTED'),
      'REJECT_ACCURACY=', count('REJECT_ACCURACY'),
      'REJECT_SPEED=', count('REJECT_SPEED'),
      'BLOCK_FUSION_STATIONARY=', count('BLOCK_FUSION_STATIONARY'),
      'BLOCK_FUSION_OUTLIER=', count('BLOCK_FUSION_OUTLIER'),
      'SKIP_MIN_SEGMENT=', count('SKIP_MIN_SEGMENT'),
      '| points=', latest.points.length, 'distanceM=', Math.round(latest.distanceM * 10) / 10);

    // Bei jedem ACCEPTED wächst die Punktzahl um genau 1.
    for (const d of diags.filter(x => x.status === 'ACCEPTED')) {
      expect(d.pointsAfter).toBe(d.pointsBefore + 1);
    }
  });
});
