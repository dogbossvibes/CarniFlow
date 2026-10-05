// Fährtenfarbe im Hundeprofil: Auswahl, Automatisch, Screenreader-Labels/Zustand, Touch-Ziele,
// statische Styles, i18n in allen App-Sprachen (keine rohen Keys, kein Deutsch in EN/FR/IT).
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import { TrackColorPicker } from '@/components/dogs/TrackColorPicker';
import { TRACK_OVERLAY_COLOR_KEYS, autoTrackOverlayColorKey, trackOverlayColor, type TrackOverlayColorKey } from '@/features/tracking/utils/trackOverlayColors';
import i18n from '@/i18n/config';
/* eslint-enable import/first */

type Node = any;
let r: Node = null;
const render = (value: TrackOverlayColorKey | null, onChange = jest.fn(), disabled = false) => {
  act(() => { r = TestRenderer.create(<TrackColorPicker dogId="dog-malu" value={value} onChange={onChange} disabled={disabled} />); });
  return onChange;
};
const byId = (id: string) => r.root.findAll((n: Node) => n.props.testID === id)[0];
afterEach(() => { if (r) act(() => r.unmount()); r = null; });

describe('TrackColorPicker (de-CH)', () => {
  beforeAll(async () => { await i18n.changeLanguage('de'); });
  it('Automatisch + alle Palettenfarben; Hinweistext', () => {
    render(null);
    expect(byId('track-color-auto')).toBeTruthy();
    for (const k of TRACK_OVERLAY_COLOR_KEYS) expect(byId(`track-color-${k}`)).toBeTruthy();
    const texts = r.root.findAllByType(Text).map((t: Node) => [].concat(t.props.children).join(''));
    expect(texts).toContain('Diese Farbe kennzeichnet die Fährten deines Hundes auf der Karte.');
    expect(texts).toContain('Automatisch');
  });
  it('Farbe wählen und Automatisch wählen melden genau diesen Wert', () => {
    const onChange = render(null);
    act(() => byId('track-color-violet').props.onPress());
    act(() => byId('track-color-auto').props.onPress());
    expect(onChange.mock.calls).toEqual([['violet'], [null]]);
  });
  it('Screenreader: Radio + Label „<Farbe>, Fährtenfarbe" + ausgewählter Zustand', () => {
    render('orange');
    const o = byId('track-color-orange').props;
    expect(o.accessibilityRole).toBe('radio');
    expect(o.accessibilityLabel).toBe('Orange, Fährtenfarbe');
    expect(o.accessibilityState).toMatchObject({ selected: true, checked: true });
    expect(byId('track-color-blue').props.accessibilityLabel).toBe('Blau, Fährtenfarbe');
    expect(byId('track-color-blue').props.accessibilityState).toMatchObject({ selected: false });
    expect(byId('track-color-auto').props.accessibilityLabel).toBe('Automatisch, Fährtenfarbe');
    expect(byId('track-color-auto').props.accessibilityState).toMatchObject({ selected: false });
  });
  it('Auswahl nicht nur über Farbe: Rahmen + Haken; Touch-Ziel ≥ 44 pt; statische Styles', () => {
    render('pink');
    const on = StyleSheet.flatten(byId('track-color-pink').props.style);
    const off = StyleSheet.flatten(byId('track-color-lime').props.style);
    expect(on.borderColor).not.toBe(off.borderColor);
    expect(on.width).toBeGreaterThanOrEqual(44);
    expect(StyleSheet.flatten(byId('track-color-auto').props.style).minHeight).toBeGreaterThanOrEqual(44);
    for (const id of ['track-color-auto', ...TRACK_OVERLAY_COLOR_KEYS.map(k => `track-color-${k}`)]) {
      expect(typeof byId(id).props.style).not.toBe('function');
    }
  });
  it('„Automatisch" zeigt die stabile Fallbackfarbe DIESES Hundes', () => {
    render(null);
    const dot = byId('track-color-auto').findAll((n: Node) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.width === 14)[0];
    expect(StyleSheet.flatten(dot.props.style).backgroundColor).toBe(trackOverlayColor(autoTrackOverlayColorKey('dog-malu')));
  });
  it('während des Speicherns deaktiviert', () => {
    render(null, jest.fn(), true);
    expect(byId('track-color-orange').props.disabled).toBe(true);
    expect(byId('track-color-auto').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe.each([
  ['gsw', 'Fährtefarb', 'Automatisch'],
  ['en', 'track color', 'Automatic'],
  ['fr', 'couleur de piste', 'Automatique'],
  ['it', 'colore della pista', 'Automatico'],
])('Sprache %s', (lng, suffix, auto) => {
  beforeAll(async () => { await i18n.changeLanguage(lng); });
  afterAll(async () => { await i18n.changeLanguage('de'); });
  it('übersetzt, keine rohen Keys', () => {
    render(null);
    expect(byId('track-color-auto').props.accessibilityLabel).toBe(`${auto}, ${suffix}`);
    const all = [
      ...r.root.findAllByType(Text).map((t: Node) => [].concat(t.props.children).join('')),
      ...TRACK_OVERLAY_COLOR_KEYS.map(k => byId(`track-color-${k}`).props.accessibilityLabel as string),
    ].join('|');
    expect(all).not.toMatch(/dog\.trackColor\./);
    if (lng !== 'gsw') expect(all).not.toMatch(/Fährte|Farbe|Automatisch|Violett|Hellgrün|Gelb\b/);
  });
});
