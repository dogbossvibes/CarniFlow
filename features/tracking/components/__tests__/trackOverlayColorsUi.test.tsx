// Multi-Dog Overlays V2 (UI): Halo + Hundefarbe je Linie, farbiges Namens-Badge, Legende
// im bestehenden Chip „Andere Fährten · n" (Farbe UND Name), Hook liefert Farbe je dogId
// ohne Netzwerk (Hunde kommen aus den bereits geladenen Daten).
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: (p: { color?: string; name?: string }) => null }));
jest.mock('@/features/tracking/utils/haptics', () => ({ hapticTap: jest.fn() }));
jest.mock('@/i18n', () => ({
  useT: () => ({ t: (k: string, p?: Record<string, unknown>) => (k === 'track.otherTracks.chip' ? `Andere Fährten · ${p?.count}` : k) }),
}));
jest.mock('@/components/ui/AnyvoBottomSheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { AnyvoBottomSheet: ({ visible, children }: any) => (visible ? <View testID="sheet">{children}</View> : null) };
});
// Kein Netzwerk: Dogs-Dienst / Supabase dürfen von Overlays nie angefasst werden.
const mockNetwork = jest.fn();
jest.mock('@/services/dogs', () => new Proxy({}, { get: () => (...a: unknown[]) => { mockNetwork(...a); throw new Error('network'); } }));
jest.mock('@/lib/supabase', () => new Proxy({}, { get: () => { mockNetwork('supabase'); throw new Error('network'); } }));
const mockLoad = jest.fn();
jest.mock('@/features/tracking/services/trackReferenceOverlayService', () => ({ loadActiveTrackOverlays: (...a: unknown[]) => mockLoad(...a) }));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import { TrackReferenceOverlayLayer, REFERENCE_TRACK_HALO, referenceTrackStroke } from '@/features/tracking/components/TrackReferenceOverlayLayer';
import { TrackReferenceOverlayControl, LEGEND_MAX_ITEMS } from '@/features/tracking/components/TrackReferenceOverlayControl';
import { useActiveTrackOverlays, type UseActiveTrackOverlaysArgs } from '@/features/tracking/hooks/useActiveTrackOverlays';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import type { TrackReferenceCandidate, TrackReferenceOverlay } from '@/features/tracking/store/trackReferenceOverlays';
import { autoTrackOverlayColorKey, trackOverlayColor, type TrackOverlayColorKey } from '@/features/tracking/utils/trackOverlayColors';
/* eslint-enable import/first */

type Node = any;
const pts = (lat0: number) => [0, 1, 2].map(i => ({ lat: lat0 + i * 1e-4, lng: 8 }));
const ov = (dogId: string, dogName: string, colorKey: TrackOverlayColorKey, sessionId = `s-${dogId}`): TrackReferenceOverlay =>
  ({ dogId, dogName, sessionId, colorKey, status: 'resting', points: pts(47) });
const MALU = ov('malu', 'Malu', 'orange');
const SKADI = ov('skadi', 'Skadi', 'violet');
const BEN = ov('ben', 'Ben', 'pink');

function FakePolyline(_p: Record<string, unknown>) { return null; }
function FakeMarker({ children }: { children?: React.ReactNode }) { return <>{children}</>; }
const renderLayer = (overlays: TrackReferenceOverlay[]) => {
  let r: Node;
  act(() => { r = TestRenderer.create(<TrackReferenceOverlayLayer overlays={overlays} Polyline={FakePolyline} Marker={FakeMarker} />); });
  return r;
};
const textOf = (n: Node) => n.findAllByType(Text).map((t: Node) => [].concat(t.props.children).join(''));

describe('Kartenebene: Halo + Hundefarbe + Namens-Badge', () => {
  it('zwei Hunde: je Halo darunter + Linie in SEINER Farbe, je ein Label mit Name und Farbpunkt', () => {
    const r = renderLayer([MALU, SKADI]);
    const lines = r.root.findAllByType(FakePolyline).map((p: Node) => p.props);
    expect(lines.map((l: any) => l.strokeColor)).toEqual([
      REFERENCE_TRACK_HALO.strokeColor, referenceTrackStroke('orange').strokeColor,
      REFERENCE_TRACK_HALO.strokeColor, referenceTrackStroke('violet').strokeColor,
    ]);
    const labels = r.root.findAll((n: Node) => n.props.testID === 'reference-start-label' && typeof n.type === 'string');
    expect(labels).toHaveLength(2);
    expect(labels.map((l: Node) => textOf(l)[0])).toEqual(['Malu', 'Skadi']);
    const dotColor = (l: Node) => StyleSheet.flatten(l.findAll((n: Node) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.borderRadius === 4)[0].props.style).backgroundColor;
    expect(labels.map(dotColor)).toEqual([trackOverlayColor('orange'), trackOverlayColor('violet')]);
    act(() => r.unmount());
  });
  it('drei Hunde → drei Linien + drei Labels; fehlender Name → „?" statt fremdem Namen', () => {
    const r = renderLayer([MALU, SKADI, { ...BEN, dogName: '' }]);
    expect(r.root.findAllByType(FakePolyline)).toHaveLength(6);
    const labels = r.root.findAll((n: Node) => n.props.testID === 'reference-start-label' && typeof n.type === 'string');
    expect(labels.map((l: Node) => textOf(l)[0])).toEqual(['Malu', 'Skadi', '?']);
    act(() => r.unmount());
  });
});

describe('Legende im Chip „Andere Fährten · n"', () => {
  const renderControl = (overlays: TrackReferenceOverlay[], visible = true) => {
    let r: Node;
    act(() => { r = TestRenderer.create(<TrackReferenceOverlayControl overlays={overlays} visible={visible} onVisibleChange={jest.fn()} />); });
    return r;
  };
  const legendOf = (r: Node) => r.root.findAll((n: Node) => n.props.testID === 'reference-overlay-legend' && typeof n.type === 'string')[0];
  it('zwei Hunde: Name + Farbpunkt je Hund in Overlay-Reihenfolge; Chip-A11y nennt die Namen', () => {
    const r = renderControl([MALU, SKADI]);
    const legend = legendOf(r);
    expect(textOf(legend)).toEqual(['Malu', 'Skadi']);
    const dots = legend.findAll((n: Node) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.width === 8)
      .map((n: Node) => StyleSheet.flatten(n.props.style).backgroundColor);
    expect(dots).toEqual([trackOverlayColor('orange'), trackOverlayColor('violet')]);
    const chip = r.root.findAll((n: Node) => n.props.testID === 'reference-overlay-chip')[0];
    expect(chip.props.accessibilityLabel).toBe('Andere Fährten · 2: Malu, Skadi');
    act(() => r.unmount());
  });
  it(`viele Hunde → höchstens ${LEGEND_MAX_ITEMS} Einträge + „+N"; Tap öffnet weiterhin das Sheet (bestehende Funktion)`, () => {
    const many = [MALU, SKADI, BEN, ov('a', 'Ares', 'yellow'), ov('b', 'Bella', 'blue')];
    const r = renderControl(many);
    expect(textOf(legendOf(r))).toEqual(['Malu', 'Skadi', 'Ben', '+2']);
    act(() => { r.root.findAll((n: Node) => n.props.testID === 'reference-overlay-chip')[0].props.onPress(); });
    expect(r.root.findAll((n: Node) => n.props.testID === 'sheet').length).toBeGreaterThan(0);
    act(() => r.unmount());
  });
  it('ausgeblendete Referenzen → Legende gedimmt (bleibt lesbar), nichts entfernt', () => {
    const r = renderControl([MALU, SKADI], false);
    expect(StyleSheet.flatten(legendOf(r).props.style).opacity).toBeLessThan(1);
    expect(textOf(legendOf(r))).toEqual(['Malu', 'Skadi']);
    act(() => r.unmount());
  });
});

describe('Hook: Farbe je dogId aus den geladenen Hunden — offline, ohne Netzwerk', () => {
  const USER = 'user-1';
  let latest: TrackReferenceOverlay[] = [];
  function Probe(p: UseActiveTrackOverlaysArgs) { latest = useActiveTrackOverlays(p); return null; }
  const toOverlay = (c: TrackReferenceCandidate): TrackReferenceOverlay =>
    ({ dogId: c.dogId, sessionId: c.sessionId, dogName: c.dogName, colorKey: c.colorKey, status: c.status, points: pts(47) });
  beforeEach(() => {
    mockLoad.mockReset(); mockNetwork.mockReset();
    mockLoad.mockImplementation(async (cands: TrackReferenceCandidate[]) => cands.map(toOverlay));
    useActiveFaehrten.setState({ byDog: {}, hydrated: true });
    for (const d of ['yam', 'malu', 'skadi', 'gone']) useActiveFaehrten.getState().upsert(d, { status: 'resting', sessionId: `s-${d}`, startedAt: 1, layStartedAt: 2 });
  });
  const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
  it('Yam aktuell → Malu orange, Skadi Fallback; gelöschter Hund (nicht mehr in den Hunden) fail-safe ausgeblendet; kein Netzwerk', async () => {
    const dogs = [
      { id: 'yam', name: 'Yam', owner_id: USER, track_overlay_color_key: 'pink' },
      { id: 'malu', name: 'Malu', owner_id: USER, track_overlay_color_key: 'orange' },
      { id: 'skadi', name: 'Skadi', owner_id: USER, track_overlay_color_key: null },
    ];
    let r: Node;
    await act(async () => { r = TestRenderer.create(<Probe userId={USER} currentUserDogs={dogs} currentDogId="yam" currentSessionId={null} />); });
    await flush();
    expect(latest.map(o => [o.dogId, o.dogName, o.colorKey])).toEqual([
      ['malu', 'Malu', 'orange'], ['skadi', 'Skadi', autoTrackOverlayColorKey('skadi')],
    ]);
    expect(mockNetwork).not.toHaveBeenCalled();
    // Farbwechsel im Profil (neue Hunde-Daten) → Overlay übernimmt die neue Farbe
    const dogs2 = dogs.map(d => (d.id === 'malu' ? { ...d, track_overlay_color_key: 'blue' } : d));
    await act(async () => { r.update(<Probe userId={USER} currentUserDogs={dogs2} currentDogId="yam" currentSessionId={null} />); });
    await flush();
    expect(latest.find(o => o.dogId === 'malu')?.colorKey).toBe('blue');
    expect(mockNetwork).not.toHaveBeenCalled();
    act(() => r.unmount());
  });
});
