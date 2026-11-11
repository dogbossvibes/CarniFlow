import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, StyleSheet, type AlertButton } from 'react-native';
import { UnitListCard } from '../UnitListCard';
import { SwipeableTrainingItem } from '../SwipeableTrainingItem';
import { C } from '@/constants/colors';
import type { TrainingUnit } from '@/types/trainingUnit';

jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/ui/Glass', () => ({
  isGlass: true,
  Glass: () => null,
}));
jest.mock('@/components/ui/AnimatedPressable', () => ({
  AnimatedPressable: (props: object) => jest.requireActual('react').createElement('CardPressable', props),
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  // Expose the native action slots; this is not a real gesture/visual test.
  default: ({ children, renderLeftActions, renderRightActions }: {
    children: React.ReactNode; renderLeftActions(): React.ReactNode; renderRightActions(): React.ReactNode;
  }) => jest.requireActual('react').createElement(jest.requireActual('react').Fragment, null, renderLeftActions(), children, renderRightActions()),
}));
const unit: TrainingUnit = {
  id: 'synthetic-unit', owner_id: 'synthetic-owner', dog_id: 'synthetic-dog',
  session_date: '2026-11-04', started_at: null, ended_at: null, duration_sec: 600,
  rating: 4, score: null, notes: null, photos: [], videos: [], audio_files: [],
  motivation: null, konzentration: null, praezision: null, ausdauer: null,
  trieblage: null, impulskontrolle: null, shared_with_trainer: false,
  status: 'completed', created_at: 'synthetic', dog: { name: 'Testhund' }, exercises: [],
};
let view: ReactTestRenderer;
afterEach(() => { act(() => view?.unmount()); jest.restoreAllMocks(); });
async function render(onPress = jest.fn(), onDelete = jest.fn()) {
  await act(async () => { view = TestRenderer.create(
    <SwipeableTrainingItem trainingId={unit.id} onDelete={onDelete}>
      <UnitListCard unit={unit} onPress={onPress} />
    </SwipeableTrainingItem>,
  ); });
}
const card = () => view.root.findAll(n => n.type === 'CardPressable')[0];
it('keeps the foreground opaque even when native glass is available', async () => {
  await render();
  const style = StyleSheet.flatten(card().props.style);
  expect(style.backgroundColor).toBe(C.card);
  expect(style.opacity ?? 1).toBe(1);
});
it('opens the original unit without invoking deletion', async () => {
  const open = jest.fn(), remove = jest.fn(); await render(open, remove);
  act(() => card().props.onPress());
  expect(open).toHaveBeenCalledTimes(1); expect(remove).not.toHaveBeenCalled();
});
it('preserves confirmation and cancellation before the swipe delete callback', async () => {
  const remove = jest.fn(); const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(jest.fn(), remove);
  const action = view.root.findAll(n => n.props.accessibilityLabel === 'training.deleteA11y' && typeof n.props.onPress === 'function')[0];
  act(() => action.props.onPress());
  expect(remove).not.toHaveBeenCalled();
  const buttons: AlertButton[] = alert.mock.calls[0][2] ?? [];
  act(() => buttons.find(b => b.style === 'cancel')?.onPress?.());
  expect(remove).not.toHaveBeenCalled();
  act(() => action.props.onPress());
  act(() => alert.mock.calls[1][2]?.find(b => b.style === 'destructive')?.onPress?.());
  expect(remove).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledWith(unit.id);
});
