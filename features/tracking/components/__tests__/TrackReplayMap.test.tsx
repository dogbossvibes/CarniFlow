/**
 * Replay-Karte: Referenz (Mint) und gelaufene Absuche (Blau) als vollständige
 * Geometrien, abgespielter Teil als kräftige blaue Überlagerung; Heatmap-Teile
 * unverändert obenauf; Puck = Replay-Position. react-native-maps wird durch
 * inspizierbare Dummy-Komponenten ersetzt (Polyline-Props prüfbar).
 */
import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const MapView = (p: any) => <View testID="map">{p.children}</View>;
const Polyline = (_p: any) => null;
const Marker = (p: any) => <View testID="marker">{p.children}</View>;
jest.mock('@/components/tracking/TrackMap', () => ({
  MAPS_AVAILABLE: true,
  RNMaps: { default: MapView, Polyline, Marker, PROVIDER_DEFAULT: 'default' },
}));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein (wie replay-screen.test.tsx) */
import { TrackReplayMap, SEARCH_ROUTE_FULL_STROKE, SEARCH_ROUTE_PLAYED_STROKE } from '@/features/tracking/components/TrackReplayMap';
import { replayTraveledPoints, replayPositionAt, type ReplayGeometry } from '@/features/tracking/engine/trackReplay';
import { C } from '@/constants/colors';
/* eslint-enable import/first */

const M = 111320;
const ll = (x: number, y: number) => ({ latitude: 47 + y / M, longitude: 8 + x / M });
// Referenz: 0..40 m nach Norden; Absuche: leicht versetzt, 9 Punkte, 0..40 s.
const LAY = Array.from({ length: 21 }, (_, i) => { const p = ll(0, i * 2); return { lat: p.latitude, lng: p.longitude }; });
const RUN: ReplayGeometry = {
  points: Array.from({ length: 9 }, (_, i) => ll(0.6, i * 5)),
  pointsTimeSec: Array.from({ length: 9 }, (_, i) => i * 5),
};
const HEAT = [{ segmentId: 's1', segmentIndex: 0, coordinates: RUN.points.slice(0, 4), color: '#15E6C3', band: 'very_low' as const }];

type PolyProps = { coordinates: { latitude: number; longitude: number }[]; strokeColor: string; strokeWidth: number; zIndex: number };
function polylines(node: ReactTestRenderer): PolyProps[] {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: PolyProps }[] }).findAllByType(Polyline).map(n => n.props);
}
function renderAt(elapsedSec: number) {
  let node!: ReactTestRenderer;
  const played = replayTraveledPoints(RUN, elapsedSec);
  const puck = replayPositionAt(RUN, elapsedSec);
  act(() => {
    node = TestRenderer.create(
      <TrackReplayMap layPoints={LAY} markers={[]} heatmapParts={HEAT} puckPosition={puck} runPoints={RUN.points} playedPoints={played} />,
    );
  });
  return { node, polys: polylines(node), puck };
}
const byColor = (polys: PolyProps[], color: string) => polys.filter(p => p.strokeColor === color);
// Referenz = Mint-Token auf der untersten Ebene. (Das Heatmap-Band „sehr gering"
// nutzt denselben Mint-Wert in Grossschreibung — genau deshalb braucht die
// Absuche die blaue Einfassung.)
const reference = (polys: PolyProps[]) => polys.filter(p => p.zIndex === 1 && p.strokeColor === C.trackPrimary);

describe('TrackReplayMap — Referenz vs. Absuche', () => {
  it('1./4. Referenz immer vollständig, Mint-Token (C.trackPrimary), unterste Ebene', () => {
    for (const t of [0, 20, 40]) {
      const ref = reference(renderAt(t).polys);
      expect(ref).toHaveLength(1);
      expect(ref[0].coordinates).toHaveLength(LAY.length);
      expect(ref[0].zIndex).toBe(1);
    }
  });
  it('2./3. volle Absuche-Route immer vollständig, trackBlue-Unterbau (Alpha), 8 pt', () => {
    for (const t of [0, 20, 40]) {
      const full = byColor(renderAt(t).polys, SEARCH_ROUTE_FULL_STROKE);
      expect(full).toHaveLength(1);
      expect(full[0].coordinates).toHaveLength(RUN.points.length);
      expect(full[0].strokeWidth).toBe(8);
      expect(full[0].zIndex).toBe(2);
    }
    expect(SEARCH_ROUTE_FULL_STROKE.startsWith(C.trackBlue)).toBe(true);
    expect(SEARCH_ROUTE_PLAYED_STROKE).toBe(C.trackBlue);
    expect(C.trackBlue.toLowerCase()).not.toBe(C.trackPrimary.toLowerCase());
  });
  it('5. Replay 0 s: volle Route da, abgespielter Teil nur Start (keine Polyline < 2 Punkte)', () => {
    const { polys } = renderAt(0);
    expect(byColor(polys, SEARCH_ROUTE_FULL_STROKE)[0].coordinates).toHaveLength(9);
    expect(byColor(polys, SEARCH_ROUTE_PLAYED_STROKE)).toHaveLength(0);   // 1 Punkt (+Puck am selben Ort) → nichts zu zeichnen
  });
  it('6. Replay 50 %: volle Route unverändert, abgespielter Teil ≈ bis zur Mitte', () => {
    const { polys } = renderAt(20);
    expect(byColor(polys, SEARCH_ROUTE_FULL_STROKE)[0].coordinates).toHaveLength(9);
    const played = byColor(polys, SEARCH_ROUTE_PLAYED_STROKE);
    expect(played).toHaveLength(1);
    // Punkte bei 0,5,10,15,20 s = 5 Punkte (Puck liegt exakt auf Punkt 5 → angehängt: 6)
    expect(played[0].coordinates.length).toBeGreaterThanOrEqual(5);
    expect(played[0].coordinates.length).toBeLessThanOrEqual(6);
    expect(played[0].zIndex).toBe(3);
  });
  it('7. Replay Ende: abgespielter Teil = komplette Absuche-Route', () => {
    const { polys } = renderAt(40);
    const played = byColor(polys, SEARCH_ROUTE_PLAYED_STROKE)[0];
    const full = byColor(polys, SEARCH_ROUTE_FULL_STROKE)[0];
    expect(played.coordinates).toEqual(full.coordinates);
  });
  it('8. Pfote folgt der Replay-Position (replayPositionAt unverändert)', () => {
    const { node, puck } = renderAt(12.5);
    expect(puck).toEqual(replayPositionAt(RUN, 12.5));
    const markers = (node.root as unknown as { findAllByType: (t: unknown) => { props: { coordinate?: { latitude: number; longitude: number } } }[] }).findAllByType(Marker);
    const puckMarker = markers.find(m => m.props.coordinate?.latitude === puck!.latitude && m.props.coordinate?.longitude === puck!.longitude);
    expect(puckMarker).toBeDefined();
  });
  it('Heatmap-Teile bleiben obenauf (zIndex 4), schmaler als der blaue Unterbau, Farben unverändert', () => {
    const { polys } = renderAt(20);
    const heat = polys.filter(p => p.zIndex === 4);
    expect(heat).toHaveLength(1);
    expect(heat[0].strokeColor).toBe('#15E6C3');
    expect(heat[0].strokeWidth).toBeLessThan(8);
    expect(heat[0].coordinates).toHaveLength(4);
  });
  it('ohne runPoints (Legacy-Aufrufer) weiterhin nur Referenz + Heatmap', () => {
    let node!: ReactTestRenderer;
    act(() => { node = TestRenderer.create(<TrackReplayMap layPoints={LAY} markers={[]} heatmapParts={HEAT} puckPosition={null} />); });
    const polys = polylines(node);
    expect(byColor(polys, SEARCH_ROUTE_FULL_STROKE)).toHaveLength(0);
    expect(reference(polys)).toHaveLength(1);
  });
});
