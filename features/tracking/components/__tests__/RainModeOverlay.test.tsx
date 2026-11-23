import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { RainModeOverlay } from '../RainModeOverlay';
import { RAIN_HOLD_MS, isRainyWeatherCode } from '@/features/tracking/utils/rainMode';

jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
jest.mock('@/features/training-groups/registerResources', () => ({ registerGroupResources: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/features/tracking/utils/haptics', () => ({ hapticSuccess: jest.fn() }));

type Node = { props: { onPress: () => void; onPressIn: () => void; onPressOut: () => void; onAccessibilityTap?: () => void } };
let tree: ReturnType<typeof Renderer.create>;

function makeProps(over: Partial<React.ComponentProps<typeof RainModeOverlay>> = {}) {
  return {
    visible: true, duration: '12:40', distanceLabel: '310 m', objectCount: 2,
    materials: [{ value: 'holz' as const, label: 'Holz' }, { value: 'gummi' as const, label: 'Gummi' }, { value: 'stoff' as const, label: 'Stoff' }],
    jokers: [{ value: 'ball' as const, label: 'Ball' }, { value: 'duebel' as const, label: 'Dübel' }],
    lastMaterial: null,
    segmentTypes: [{ value: 'no_food' as const, label: 'Ohne Futter' }, { value: 'distraction' as const, label: 'Verleitung' }],
    activeSegmentLabel: null,
    onExit: jest.fn(), onObject: jest.fn(() => true), onAngle: jest.fn(() => true),
    onStartSegment: jest.fn(() => true), onStopSegment: jest.fn(), onStop: jest.fn(), stopLabel: 'Stopp',
    ...over,
  };
}
function render(props = makeProps()) {
  act(() => { tree = Renderer.create(<RainModeOverlay {...props} />); });
  return props;
}
const node = (testID: string) => tree.root.findAll(n => n.props.testID === testID && typeof n.props.onPressIn === 'function')[0] as unknown as Node;
const has = (testID: string) => tree.root.findAll(n => n.props.testID === testID).length > 0;
function hold(testID: string, ms = RAIN_HOLD_MS) {
  act(() => { node(testID).props.onPressIn(); });
  act(() => { jest.advanceTimersByTime(ms); });
  act(() => { node(testID)?.props.onPressOut(); });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => { act(() => tree?.unmount()); jest.useRealTimers(); });

describe('RainModeOverlay — Halten statt Tippen', () => {
  it('ein kurzer Tipp (Regentropfen) löst nichts aus', () => {
    render();
    act(() => { node('rain-object').props.onPress(); });
    hold('rain-object', RAIN_HOLD_MS - 50);
    expect(has('rain-object-holz')).toBe(false);
    expect(has('rain-object')).toBe(true);
  });

  it('Halten öffnet die Auswahl; erst die gehaltene Art setzt genau einen Gegenstand', () => {
    const p = render();
    hold('rain-object');
    expect(p.onObject).not.toHaveBeenCalled();
    hold('rain-object-gummi');
    expect(p.onObject).toHaveBeenCalledTimes(1);
    expect(p.onObject).toHaveBeenCalledWith('gummi');
    expect(has('rain-object')).toBe(true);   // zurück auf der Hauptansicht
  });

  it('Screenreader lösen ohne Halten aus', () => {
    render();
    act(() => { node('rain-joker').props.onAccessibilityTap?.(); });
    expect(has('rain-joker-ball')).toBe(true);
  });

  it('unsichtbar rendert nichts und beginnt beim Einschalten wieder auf der Hauptansicht', () => {
    const p = render();
    hold('rain-segment');
    expect(has('rain-segment-no_food')).toBe(true);
    act(() => { tree.update(<RainModeOverlay {...p} visible={false} />); });
    expect(tree.toJSON()).toBeNull();
    act(() => { tree.update(<RainModeOverlay {...p} visible />); });
    expect(has('rain-segment')).toBe(true);
  });
});

describe('RainModeOverlay — dieselben Einträge wie das normale Menü', () => {
  it('„wie zuletzt" steht zuoberst und setzt die letzte reguläre Art', () => {
    const p = render(makeProps({ lastMaterial: 'holz' }));
    hold('rain-object');
    expect(has('rain-object-holz')).toBe(false);   // nicht doppelt in der Liste
    hold('rain-object-last');
    expect(p.onObject).toHaveBeenCalledWith('holz');
  });

  it('ein Joker als letzte Art erzeugt kein „wie zuletzt"', () => {
    render(makeProps({ lastMaterial: 'ball' }));
    hold('rain-object');
    expect(has('rain-object-last')).toBe(false);
  });

  it('Joker: Ball und Dübel gehen über denselben Gegenstand-Weg', () => {
    const p = render();
    hold('rain-joker'); hold('rain-joker-duebel');
    expect(p.onObject).toHaveBeenCalledWith('duebel');
  });

  it.each(['gw', 'ow', 'bw'] as const)('%s + spitz rechts liefert dieselbe Geometrie wie SpecialAnglePicker', kind => {
    const p = render();
    hold('rain-angle'); hold(`rain-angle-${kind}`);
    expect(p.onAngle).not.toHaveBeenCalled();
    hold('rain-dir-spitz-rechts');
    expect(p.onAngle).toHaveBeenCalledTimes(1);
    expect(p.onAngle).toHaveBeenCalledWith(kind, { geometryDirection: 'rechts', geometrySharpness: 'sharp', geometrySource: 'manual' });
  });

  it('Abriss bietet nur links/rechts (unresolved), keine Automatik', () => {
    const p = render();
    hold('rain-angle'); hold('rain-angle-abriss');
    expect(has('rain-dir-auto')).toBe(false);
    expect(has('rain-dir-spitz-links')).toBe(false);
    hold('rain-dir-links');
    expect(p.onAngle).toHaveBeenCalledWith('abriss', { geometryDirection: 'links', geometrySharpness: 'unresolved', geometrySource: 'manual' });
  });

  it('„Richtung aus der Spur" setzt den Fachwinkel ohne Geometrie; Absatz direkt', () => {
    const p = render();
    hold('rain-angle'); hold('rain-angle-bw'); hold('rain-dir-auto');
    expect(p.onAngle).toHaveBeenLastCalledWith('bw');
    hold('rain-angle'); hold('rain-angle-absatz');
    expect(p.onAngle).toHaveBeenLastCalledWith('absatz');
  });

  it('Teilstrecke: Art starten; läuft eine, wird die Taste zu „beenden"', () => {
    const p = render();
    hold('rain-segment'); hold('rain-segment-distraction');
    expect(p.onStartSegment).toHaveBeenCalledWith('distraction');
    act(() => { tree.update(<RainModeOverlay {...p} activeSegmentLabel="Verleitung" />); });
    expect(has('rain-segment')).toBe(false);
    hold('rain-segment-stop');
    expect(p.onStopSegment).toHaveBeenCalledTimes(1);
    expect(p.onStartSegment).toHaveBeenCalledTimes(1);
  });

  it('„Aus" verlässt nur die Ansicht und setzt nichts', () => {
    const p = render();
    act(() => { (tree.root.findAll(n => n.props.testID === 'rain-exit')[0] as unknown as Node).props.onPress(); });
    expect(p.onExit).toHaveBeenCalledTimes(1);
    expect(p.onObject).not.toHaveBeenCalled();
    expect(p.onAngle).not.toHaveBeenCalled();
    expect(p.onStop).not.toHaveBeenCalled();
  });
});

describe('isRainyWeatherCode', () => {
  it.each([51, 55, 61, 63, 65, 67, 80, 82, 95, 99])('WMO %s gilt als Regen', code => expect(isRainyWeatherCode(code)).toBe(true));
  it.each([0, 3, 45, 48, 71, 75, 77, 85, 86])('WMO %s gilt nicht als Regen', code => expect(isRainyWeatherCode(code)).toBe(false));
  it('fehlende Wetterdaten ergeben keinen Vorschlag', () => {
    expect(isRainyWeatherCode(null)).toBe(false);
    expect(isRainyWeatherCode(undefined)).toBe(false);
    expect(isRainyWeatherCode(Number.NaN)).toBe(false);
  });
});
