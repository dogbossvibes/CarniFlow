import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { AudioRecorder } from '@/components/ui/AudioRecorder.web';
import { getUndoToastSnapshot, undoToast } from '@/lib/undoToast';
import type { AudioNote } from '@/types';

jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/components/ui/SignedImage', () => ({ SignedImage: 'SignedImage' }));
jest.mock('@/services/mediaService', () => ({ uploadImage: jest.fn() }));

// Review OTA «Bedienung» (B2/N4): Ohne ausdrückliche Wahl bleibt die Rückfrage –
// insbesondere beim Bearbeiten gespeicherter Einträge.
let tree: ReactTestRenderer;
const onChange = jest.fn();
const alert = () => jest.spyOn(Alert, 'alert').mockImplementation(() => {});
const removeButtons = () => tree.root.findAll(n => typeof n.props.onPress === 'function' && n.props.activeOpacity != null
  && n.findAll(c => (c.type as unknown) === 'Ionicons' && ['close-circle', 'trash-outline'].includes(c.props.name)).length > 0);
const press = (index: number) => act(() => { removeButtons()[index].props.onPress(); });
const notes: AudioNote[] = [{ url: 'a1', duration: '0:03', createdAt: 'x' }, { url: 'a2', duration: '0:05', createdAt: 'y' }];

beforeEach(() => { jest.useFakeTimers(); onChange.mockClear(); });
afterEach(() => {
  const open = getUndoToastSnapshot(); if (open) undoToast(open.id);
  act(() => tree.unmount()); jest.restoreAllMocks(); jest.useRealTimers();
});

describe('Foto entfernen', () => {
  it('Standard: Rückfrage, entfernt erst nach Bestätigung und zeigt keinen Rückgängig-Hinweis', () => {
    const spy = alert();
    act(() => { tree = TestRenderer.create(<PhotoPicker value={['p1', 'p2']} onChange={onChange} />); });
    press(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(getUndoToastSnapshot()).toBeNull();
    const buttons = spy.mock.calls[0][2]!;
    expect(buttons[0].style).toBe('cancel');
    act(() => { buttons[1].onPress?.(); });
    expect(onChange).toHaveBeenCalledWith(['p2']);
  });

  it('removal="undo": entfernt sofort ohne Rückfrage, mit Rückgängig-Hinweis', () => {
    const spy = alert();
    act(() => { tree = TestRenderer.create(<PhotoPicker value={['p1', 'p2']} onChange={onChange} removal="undo" undoScope="hund-a" />); });
    press(0);
    expect(spy).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(['p2']);
    expect(getUndoToastSnapshot()).toMatchObject({ message: 'undo.photoRemoved' });
  });

  it('removal="undo" während des Speicherns: Entfernen ist gesperrt', () => {
    act(() => { tree = TestRenderer.create(<PhotoPicker value={['p1']} onChange={onChange} removal="undo" undoLocked />); });
    press(0);
    expect(onChange).not.toHaveBeenCalled();
    expect(getUndoToastSnapshot()).toBeNull();
  });

  it('readOnly: Tippen bewirkt nichts', () => {
    const spy = alert();
    act(() => { tree = TestRenderer.create(<PhotoPicker value={['p1']} onChange={onChange} readOnly />); });
    press(0);
    expect(spy).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Sprachnotiz entfernen', () => {
  it('Standard: Rückfrage vor dem Entfernen', () => {
    const spy = alert();
    act(() => { tree = TestRenderer.create(<AudioRecorder value={notes} onChange={onChange} />); });
    press(0);
    expect(onChange).not.toHaveBeenCalled();
    act(() => { spy.mock.calls[0][2]![1].onPress?.(); });
    expect(onChange).toHaveBeenCalledWith([notes[1]]);
  });

  it('removal="undo": sofort mit Rückgängig-Hinweis', () => {
    act(() => { tree = TestRenderer.create(<AudioRecorder value={notes} onChange={onChange} removal="undo" />); });
    press(0);
    expect(onChange).toHaveBeenCalledWith([notes[1]]);
    expect(getUndoToastSnapshot()).toMatchObject({ message: 'undo.audioRemoved' });
  });
});
