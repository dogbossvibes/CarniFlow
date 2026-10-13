import { coldIntent } from '../../services/objectReview/__tests__/intentFixtures';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Alert } from 'react-native';
import { TrackObjectCorrections } from '../TrackObjectCorrections';
import { baseline, corrected, request } from '../../services/objectReview/__tests__/fixtures';
import type { TrackObjectReviewController } from '../../hooks/useTrackObjectReview';
import { deCH as mockDeCH } from '@/i18n/de-CH';
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: keyof typeof mockDeCH, values: Record<string, any> = {}) =>
  Object.entries(values).reduce<string>((text, [key, value]) => text.replace(`{${key}}`, String(value)), mockDeCH[key] ?? key) }) }));
let renderer: any;
const control = (overrides: Partial<TrackObjectReviewController> = {}): TrackObjectReviewController => ({ available: true, contextKey: 'owner-a/run-a', localAutoObjects: [], queueAutoIntent: jest.fn(async () => true), resolveIntent: jest.fn(async () => true), review: baseline(), pending: null, error: null, busy: false,
  initialize: jest.fn(), refresh: jest.fn(), save: jest.fn(async () => false), acceptCurrent: jest.fn(), ...overrides });
const mount = (c: TrackObjectReviewController) => act(() => { renderer = TestRenderer.create(<TrackObjectCorrections controller={c} />); });
const button = (text: string) => renderer.root.findAll((node: any) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === text && typeof node.props.onPress === 'function')[0];
const text = () => JSON.stringify(renderer.toJSON());
afterEach(() => { act(() => renderer?.unmount()); jest.restoreAllMocks(); });
it('only initializes after explicit press, and disables unavailable backend actions', () => {
  const c = control({ review: null }); mount(c); expect(c.initialize).not.toHaveBeenCalled();
  act(() => button('Änderungsverlauf anlegen').props.onPress()); expect(c.initialize).toHaveBeenCalledTimes(1);
  act(() => renderer.update(<TrackObjectCorrections controller={{ ...c, error: new Error('PGRST202') }} />));
  expect(button('Änderungsverlauf anlegen').props.disabled).toBe(true);
});
it('cancel changes writes nothing; save submits changed objects and the original edit revision', () => {
  const c = control(); mount(c);
  act(() => button('Gegenstände korrigieren').props.onPress());
  const radio = () => renderer.root.findAll((n: any) => n.props.accessibilityLabel === 'G2: Gefunden' && typeof n.props.onPress === 'function')[0];
  act(() => radio().props.onPress()); act(() => button('Abbrechen').props.onPress()); expect(c.save).not.toHaveBeenCalled();
  act(() => button('Gegenstände korrigieren').props.onPress()); act(() => radio().props.onPress());
  // Another device's refresh must not silently rebase the user's already open editor.
  act(() => renderer.update(<TrackObjectCorrections controller={{ ...c, review: baseline({ revision: 4 }) }} />));
  act(() => button('Änderungen speichern').props.onPress());
  expect(c.save).toHaveBeenCalledWith(request().changes, 0);
});
it('shows pending changes separately and keeps failed saves editable', () => {
  const c = control(); mount(c); act(() => button('Gegenstände korrigieren').props.onPress());
  act(() => renderer.update(<TrackObjectCorrections controller={{ ...c, error: new Error('offline') }} />));
  expect(button('Änderungen speichern')).toBeTruthy();
  act(() => renderer.update(<TrackObjectCorrections controller={{ ...c, pending: { request: request(), state: 'pending', lastError: null } }} />));
  expect(text()).toContain('Noch nicht synchronisiert'); expect(button('Änderungen speichern')).toBeUndefined();
  expect(text()).toContain('Nicht gefunden'); // Confirmed outcome has not been optimistically overwritten.
});
it('requires explicit conflict choice and retains human-readable before/after history', () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const c = control({ review: corrected(), pending: { request: request(), state: 'conflict', lastError: 'stale' } }); mount(c);
  act(() => button('Aktuellen Stand übernehmen').props.onPress()); expect(c.acceptCurrent).not.toHaveBeenCalled();
  const confirm = alert.mock.calls[0][2]![1]; act(() => confirm.onPress!()); expect(c.acceptCurrent).toHaveBeenCalledTimes(1);
  act(() => button('Änderungsverlauf').props.onPress()); expect(text()).toContain('2026'); expect(text()).toContain('Nicht gefunden');
});
it('hides another account/run and clears unsaved selections when the run changes', () => {
  const c = control(); mount(c); act(() => button('Gegenstände korrigieren').props.onPress());
  act(() => renderer.update(<TrackObjectCorrections controller={{ ...c, available: false, review: null }} />)); expect(renderer.toJSON()).toBeNull();
  act(() => renderer.update(<TrackObjectCorrections controller={{ ...c, contextKey: 'owner-a/next-run', review: baseline({ runId: 'next-run' }) }} />));
  expect(button('Änderungen speichern')).toBeUndefined();
});
it('reports incomplete synchronization without inventing a baseline', () => {
  const c = control({ review: null, error: new Error('REVIEW_REFERENCE_INCOMPLETE') }); mount(c);
  expect(text()).toContain('noch nicht vollständig synchronisiert'); expect(c.initialize).not.toHaveBeenCalled();
});

it('closes the editor after a durable save even when a fast ACK batches away the pending render', async () => {
  const c = control({ save: jest.fn(async () => true) }); mount(c);
  act(() => button('Gegenstände korrigieren').props.onPress());
  act(() => renderer.root.findAll((n: any) => n.props.accessibilityLabel === 'G2: Gefunden' && typeof n.props.onPress === 'function')[0].props.onPress());
  await act(async () => button('Änderungen speichern').props.onPress());
  expect(button('Änderungen speichern')).toBeUndefined();
});


it('C1: offers durable dismissal of a recorded auto detection offline before any review baseline was cached', () => {
  const c = control({ review: null, error: new Error('REVIEW_OFFLINE') });
  Object.assign(c, { localAutoObjects: [{ objectId: 'local-auto-id', index: 0, material: null }], queueAutoIntent: jest.fn(async () => true) });
  mount(c);
  expect(button('Automatische Erkennung 1 verwerfen')).toBeTruthy();
});


it('keeps cold intent visible without server data and allows another offline dismissal', async () => {
  const c = control({ review: null, localAutoObjects: coldIntent().localAutoObjects,
    pending: { request: coldIntent(), state: 'failed', lastError: 'offline' } });
  mount(c); expect(text()).toContain('Verwerfen vorgemerkt');
  expect(button('Automatische Erkennung 1 verwerfen')).toBeUndefined();
  await act(async () => button('Automatische Erkennung 2 verwerfen').props.onPress());
  expect(c.queueAutoIntent).toHaveBeenCalledWith('local-auto-b');
  expect(c.initialize).not.toHaveBeenCalled(); expect(c.save).not.toHaveBeenCalled();
});
it('never preselects a server identity and submits only the explicit mapping with its original revision', () => {
  const c = control({ localAutoObjects: coldIntent().localAutoObjects,
    pending: { request: coldIntent(), state: 'conflict', lastError: 'REVIEW_INTENT_CONFIRMATION_REQUIRED' } });
  mount(c);
  expect(button('Zuordnung bestätigen und speichern').props.disabled).toBe(true);
  act(() => renderer.root.findAll((n: any) => n.props.accessibilityRole === 'radio' && n.props.accessibilityLabel === 'Automatische Erkennung 1 → G1' && typeof n.props.onPress === 'function')[0].props.onPress());
  act(() => renderer.update(<TrackObjectCorrections controller={{ ...c, review: baseline({ revision: 3 }) }} />));
  act(() => button('Zuordnung bestätigen und speichern').props.onPress());
  expect(c.resolveIntent).toHaveBeenCalledWith({ 'local-auto-a': 'object-a' }, 0);
  act(() => button('Abbrechen').props.onPress());
  expect(button('Zuordnung bestätigen und speichern').props.disabled).toBe(true);
  expect(c.acceptCurrent).not.toHaveBeenCalled();
});
