// Kartensteuerung „Andere Fährten · n": Sichtbarkeit, Zähler, Sheet, Toggle.
// Toggle verändert nur die Sichtbarkeit — keinen Tracking-/Registry-Zustand, keine Session.
import React, { useState } from 'react';
import { Switch, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { TrackReferenceOverlayControl } from '@/features/tracking/components/TrackReferenceOverlayControl';
import type { TrackReferenceOverlay } from '@/features/tracking/store/trackReferenceOverlays';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/features/tracking/utils/haptics', () => ({ hapticTap: jest.fn() }));
jest.mock('@/i18n', () => ({
  useT: () => ({
    t: (k: string, p?: Record<string, unknown>) => (k === 'track.otherTracks.chip' ? `Andere Fährten · ${p?.count}` : k),
  }),
}));
const mockClaimQuota = jest.fn();
jest.mock('@/services/quotaService', () => ({ claimNewbieQuota: (...a: unknown[]) => mockClaimQuota(...a) }));
jest.mock('@/components/ui/AnyvoBottomSheet', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return { AnyvoBottomSheet: ({ visible, children, title }: any) => (visible ? <View testID="sheet" accessibilityLabel={title}>{children}</View> : null) };
});

const ov = (dogId: string, dogName: string, status: TrackReferenceOverlay['status'] = 'resting'): TrackReferenceOverlay =>
  ({ dogId, dogName, sessionId: `sess-${dogId}`, colorKey: 'orange', status, points: [{ lat: 47, lng: 8 }, { lat: 47.001, lng: 8 }] });

type Rendered = any;
let renderer: Rendered = null;
let shown: boolean[] = [];
function Host({ overlays }: { overlays: TrackReferenceOverlay[] }) {
  const [visible, setVisible] = useState(true);   // Default ON (wie legen.tsx)
  shown.push(visible);
  return <TrackReferenceOverlayControl overlays={overlays} visible={visible} onVisibleChange={setVisible} />;
}
const render = (overlays: TrackReferenceOverlay[]) => act(() => { renderer = TestRenderer.create(<Host overlays={overlays} />); });
const texts = () => renderer.root.findAllByType(Text).map((n: any) => [].concat(n.props.children).join(''));
const chip = () => renderer.root.findAll((n: any) => n.props.testID === 'reference-overlay-chip' && typeof n.props.onPress === 'function')[0];

beforeEach(() => { shown = []; mockClaimQuota.mockReset(); });
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; });

describe('TrackReferenceOverlayControl', () => {
  it('keine Overlays → Control unsichtbar', () => {
    render([]);
    expect(renderer.toJSON()).toBeNull();
  });
  it('1 Overlay → „Andere Fährten · 1"', () => {
    render([ov('amoun', 'Amoun')]);
    expect(texts()).toContain('Andere Fährten · 1');
  });
  it('3 Overlays → korrekter Count; Sheet listet Hunde + Status', () => {
    render([ov('amoun', 'Amoun'), ov('doran', 'Doran'), ov('clay', 'Clay', 'searching')]);
    expect(texts()).toContain('Andere Fährten · 3');
    act(() => { chip().props.onPress(); });
    const t = texts();
    expect(t).toEqual(expect.arrayContaining(['Amoun', 'Doran', 'Clay', 'track.statusResting', 'track.statusSearching', 'track.otherTracks.show']));
  });
  it('Default ON; Toggle OFF/ON ändert nur die Sichtbarkeit — kein Tracking-/Registry-Zustand, keine Session', () => {
    const trackingBefore = useTrackingStore.getState();
    const registryBefore = useActiveFaehrten.getState().byDog;
    render([ov('amoun', 'Amoun')]);
    expect(shown[shown.length - 1]).toBe(true);
    act(() => { chip().props.onPress(); });   // Overlay-Tap öffnet nur das Sheet
    const sw = () => renderer.root.findByType(Switch);
    expect(sw().props.value).toBe(true);
    act(() => { sw().props.onValueChange(false); });
    expect(shown[shown.length - 1]).toBe(false);
    expect(sw().props.value).toBe(false);
    act(() => { sw().props.onValueChange(true); });
    expect(shown[shown.length - 1]).toBe(true);
    expect(useTrackingStore.getState()).toBe(trackingBefore);
    expect(useActiveFaehrten.getState().byDog).toBe(registryBefore);
    expect(mockClaimQuota).not.toHaveBeenCalled();
  });
});
