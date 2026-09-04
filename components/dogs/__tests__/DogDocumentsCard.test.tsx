jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DogDocumentsCard } from '@/components/dogs/DogDocumentsCard';
import { translate } from '@/i18n';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DogDocumentsCard documents={[]} onAdd={() => {}} />); });
  return node;
}

function allText(node: ReactTestRenderer): string {
  const nodes = (node.root as unknown as { findAllByType: (t: unknown) => { props: { children: unknown } }[] }).findAllByType(Text);
  return nodes
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((x): x is string => typeof x === 'string')
    .join(' ');
}

describe('DogDocumentsCard', () => {
  it('uses a clean upload CTA without the plus icon in the empty state', () => {
    const node = render();

    expect(allText(node)).toContain(translate('docs.upload'));
    expect(allText(node)).not.toContain(translate('docs.add'));
    const icons = (node.root as unknown as { findAllByType: (t: unknown) => { props: { name?: string } }[] }).findAllByType(Ionicons);
    expect(icons.some(icon => icon.props.name === 'add')).toBe(false);
  });
});
