import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { Platform } from 'react-native';
import { TrackAngleList } from '../TrackAngleList';
import { buildTrackDetailMap } from '../../utils/trackDetailMap';
import { savedAngleLabel } from '../../utils/savedAngleLabel';
import { deCH as mockDeCH } from '@/i18n/de-CH';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';
import { it as italian } from '@/i18n/locales/it';
import { gswCH } from '@/i18n/gsw-CH';
import type { TranslationKey } from '@/i18n';
import type { AngleIdentity } from '../../utils/specialAngleGeometry';

jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: keyof typeof mockDeCH) => mockDeCH[key] ?? key }) }));
const t = (key: TranslationKey) => mockDeCH[key as keyof typeof mockDeCH];
let renderer: any;
afterEach(() => { if (renderer) act(() => renderer.unmount()); });

it.each([
  ['links', 'Winkel links'], ['rechts', 'Winkel rechts'],
  ['spitz_links', 'Spitzwinkel links'], ['spitz_rechts', 'Spitzwinkel rechts'],
  ['spitz', 'Spitzwinkel · Richtung unbekannt'],
  ['bw', 'Bodenwinkel · Richtung unbekannt'], ['ow', 'Offener Winkel · Richtung unbekannt'],
  ['gw', 'Geschlossener Winkel · Richtung unbekannt'], ['abriss', 'Abriss · Richtung unbekannt'],
  [null, 'Winkel · Art und Richtung unbekannt'], ['future-kind', 'Winkel · Art und Richtung unbekannt'],
])('uses the saved kind %s and identifies missing data', (angleKind, expected) => {
  expect(savedAngleLabel({ angleKind }, t)).toBe(expected);
});
it.each(['bw', 'ow', 'gw', 'abriss'])('retains %s and uses only saved direction/sharpness', angleKind => {
  expect(savedAngleLabel({ angleKind, geometryDirection: 'rechts', geometrySharpness: 'sharp' }, t))
    .toContain(angleKind === 'abriss' ? '· rechts' : '· spitz rechts');
  expect(savedAngleLabel({ angleKind, geometryDirection: 'links', geometrySharpness: 'unresolved' }, t))
    .toContain('· links');
  expect(savedAngleLabel({ angleKind, geometryDirection: 'unresolved', geometrySharpness: 'sharp' }, t))
    .toContain('Richtung unbekannt');
});
it.each(['de', 'gsw', 'en', 'fr', 'it'])('provides localized names and fallbacks in %s', locale => {
  const dictionaries = { de: mockDeCH, gsw: { ...mockDeCH, ...gswCH }, en, fr, it: italian };
  const dictionary = dictionaries[locale as keyof typeof dictionaries];
  const translate = (key: TranslationKey) => dictionary[key as keyof typeof dictionary] ?? key;
  for (const marker of [{ angleKind: 'spitz_links' }, { angleKind: 'bw' }, { angleKind: null }] as AngleIdentity[]) {
    const label = savedAngleLabel(marker, translate);
    expect(label).not.toMatch(/undefined|track\./);
    expect(label.length).toBeGreaterThan(5);
  }
  for (const key of Object.keys(mockDeCH).filter(key => key.startsWith('track.angleList.'))) {
    expect(translate(key as TranslationKey)).toBeTruthy();
  }
});
it.each(['ios', 'android'] as const)('keeps saved marker identity when rows are filtered/reordered on %s', platform => {
  const previous = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: platform, configurable: true });
  try {
    // No coordinates required: old/manual markers still have useful names.
    const detail = buildTrackDetailMap({ markers: [
      { id: 'object', marker_type: 'gegenstand' },
      { id: 'sharp', marker_type: 'winkel', angle_kind: 'spitz_rechts', distance_from_start: 0 },
      { id: 'old', marker_type: 'winkel', angle_kind: null, distance_from_start: NaN },
    ] });
    const before = JSON.stringify(detail);
    const select = jest.fn();
    act(() => { renderer = TestRenderer.create(<TrackAngleList markers={detail.markers} onSelect={select} />); });
    const buttons = () => renderer.root.findAll((node: ReactTestInstance) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');
    expect(buttons()).toHaveLength(2);
    expect(buttons()[0].props.accessibilityLabel).toContain('1 · Spitzwinkel rechts');
    expect(buttons()[0].props.accessibilityLabel).toContain('0 m');
    expect(buttons()[1].props.accessibilityLabel).toContain('Entfernung nicht gespeichert');
    act(() => buttons()[1].props.onPress());
    expect(select).toHaveBeenLastCalledWith(detail.markers[2]);
    act(() => renderer.update(<TrackAngleList markers={[detail.markers[2], detail.markers[1]]} onSelect={select} />));
    act(() => buttons()[0].props.onPress());
    expect(select.mock.calls[1][0]).toBe(detail.markers[2]);
    expect(JSON.stringify(detail)).toBe(before);
    expect(JSON.stringify(renderer.toJSON())).not.toMatch(/NaN|Verwerfen|90°/);
  } finally { Object.defineProperty(Platform, 'OS', { value: previous, configurable: true }); }
});
it('explains empty historical data without inventing angles', () => {
  act(() => { renderer = TestRenderer.create(<TrackAngleList markers={[]} onSelect={jest.fn()} />); });
  expect(JSON.stringify(renderer.toJSON())).toContain('Keine Winkelmarkierungen gespeichert.');
});
it('uses the shared map projection for a saved special angle without showing its paired geometric marker twice', () => {
  const detail = buildTrackDetailMap({ markers: [
    { id: 'special', marker_type: 'winkel', angle_kind: 'bw', latitude: 47, longitude: 8, distance_from_start: 10 },
    { id: 'paired', marker_type: 'winkel', angle_kind: 'spitz_rechts', latitude: 47, longitude: 8, distance_from_start: 10 },
  ], track_data: { manualAngleGeometry: [{
    markerKey: 'bw:47.0000000:8.0000000:10.0', manualMarkerType: 'bw',
    geometryDirection: 'rechts', geometrySharpness: 'sharp', geometrySource: 'manual',
  }] } });
  const select = jest.fn();
  act(() => { renderer = TestRenderer.create(<TrackAngleList markers={detail.markers} onSelect={select} />); });
  const buttons = renderer.root.findAll((node: ReactTestInstance) => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function');
  expect(buttons).toHaveLength(1);
  expect(buttons[0].props.accessibilityLabel).toContain('Bodenwinkel · spitz rechts');
  act(() => buttons[0].props.onPress());
  expect(select.mock.calls[0][0].id).toBe('special');
});
