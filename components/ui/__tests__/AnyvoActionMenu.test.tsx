import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AnyvoActionMenu, actionMenuA11y, type AnyvoMenuAction } from '../AnyvoActionMenu';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

type Found = { props: { onPress: () => void; accessibilityRole?: string; accessibilityLabel?: string } };
function find(node: ReactTestRenderer, props: object): Found[] {
  return (node.root as unknown as { findAllByProps: (p: object) => Found[] }).findAllByProps(props);
}

function setup() {
  const calls: string[] = [];
  const onClose = jest.fn(() => { calls.push('close'); });
  const actions: AnyvoMenuAction[] = [
    { key: 'open', label: 'Öffnen', icon: 'open-outline', onPress: () => { calls.push('open'); } },
    { key: 'delete', label: 'Löschen', icon: 'trash-outline', destructive: true, onPress: () => { calls.push('delete'); } },
  ];
  let node!: ReactTestRenderer;
  act(() => { node = create(<AnyvoActionMenu visible onClose={onClose} title="Balu" actions={actions} />); });
  return { node, calls, actions, onClose };
}

describe('AnyvoActionMenu', () => {
  it('zeigt jeden Punkt als ansagbaren Knopf mit seinem Text', () => {
    const { node } = setup();
    for (const [key, label] of [['open', 'Öffnen'], ['delete', 'Löschen']]) {
      const btn = find(node, { testID: `action-menu-${key}` })[0];
      expect(btn.props.accessibilityRole).toBe('button');
      expect(btn.props.accessibilityLabel).toBe(label);
    }
  });

  it('schliesst zuerst das Menü und führt dann genau die gewählte Aktion aus', () => {
    const { node, calls } = setup();
    act(() => { find(node, { testID: 'action-menu-delete' })[0].props.onPress(); });
    expect(calls).toEqual(['close', 'delete']);
  });

  it('hat einen sichtbaren Schliessen-Knopf, der nichts ausführt', () => {
    const { node, calls } = setup();
    act(() => { find(node, { accessibilityLabel: 'Schließen' })[0].props.onPress(); });
    expect(calls).toEqual(['close']);
  });

  it('actionMenuA11y bietet dieselben Punkte als Bedienhilfen-Aktionen an', () => {
    const { calls, actions } = setup();
    const a11y = actionMenuA11y(actions);
    expect(a11y.accessibilityActions).toEqual([{ name: 'open', label: 'Öffnen' }, { name: 'delete', label: 'Löschen' }]);
    a11y.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } } as never);
    a11y.onAccessibilityAction({ nativeEvent: { actionName: 'unbekannt' } } as never);
    expect(calls).toEqual(['delete']);
  });
});
