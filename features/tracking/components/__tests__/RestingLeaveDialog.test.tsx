// Liegezeit-Verlassen-Dialog: „Fährte endgültig abbrechen" nur per 1,5-s-Hold (Touch) bzw. über eine
// ausdrückliche Bestätigung (Bedienungshilfen). Reiner Komponententest mit Fake-Timern.
import React from 'react';
import { AppState, StyleSheet } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/features/tracking/utils/haptics', () => ({ hapticSuccess: jest.fn() }));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import { RestingLeaveDialog, HOLD_TO_ABORT_MS } from '@/features/tracking/components/RestingLeaveDialog';
import { hapticSuccess } from '@/features/tracking/utils/haptics';
import i18n from '@/i18n/config';
/* eslint-enable import/first */

type Node = any;
const cb = () => ({ onBackground: jest.fn(), onHoldAbort: jest.fn(), onAccessibleAbort: jest.fn(), onBack: jest.fn() });
let tree: Node = null;
let fns = cb();
const render = (visible = true) => {
  fns = cb();
  act(() => { tree = TestRenderer.create(<RestingLeaveDialog visible={visible} {...fns} />); });
  return tree!;
};
const byId = (id: string): Node => tree!.root.findAll((n: Node) => n.props.testID === id)[0];
const hold = () => byId('resting-leave-abort-hold');
// Reanimated (Jest) legt den animierten Stil am Host-View unter jestAnimatedStyle ab.
const fillWidth = () => {
  const host = tree!.root.findAll((n: Node) => n.props.testID === 'resting-leave-abort-fill' && typeof n.type === 'string')[0];
  return host.props.jestAnimatedStyle?.value?.width ?? '0%';
};
const texts = () => tree!.root.findAllByType('Text' as never).map((n: Node) => [].concat(n.props.children).join(''));

beforeAll(async () => { await i18n.changeLanguage('de'); });
beforeEach(() => { jest.useFakeTimers(); (hapticSuccess as jest.Mock).mockClear(); });
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = null; jest.useRealTimers(); jest.restoreAllMocks(); });

describe('RestingLeaveDialog — Inhalt', () => {
  it('Titel, ruhiger Text und genau drei Aktionen; Abbruch-Beschriftung nennt die endgültige Folge', () => {
    render();
    const t = texts();
    expect(t).toEqual(expect.arrayContaining([
      'Liegezeit läuft',
      'Die Liegezeit läuft weiter, auch wenn du diesen Bildschirm verlässt. Du kannst später jederzeit zu dieser Fährte zurückkehren.',
      'Im Hintergrund weiterlaufen', 'Zum endgültigen Abbrechen gedrückt halten', 'Zurück',
    ]));
    expect(t).not.toContain('Liegezeit beenden');
    expect(t).not.toContain('Weiterlaufen lassen');
    expect(t).not.toContain('Gedrückt halten');
  });
  it('unsichtbar → kein Dialog', () => {
    render(false);
    expect(byId('resting-leave-dialog')).toBeUndefined();
  });
  it('Im Hintergrund weiterlaufen / Zurück: normaler Tap, kein Hold nötig', () => {
    render();
    act(() => byId('resting-leave-background').props.onPress());
    expect(fns.onBackground).toHaveBeenCalledTimes(1);
    act(() => byId('resting-leave-back').props.onPress());
    expect(fns.onBack).toHaveBeenCalledTimes(1);
    expect(fns.onHoldAbort).not.toHaveBeenCalled();
  });
});

describe('Hold-to-Abort', () => {
  it(`Hold-Dauer ist ${HOLD_TO_ABORT_MS} ms`, () => { expect(HOLD_TO_ABORT_MS).toBe(1500); });

  it('A. kurzer Tap (Press-In → 150 ms → Press-Out → onPress) bricht NIE ab', () => {
    render();
    act(() => hold().props.onPressIn());
    act(() => jest.advanceTimersByTime(150));
    act(() => hold().props.onPressOut());
    act(() => hold().props.onPress());
    act(() => jest.advanceTimersByTime(5000));
    expect(fns.onHoldAbort).not.toHaveBeenCalled();
    expect(fns.onAccessibleAbort).not.toHaveBeenCalled();
    expect(hapticSuccess).not.toHaveBeenCalled();
  });

  it('B. Hold knapp unter der Grenze (1490 ms) bricht nicht ab, auch nicht verzögert', () => {
    render();
    act(() => hold().props.onPressIn());
    act(() => jest.advanceTimersByTime(1490));
    expect(fns.onHoldAbort).not.toHaveBeenCalled();
    act(() => hold().props.onPressOut());
    act(() => jest.advanceTimersByTime(5000));
    expect(fns.onHoldAbort).not.toHaveBeenCalled();
  });

  it('C. vollständiger Hold (1500 ms) → Abbruch genau einmal, mit Haptik', () => {
    render();
    act(() => hold().props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_ABORT_MS));
    expect(fns.onHoldAbort).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });

  it('D. langer Hold (3000 ms) und Press-Out danach → trotzdem nur EINMAL', () => {
    render();
    act(() => hold().props.onPressIn());
    act(() => jest.advanceTimersByTime(3000));
    act(() => hold().props.onPressOut());
    act(() => hold().props.onPress());
    act(() => jest.advanceTimersByTime(3000));
    expect(fns.onHoldAbort).toHaveBeenCalledTimes(1);
  });

  it('E. Hold abbrechen: Fortschritt sichtbar, nach Loslassen zurück auf 0, kein Abbruch; neuer Hold braucht volle Dauer', () => {
    render();
    expect(fillWidth()).toBe('0%');
    act(() => hold().props.onPressIn());
    act(() => jest.advanceTimersByTime(700));
    expect(fillWidth()).not.toBe('0%');                 // Fortschritt läuft
    act(() => hold().props.onPressOut());
    act(() => jest.advanceTimersByTime(300));
    expect(fillWidth()).toBe('0%');                     // zurückgesetzt
    act(() => hold().props.onPressIn());
    act(() => jest.advanceTimersByTime(HOLD_TO_ABORT_MS - 700));
    act(() => hold().props.onPressOut());
    act(() => jest.advanceTimersByTime(3000));
    expect(fns.onHoldAbort).not.toHaveBeenCalled();
  });

  it('F. Unmount während des Haltens → kein verzögerter Abbruch, keine State-Update-Warnung', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    render();
    act(() => hold().props.onPressIn());
    act(() => jest.advanceTimersByTime(800));
    act(() => tree!.unmount()); tree = null;
    act(() => jest.advanceTimersByTime(5000));
    expect(fns.onHoldAbort).not.toHaveBeenCalled();
    expect(err).not.toHaveBeenCalled();
  });

  it('G. mehrfaches schnelles Drücken / doppeltes Press-In → höchstens EIN Abbruch', () => {
    render();
    act(() => { hold().props.onPressIn(); hold().props.onPressIn(); });
    act(() => jest.advanceTimersByTime(200));
    act(() => hold().props.onPressIn());               // erneutes Press-In startet neu, kein zweiter Timer
    act(() => jest.advanceTimersByTime(HOLD_TO_ABORT_MS));
    expect(fns.onHoldAbort).toHaveBeenCalledTimes(1);
    act(() => hold().props.onPressOut());
    act(() => hold().props.onPressIn());               // nach Abschluss erneut halten
    act(() => jest.advanceTimersByTime(HOLD_TO_ABORT_MS * 2));
    expect(fns.onHoldAbort).toHaveBeenCalledTimes(1);
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
  });

  it('App-Wechsel während des Haltens → Hold abgebrochen, kein Abbruch im Hintergrund', () => {
    const handlers: ((s: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, fn: (s: string) => void) => {
      handlers.push(fn); return { remove: () => {} };
    }) as never);
    render();
    act(() => hold().props.onPressIn());
    act(() => jest.advanceTimersByTime(700));
    act(() => handlers.forEach(h => h('background')));
    act(() => jest.advanceTimersByTime(5000));
    expect(fns.onHoldAbort).not.toHaveBeenCalled();
    expect(fillWidth()).toBe('0%');
  });

  it('Re-Render während des Haltens (neue Callbacks) unterbricht nicht und löst genau einmal den aktuellen Callback aus', () => {
    render();
    act(() => hold().props.onPressIn());
    act(() => jest.advanceTimersByTime(700));
    const next = cb();
    act(() => tree!.update(<RestingLeaveDialog visible {...next} />));
    act(() => jest.advanceTimersByTime(HOLD_TO_ABORT_MS));
    expect(fns.onHoldAbort).not.toHaveBeenCalled();
    expect(next.onHoldAbort).toHaveBeenCalledTimes(1);
  });
});

describe('K. Bedienungshilfen', () => {
  it('Button ist für Screenreader beschriftet, mit Hinweis und „Aktivieren"-Aktion', () => {
    render();
    const p = hold().props;
    expect(p.accessibilityRole).toBe('button');
    expect(p.accessibilityLabel).toBe('Fährte endgültig abbrechen');
    expect(p.accessibilityHint).toBe('Öffnet eine Bestätigung zum endgültigen Abbrechen der Fährte.');
    expect(p.accessibilityActions).toEqual([{ name: 'activate' }]);
  });
  it('„Aktivieren" bricht NICHT direkt ab, sondern fordert die ausdrückliche Bestätigung an', () => {
    render();
    act(() => hold().props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
    expect(fns.onAccessibleAbort).toHaveBeenCalledTimes(1);
    expect(fns.onHoldAbort).not.toHaveBeenCalled();
    act(() => hold().props.onAccessibilityAction({ nativeEvent: { actionName: 'magicTap' } }));
    expect(fns.onAccessibleAbort).toHaveBeenCalledTimes(1);
  });
  it('statische Styles (keine Style-Funktion, NativeWind-sicher), Touch-Höhe ≥ 52, Rot aus dem Theme', () => {
    render();
    for (const id of ['resting-leave-background', 'resting-leave-abort-hold', 'resting-leave-back']) {
      expect(typeof byId(id).props.style).not.toBe('function');
      expect(StyleSheet.flatten(byId(id).props.style).minHeight).toBeGreaterThanOrEqual(52);
    }
    const abort = StyleSheet.flatten(hold().props.style);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FT } = require('@/constants/colors');
    expect(abort.borderColor).toBe(FT.bad);
  });
});
