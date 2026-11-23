import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AccessibilityInfo, AppState, Keyboard, type AppStateStatus } from 'react-native';
import { UndoToastHost } from '@/components/ui/UndoToast';
import { getUndoToastSnapshot, showUndoToast, undoToast } from '@/lib/undoToast';

jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }) }));
jest.mock('@/hooks/useReduceMotion', () => ({ useReduceMotion: () => true }));

let tree: ReactTestRenderer;
let appStateListener: ((state: AppStateStatus) => void) | undefined;
beforeEach(async () => {
  jest.useFakeTimers();
  appStateListener = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as never;
  });
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  await act(async () => { tree = TestRenderer.create(<UndoToastHost />); });
});
afterEach(() => {
  const open = getUndoToastSnapshot(); if (open) undoToast(open.id);
  act(() => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers();
});

const action = () => tree.root.findAll(n => n.props.testID === 'undo-toast-action' && n.props.onPress)[0];

it('zeigt nichts, solange kein Hinweis offen ist', () => {
  expect(tree.toJSON()).toBeNull();
});

it('ist für Vorlese-Funktionen ansagbar und der Knopf gross genug', () => {
  act(() => { showUndoToast({ message: 'Foto entfernt', onUndo: jest.fn() }); });
  const live = tree.root.findAll(n => n.props.accessibilityLiveRegion === 'polite')[0];
  expect(live.props.accessibilityRole).toBe('alert');
  expect(tree.root.findAll(n => n.props.children === 'Foto entfernt').length).toBeGreaterThan(0);
  const button = action();
  expect(button.props.accessibilityRole).toBe('button');
  expect(button.props.accessibilityLabel).toBe('undo.action');
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Foto entfernt. undo.action');
});

it('Rückgängig-Knopf nimmt zurück, sagt es an und schliesst den Hinweis', () => {
  const onUndo = jest.fn(), onCommit = jest.fn();
  act(() => { showUndoToast({ message: 'Foto entfernt', onUndo, onCommit }); });
  act(() => { action().props.onPress(); });
  act(() => { jest.runAllTimers(); });
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(onCommit).not.toHaveBeenCalled();
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('undo.done');
  expect(tree.toJSON()).toBeNull();
});

it('verschwindet nach der Frist von selbst', () => {
  act(() => { showUndoToast({ message: 'Foto entfernt', onUndo: jest.fn() }); });
  act(() => { jest.runAllTimers(); });
  expect(tree.toJSON()).toBeNull();
});

it('B3: schreibt fest, sobald die App in den Hintergrund geht', () => {
  const onUndo = jest.fn(), onCommit = jest.fn();
  act(() => { showUndoToast({ message: 'Startbildschirm zurückgesetzt', onUndo, onCommit }); });
  act(() => { appStateListener?.('inactive'); });
  expect(onCommit).not.toHaveBeenCalled();
  act(() => { appStateListener?.('background'); });
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onUndo).not.toHaveBeenCalled();
  expect(tree.toJSON()).toBeNull();
});

it('N3: schliesst die Tastatur, damit sie den Hinweis nicht verdeckt', () => {
  act(() => { showUndoToast({ message: 'Foto entfernt', onUndo: jest.fn() }); });
  expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
});
