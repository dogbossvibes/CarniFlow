import React from 'react';
import { Switch } from 'react-native';
import renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { GroupNotifyCard } from '../GroupNotifyCard';

jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/ui/AnyvoCard', () => ({ AnyvoCard: ({ children }: { children: React.ReactNode }) => children }));

const all = { joinRequests: true, trackReady: true, trackSearched: false, trainingStarted: false, evaluationShared: true };
type Service = NonNullable<React.ComponentProps<typeof GroupNotifyCard>['service']>;
const service = (get: Service['get']): Service => ({ get, set: jest.fn(async patch => ({ ...all, ...patch })) }) as unknown as Service;
const switches = (tree: ReactTestRenderer) => tree.root.findAllByType(Switch);
let tree: ReactTestRenderer;
afterEach(() => { act(() => tree.unmount()); });

it('zeigt die Schalter erst nach der Server-Antwort', async () => {
  await act(async () => { tree = renderer.create(<GroupNotifyCard service={service(async () => all)} />); });
  expect(switches(tree)).toHaveLength(5);
  expect(switches(tree).map(s => s.props.value)).toEqual([true, true, false, true, false]);
});

it('zeigt nach einem Dienstwechsel keine Schalter des vorigen Kontos', async () => {
  await act(async () => { tree = renderer.create(<GroupNotifyCard service={service(async () => all)} />); });
  expect(switches(tree)).toHaveLength(5);
  // Neuer Dienst, dessen Antwort ausbleibt: die alten Schalter dürfen nicht stehen bleiben.
  await act(async () => { tree.update(<GroupNotifyCard service={service(() => new Promise(() => {}))} />); });
  expect(switches(tree)).toHaveLength(0);
  await act(async () => { tree.update(<GroupNotifyCard service={null} />); });
  expect(switches(tree)).toHaveLength(0);
});
