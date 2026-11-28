import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AssignDogSheet } from '../AssignDogSheet';

jest.mock('@/components/ui/AnyvoBottomSheet', () => { const { View } = jest.requireActual('react-native'); return { AnyvoBottomSheet: ({ children }: { children: React.ReactNode }) => <View>{children}</View> }; });
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string, p?: Record<string, unknown>) => (p ? `${key}:${JSON.stringify(p)}` : key) }) }));

const DOGS = [{ id: 'oha', name: 'oha' }, { id: 'malu', name: 'Malu' }, { id: 'yam', name: 'Yam' }];
let view: ReactTestRenderer;
const find = (id: string) => (view.root as any).findByProps({ testID: id });
const findAll = (id: string) => (view.root as any).findAllByProps({ testID: id });
const mount = (over: Partial<React.ComponentProps<typeof AssignDogSheet>> = {}) => {
  const onCancel = jest.fn(); const onConfirm = jest.fn();
  act(() => {
    view = TestRenderer.create(<AssignDogSheet visible dogs={DOGS} dogsUnavailable={false} otherCount={2} defaultApplyToOthers busy={false} onCancel={onCancel} onConfirm={onConfirm} {...over} />);
  });
  return { onCancel, onConfirm };
};
afterEach(() => { act(() => view.unmount()); });

it('Abbrechen: nur schliessen, keine Zuordnung', () => {
  const { onCancel, onConfirm } = mount();
  act(() => find('assign-dog-malu').props.onPress());
  act(() => find('assign-cancel').props.onPress());
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

it('„Zuordnen und hochladen" erst nach Hundewahl; übergibt Hund und Häkchen', () => {
  const { onConfirm } = mount();
  expect(find('assign-confirm').props.disabled).toBe(true);
  act(() => find('assign-dog-yam').props.onPress());
  expect(find('assign-confirm').props.disabled).toBe(false);
  act(() => find('assign-confirm').props.onPress());
  expect(onConfirm).toHaveBeenLastCalledWith('yam', true);
  act(() => find('assign-apply-others').props.onPress());   // Häkchen weg → nur diese Fährte
  act(() => find('assign-confirm').props.onPress());
  expect(onConfirm).toHaveBeenLastCalledWith('yam', false);
});

it('ohne andere Fährten kein Häkchen und applyToOthers=false', () => {
  const { onConfirm } = mount({ otherCount: 0 });
  expect(findAll('assign-apply-others')).toHaveLength(0);
  act(() => find('assign-dog-oha').props.onPress());
  act(() => find('assign-confirm').props.onPress());
  expect(onConfirm).toHaveBeenCalledWith('oha', false);
});

it('Hunde nicht ladbar (offline): keine Auswahl, Knopf gesperrt', () => {
  const { onConfirm } = mount({ dogs: [], dogsUnavailable: true });
  expect(find('assign-confirm').props.disabled).toBe(true);
  act(() => find('assign-confirm').props.onPress());
  expect(onConfirm).not.toHaveBeenCalled();
});
