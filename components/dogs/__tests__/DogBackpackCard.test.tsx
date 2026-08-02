jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { DogBackpackCard } from '@/components/dogs/DogBackpackCard';
import { translate } from '@/i18n';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

// Alle String-Fragmente aller <Text>-Knoten einsammeln (auch verkettete Kinder).
function allText(node: ReactTestRenderer): string {
  const nodes = (node.root as unknown as { findAllByType: (t: unknown) => { props: { children: unknown } }[] }).findAllByType(Text);
  return nodes
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((x): x is string => typeof x === 'string')
    .join(' ');
}

function render(props: Parameters<typeof DogBackpackCard>[0]): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DogBackpackCard {...props} />); });
  return node;
}

describe('DogBackpackCard', () => {
  it('1) leerer Rucksack: zeigt Titel, Leertext und Einrichten-CTA', () => {
    const node = render({ dogName: 'Malu', total: 0, active: 0, packed: 0, onOpen: () => {} });
    const text = allText(node);
    expect(text).toContain(translate('backpack.title'));
    expect(text).toContain(translate('backpack.emptyText'));
    expect(text).toContain(translate('backpack.emptySetup'));
  });

  it('2) befüllter Rucksack: zeigt Hundenamen, aktive Gegenstände + Packstatus', () => {
    const node = render({ dogName: 'Malu', total: 8, active: 5, packed: 3, onOpen: () => {} });
    const text = allText(node);
    expect(text).toContain(translate('backpack.ownTitle', { name: 'Malu' }));
    expect(text).toContain(translate('backpack.activeItems', { count: 5 }));
    expect(text).toContain(translate('backpack.packedSummary', { packed: 3, total: 5 }));
    expect(text).toContain(translate('backpack.view'));
  });

  it('2b) alles eingepackt → „Alles bereit"; nichts → „Noch nichts eingepackt"', () => {
    const ready = allText(render({ dogName: 'Malu', total: 5, active: 5, packed: 5, onOpen: () => {} }));
    expect(ready).toContain(translate('backpack.allReady'));
    const none = allText(render({ dogName: 'Malu', total: 5, active: 5, packed: 0, onOpen: () => {} }));
    expect(none).toContain(translate('backpack.nonePacked'));
  });

  it('3) ganze Card ist tappbar → onOpen', () => {
    const onOpen = jest.fn();
    const node = render({ dogName: 'Malu', total: 2, active: 2, packed: 0, onOpen });
    act(() => { node.root.findByType(TouchableOpacity).props.onPress(); });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('4) Accessibility: Button-Rolle + Label + Hint gesetzt', () => {
    const node = render({ dogName: 'Malu', total: 0, active: 0, packed: 0, onOpen: () => {} });
    const btn = node.root.findByType(TouchableOpacity);
    expect(btn.props.accessibilityRole).toBe('button');
    expect(typeof btn.props.accessibilityLabel).toBe('string');
    expect(btn.props.accessibilityLabel.length).toBeGreaterThan(0);
    expect(btn.props.accessibilityHint).toBe(translate('backpack.emptySetup'));
  });
});
