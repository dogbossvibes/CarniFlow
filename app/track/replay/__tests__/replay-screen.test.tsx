// Echte Render-/Interaction-Tests für den Track-Replay-Screen (Punkt 22 —
// bewusst NICHT nur String-Assertions wie beim map-lastigen [id].tsx-Screen,
// da hier die eigentliche Interaktionslogik (Play/Pause/Heatmap/Segment-Tap)
// reines React ist und sich unabhängig von react-native-maps testen lässt.
//
// Die Jest-Testumgebung erkennt keine Gerätesprache → i18n rendert Englisch
// (fallbackLng-Kette, per Debug-Render verifiziert) — Assertions nutzen daher
// bewusst die englischen Strings aus i18n/locales/en.ts.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import TrackReplayScreen from '@/app/track/replay/[id]';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'sess-1' }),
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

let mockData: any = null;
jest.mock('@/features/tracking/services/trackService', () => ({
  getTrackSessionById: jest.fn(async () => ({ data: null, error: null })),
}));
jest.mock('@/features/tracking/services/trackHistoryService', () => ({
  getLocalTrackDetail: jest.fn(async () => mockData),
  getLocalRunSupplement: jest.fn(async () => null),
}));

const M_PER_DEG = 111320;
function toLL(xEastM: number, yNorthM: number) { return { latitude: yNorthM / M_PER_DEG, longitude: xEastM / M_PER_DEG }; }

function buildSegments() {
  return [
    { id: 's0', index: 0, type: 'start', startDistanceM: 0, endDistanceM: 5, lengthM: 5, startTimeSec: 0, endTimeSec: 4, durationSec: 4, meanDeviationM: 0.3, medianDeviationM: 0.3, p95DeviationM: 0.3, maxDeviationM: 0.3, timeWithinM15S: 4, timeWithinM2S: 4, timeOutsideM3S: 0, timeOutsideM5S: 0, averageSpeedMps: 1.2, speedConsistency: 0.9, analysisConfidence: 0.95, analysisConfidenceBand: 'excellent', score: 95 },
    { id: 's1', index: 1, type: 'straight', startDistanceM: 5, endDistanceM: 30, lengthM: 25, startTimeSec: 4, endTimeSec: 24, durationSec: 20, meanDeviationM: 0.8, medianDeviationM: 0.8, p95DeviationM: 1.2, maxDeviationM: 1.5, timeWithinM15S: 20, timeWithinM2S: 20, timeOutsideM3S: 0, timeOutsideM5S: 0, averageSpeedMps: 1.1, speedConsistency: 0.85, analysisConfidence: 0.9, analysisConfidenceBand: 'excellent', score: 85 },
    { id: 's2', index: 2, type: 'corner', startDistanceM: 30, endDistanceM: 45, lengthM: 15, startTimeSec: 24, endTimeSec: 36, durationSec: 12, meanDeviationM: 1.5, medianDeviationM: 1.5, p95DeviationM: 2.5, maxDeviationM: 3.2, timeWithinM15S: 6, timeWithinM2S: 10, timeOutsideM3S: 2, timeOutsideM5S: 0, averageSpeedMps: 0.9, speedConsistency: 0.7, analysisConfidence: 0.88, analysisConfidenceBand: 'good', score: 70, cornerIndex: 0 },
    { id: 's3', index: 3, type: 'finish', startDistanceM: 45, endDistanceM: 50, lengthM: 5, startTimeSec: 36, endTimeSec: 40, durationSec: 4, meanDeviationM: 0.4, medianDeviationM: 0.4, p95DeviationM: 0.4, maxDeviationM: 0.4, timeWithinM15S: 4, timeWithinM2S: 4, timeOutsideM3S: 0, timeOutsideM5S: 0, averageSpeedMps: 1.0, speedConsistency: 0.9, analysisConfidence: 0.95, analysisConfidenceBand: 'excellent', score: 92 },
  ];
}

function buildAnalyticsV2() {
  return {
    analyticsVersion: 2,
    analysisConfidence: 0.9, analysisConfidenceBand: 'excellent', analysisConfidenceHint: null,
    deviation: { meanM: 0.8, medianM: 0.7, p95M: 1.8, maxReliableM: 3.2, maxRawM: 3.2, timeWithinM15S: 30, timeWithinM2S: 34, timeOutsideM3S: 2, timeOutsideM5S: 0 },
    corners: [{ atM: 30, side: 'rechts', sharpness: 'rechtwinklig', arrivalTSec: 24, speedBeforeMps: 1.0, minDistanceM: 1.0, maxLateralDeviationM: 3.2, overshootM: 2.1, reacquisitionSec: 4.6 }],
    objects: [], reacquisition: { count: 0, completedCount: 0, meanSec: null, maxSec: null, medianSec: null },
    pace: { avgMps: 1.05, medianMps: 1.05, consistency: 0.85 },
    trackScore: 85,
    segments: buildSegments(),
    segmentHighlights: [
      { labelKey: 'track.segments.highlights.lowestDeviation', segmentId: 's0', segmentIndex: 0, valueText: '0.3 m' },
      { labelKey: 'track.segments.highlights.highestDeviation', segmentId: 's2', segmentIndex: 2, valueText: '3.2 m' },
    ],
  };
}

function trackWithReplay() {
  const layRaw = [toLL(0, 0), toLL(0, 25), toLL(0, 50)];
  const runPoints = [
    { lat: layRaw[0].latitude, lng: layRaw[0].longitude, t: 0 },
    { lat: layRaw[1].latitude, lng: layRaw[1].longitude, t: 20 },
    { lat: layRaw[2].latitude, lng: layRaw[2].longitude, t: 40 },
  ];
  return {
    id: 'sess-1', dog: null, session_date: '2026-09-01',
    points: layRaw.map(p => ({ latitude: p.latitude, longitude: p.longitude, point_type: 'lay' })),
    markers: [],
    runs: [{ run_points: runPoints }],
    track_data: { run: { analytics: buildAnalyticsV2() } },
  };
}

function trackWithoutReplay() {
  return {
    id: 'sess-old', dog: null, session_date: '2025-01-01',
    points: [], markers: [], runs: [], track_data: {},
  };
}

let renderer: ReactTestRenderer | null = null;
async function mount() {
  await act(async () => {
    renderer = TestRenderer.create(<TrackReplayScreen />);
    await new Promise(r => setTimeout(r, 20));
  });
  return renderer!;
}

// react-test-renderer's TS-Typen decken .findAll(predicate)/.parent nicht
// vollständig ab, obwohl beide zur Laufzeit existieren (Babel-basierter Jest
// stört sich nicht daran) — dasselbe bekannte Auseinanderklaffen wie bei den
// bestehenden findAllByType/findAllByProps-Casts in HoldToStopButton.test.tsx.
// Gleiches Muster: lokal nachtypisiert statt @ts-ignore.
interface TestNode { type: unknown; props: Record<string, any>; parent: TestNode | null; findAll: (pred: (n: TestNode) => boolean) => TestNode[] }
function asTestNode(root: ReactTestRenderer): TestNode { return root.root as unknown as TestNode; }

function textNodesWith(root: ReactTestRenderer, text: string): TestNode[] {
  return asTestNode(root).findAll(n => n.type === 'Text' && (
    n.props.children === text
    || (Array.isArray(n.props.children) && n.props.children.join('') === text)
  ));
}
// Findet den nächstgelegenen Pressable-Vorfahren eines Text-Knotens (die
// erste Instanz mit einer eigenen onPress-Prop — das ist die äusserste
// Pressable-Komponente selbst, react-test-renderer liefert für ein einziges
// JSX-Pressable-Element mehrere verschachtelte Fiber-Instanzen).
function pressableAncestor(node: TestNode): TestNode {
  let cur: TestNode | null = node;
  while (cur) {
    if (typeof cur.props?.onPress === 'function') return cur;
    cur = cur.parent;
  }
  throw new Error('no pressable ancestor found');
}

describe('TrackReplayScreen — Rendering & Interaktion (Punkt 22)', () => {
  afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; mockData = null; jest.clearAllMocks(); });

  it('alte Fährte ohne Replay-Daten (Punkt 18/21) → "not available", kein Crash', async () => {
    mockData = trackWithoutReplay();
    const root = await mount();
    expect(textNodesWith(root, "Replay isn't available for this track.").length).toBeGreaterThan(0);
  });

  it('Replay öffnet mit gültigen Daten: Play-Button ist vorhanden', async () => {
    mockData = trackWithReplay();
    const root = await mount();
    expect(asTestNode(root).findAll(n => n.props?.accessibilityLabel === 'Start replay').length).toBeGreaterThan(0);
  });

  it('Play/Pause: Tippen wechselt das accessibilityLabel von Start auf Pause und zurück (Resume)', async () => {
    mockData = trackWithReplay();
    const root = await mount();
    const playBtn = asTestNode(root).findAll(n => n.props?.accessibilityLabel === 'Start replay')[0];
    await act(async () => { playBtn.props.onPress(); });
    expect(asTestNode(root).findAll(n => n.props?.accessibilityLabel === 'Pause replay').length).toBeGreaterThan(0);

    const pauseBtn = asTestNode(root).findAll(n => n.props?.accessibilityLabel === 'Pause replay')[0];
    await act(async () => { pauseBtn.props.onPress(); });
    expect(asTestNode(root).findAll(n => n.props?.accessibilityLabel === 'Start replay').length).toBeGreaterThan(0);
  });

  it('2× Speed: Tippen auf den "2×"-Chip löst onPress ohne Crash aus', async () => {
    mockData = trackWithReplay();
    const root = await mount();
    const chip2x = pressableAncestor(textNodesWith(root, '2×')[0]);
    await act(async () => { chip2x.props.onPress(); });
    // Screen bleibt intakt (kein Crash) — die exakte 2×-Zeitrechnung selbst
    // ist bereits in trackReplay.test.ts bewiesen.
    expect(asTestNode(root).findAll(n => n.props?.accessibilityLabel === 'Start replay').length).toBeGreaterThan(0);
  });

  it('Heatmap-Modus wechseln: Tippen auf "Pace" wechselt die Metrik ohne Crash', async () => {
    mockData = trackWithReplay();
    const root = await mount();
    const paceChip = pressableAncestor(textNodesWith(root, 'Pace')[0]);
    await act(async () => { paceChip.props.onPress(); });
    expect(asTestNode(root).findAll(n => n.props?.accessibilityLabel === 'Start replay').length).toBeGreaterThan(0);
  });

  it('Segment antippen (Highlight-Chip) → Detailkarte (Bottom-Sheet) erscheint mit dem korrekten Segmenttitel', async () => {
    mockData = trackWithReplay();
    const root = await mount();
    // Vor dem Tap: kein offenes Bottom-Sheet.
    expect(asTestNode(root).findAll(n => n.type === 'Modal' && n.props.visible === true)).toHaveLength(0);

    // "Highest deviation"-Highlight zeigt auf Segment s2 (Winkel, rechts).
    const highlightValue = textNodesWith(root, '3.2 m')[0];
    const chip = pressableAncestor(highlightValue);
    await act(async () => { chip.props.onPress(); });

    expect(asTestNode(root).findAll(n => n.type === 'Modal' && n.props.visible === true).length).toBeGreaterThan(0);
    // Segmenttitel + kuratierte Detailwerte (Punkt 15) erscheinen tatsächlich.
    expect(textNodesWith(root, 'Corner 1 · right').length).toBeGreaterThan(0);
    expect(textNodesWith(root, 'Overshoot').length).toBeGreaterThan(0);
    expect(textNodesWith(root, '2.1 m').length).toBeGreaterThan(0);
  });

  it('Details-Sheet schliesst sich wieder (onClose/onRequestClose)', async () => {
    mockData = trackWithReplay();
    const root = await mount();
    const chip = pressableAncestor(textNodesWith(root, '3.2 m')[0]);
    await act(async () => { chip.props.onPress(); });
    const modal = asTestNode(root).findAll(n => n.type === 'Modal' && n.props.visible === true)[0];
    expect(modal).toBeDefined();

    await act(async () => { modal.props.onRequestClose(); });
    expect(asTestNode(root).findAll(n => n.type === 'Modal' && n.props.visible === true)).toHaveLength(0);
  });
});
