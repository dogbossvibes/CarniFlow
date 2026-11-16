import React from 'react';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { ShareEvaluationSheet } from '../ShareEvaluationSheet';

const T = '50000000-0000-4000-8000-000000000001', G = '10000000-0000-4000-8000-000000000001';
const A = 'a1111111-1111-4111-8111-111111111111', C = 'c3333333-3333-4333-8333-333333333333';
const mockRead = jest.fn();
jest.mock('../evaluationLocal', () => ({ readEvaluationPackage: (...a: unknown[]) => mockRead(...a) }));
const mockConfirm = jest.fn(async (..._a: unknown[]) => true);
jest.mock('@/features/home-zone/confirm', () => ({ confirmEvaluationShare: (...a: unknown[]) => mockConfirm(...a) }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
jest.mock('@/components/ui/AnyvoButton', () => ({ AnyvoButton: 'AnyvoButton' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));

// Standardfall: fremd gelegt (Sandra hat gelegt, die teilende Person sucht ab) -> ohne gelegte Linie (#146).
const base = { trackId: T, groupId: G, shareOutside: false, searched: true, shared: false, group: false, laidLineShared: false, recipientUserIds: [] as string[],
  candidates: [{ userId: A, displayName: 'Sandra', isTrainer: false, isLayer: true }, { userId: C, displayName: 'Carla', isTrainer: true, isLayer: false }] };
const pkg = { version: 1, laid: [], search: [], metrics: {} };
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree.unmount()); jest.clearAllMocks(); mockConfirm.mockImplementation(async () => true); });

async function open(state = base, extra: Record<string, unknown> = {}) {
  const service = { state: jest.fn(async () => state), share: jest.fn(async () => ({ ...state, shared: true })) };
  await act(async () => { tree = renderer.create(<ShareEvaluationSheet visible onClose={jest.fn()} service={service as never} trackId={T} localId="local-1" {...extra} />); });
  return service;
}
const switches = () => tree.root.findAll(n => n.type === 'RCTSwitch' || (n.props.onValueChange && n.props.accessibilityLabel)).filter(n => typeof n.props.onValueChange === 'function');
const switchFor = (label: string) => [...new Map(switches().filter(n => n.props.accessibilityLabel === label).map(n => [n.props.onValueChange, n])).values()][0];
const save = () => tree.root.find(n => n.props.label === 'groups.evalSave' && typeof n.props.onPress === 'function');

it('standardmässig niemand ausgewählt, auch nicht die Leger:in', async () => {
  await open();
  expect(switchFor('Sandra').props.value).toBe(false);
  expect(switchFor('Carla').props.value).toBe(false);
  expect(switchFor('groups.evalWholeGroup').props.value).toBe(false);
});

it('erstes Teilen sendet das Paket aus der eigenen Fährte', async () => {
  mockRead.mockResolvedValue(pkg);
  const service = await open();
  act(() => { switchFor('Carla').props.onValueChange(true); });
  await act(async () => { save().props.onPress(); });
  expect(mockRead).toHaveBeenCalledWith('local-1', false);
  expect(service.share).toHaveBeenCalledWith(T, [C], false, pkg);
});

it('ohne Absuche auf dem Gerät wird nichts geteilt', async () => {
  mockRead.mockResolvedValue(null);
  const service = await open();
  act(() => { switchFor('Carla').props.onValueChange(true); });
  await act(async () => { save().props.onPress(); });
  expect(service.share).not.toHaveBeenCalled();
});

it('Widerruf: alles aus, ohne neues Paket', async () => {
  const service = await open({ ...base, shared: true, recipientUserIds: [C] });
  act(() => { switchFor('Carla').props.onValueChange(false); });
  await act(async () => { save().props.onPress(); });
  expect(mockRead).not.toHaveBeenCalled();
  expect(service.share).toHaveBeenCalledWith(T, [], false, null);
});

it('«Meine Trainer» nur, wenn die Gruppe es erlaubt', async () => {
  await open(base, { onOpenTrainerShare: jest.fn() });
  expect(tree.root.findAll(n => n.props.label === 'groups.evalMyTrainersOpen')).toHaveLength(0);
  act(() => tree.unmount());
  await open({ ...base, shareOutside: true }, { onOpenTrainerShare: jest.fn() });
  expect(tree.root.findAll(n => n.props.label === 'groups.evalMyTrainersOpen').length).toBeGreaterThan(0);
});

it('Heimzone: vor dem Teilen wird mit genau dem Paket gefragt; bei «Abbrechen» verlässt nichts das Gerät', async () => {
  mockRead.mockResolvedValue(pkg);
  mockConfirm.mockResolvedValue(false);
  const onClose = jest.fn();
  const service = await open(base, { onClose });
  act(() => { switchFor('Carla').props.onValueChange(true); });
  await act(async () => { save().props.onPress(); });
  expect(mockConfirm).toHaveBeenCalledWith(pkg, false);
  expect(service.share).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

it('Heimzone: wer eine bereits geteilte Auswertung auf mehr Leute ausweitet, wird ebenfalls gefragt (Paket nicht erneut gesendet)', async () => {
  mockRead.mockResolvedValue(pkg);
  const service = await open({ ...base, shared: true, recipientUserIds: [C] });
  act(() => { switchFor('groups.evalWholeGroup').props.onValueChange(true); });
  await act(async () => { save().props.onPress(); });
  expect(mockConfirm).toHaveBeenCalledWith(pkg, false);
  expect(service.share).toHaveBeenCalledWith(T, [C], true, null);
});

it('Heimzone: Einschränken oder unverändertes Speichern fragt nicht', async () => {
  const service = await open({ ...base, shared: true, group: true, recipientUserIds: [C] });
  act(() => { switchFor('groups.evalWholeGroup').props.onValueChange(false); });
  await act(async () => { save().props.onPress(); });
  expect(mockConfirm).not.toHaveBeenCalled();
  expect(mockRead).not.toHaveBeenCalled();
  expect(service.share).toHaveBeenCalledWith(T, [C], false, null);
});

describe('#146: gelegte Linie nur bei selbst gelegter Fährte', () => {
  const searchOnly = { version: 1, laid: [], search: [{ lat: 47, lng: 8 }, { lat: 47.1, lng: 8.1 }], metrics: {} };
  const withLaid = { ...searchOnly, laid: [{ lat: 47, lng: 8 }, { lat: 47.2, lng: 8.2 }] };
  const texts = () => JSON.stringify(tree.toJSON());

  it('fremd gelegt: Paket wird ohne gelegte Linie gelesen, geprüft und gesendet; der Hinweis sagt es', async () => {
    mockRead.mockImplementation(async (_id: string, includeLaid: boolean) => includeLaid ? withLaid : searchOnly);
    const service = await open();
    expect(texts()).toContain('groups.evalPrivacyNoLaid');
    expect(texts()).not.toContain('"groups.evalPrivacy"');
    act(() => { switchFor('groups.evalWholeGroup').props.onValueChange(true); });
    await act(async () => { save().props.onPress(); });
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(mockRead).toHaveBeenCalledWith('local-1', false);
    expect(mockConfirm).toHaveBeenCalledWith(searchOnly, false);
    expect(service.share).toHaveBeenCalledWith(T, [], true, searchOnly);
  });

  it('selbst gelegt: Paket mit gelegter Linie, bisheriger Hinweis', async () => {
    mockRead.mockImplementation(async (_id: string, includeLaid: boolean) => includeLaid ? withLaid : searchOnly);
    const own = { ...base, laidLineShared: true, candidates: [base.candidates[1]] };
    const service = await open(own);
    expect(texts()).toContain('"groups.evalPrivacy"');
    expect(texts()).not.toContain('groups.evalPrivacyNoLaid');
    act(() => { switchFor('Carla').props.onValueChange(true); });
    await act(async () => { save().props.onPress(); });
    expect(mockRead).toHaveBeenCalledWith('local-1', true);
    expect(mockConfirm).toHaveBeenCalledWith(withLaid, true);
    expect(service.share).toHaveBeenCalledWith(T, [C], false, withLaid);
  });
});
