jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { DogDocumentsCard } from '@/components/dogs/DogDocumentsCard';
import type { DogDocument } from '@/components/dogs/types';
import { translate } from '@/i18n';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const DOC: DogDocument = {
  id: 'doc-1', title: 'Impfausweis', category: 'vaccination', fileUrl: 'a/b/c.pdf',
  fileType: 'pdf', issuedOn: null, createdAt: '2026-11-01T10:00:00Z',
};
const DELETE_LABEL = translate('health.uxDeleteAction', { name: DOC.title });

function render(props: Parameters<typeof DogDocumentsCard>[0]): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DogDocumentsCard {...props} />); });
  return node;
}

function button(node: ReactTestRenderer, label: string): ReactTestInstance {
  return node.root.findAllByType(TouchableOpacity).find(b => b.props.accessibilityLabel === label)!;
}

describe('DogDocumentsCard – Papierkorb einzeln ansprechbar', () => {
  // iOS fasst einen Knopf samt allen darin liegenden Elementen zu EINEM
  // Accessibility-Element zusammen. Der Papierkorb darf deshalb nicht im
  // Öffnen-Knopf liegen, sonst ist er für VoiceOver nicht erreichbar.
  it('Papierkorb ist kein Kind des Öffnen-Knopfs', () => {
    const node = render({ documents: [DOC], onOpen: () => {}, onDelete: () => {} });
    const open = button(node, DOC.title);
    const trash = button(node, DELETE_LABEL);
    expect(open).toBeTruthy();
    expect(trash).toBeTruthy();
    expect(open.findAllByType(TouchableOpacity).filter(b => b !== open)).toHaveLength(0);
    expect(open.findAll(n => n === trash)).toHaveLength(0);
  });

  it('Öffnen und Löschen lösen getrennt aus', () => {
    const onOpen = jest.fn();
    const onDelete = jest.fn();
    const node = render({ documents: [DOC], onOpen, onDelete });
    act(() => { button(node, DOC.title).props.onPress(); });
    expect(onOpen).toHaveBeenCalledWith(DOC);
    expect(onDelete).not.toHaveBeenCalled();
    act(() => { button(node, DELETE_LABEL).props.onPress(); });
    expect(onDelete).toHaveBeenCalledWith(DOC);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('ohne onDelete (geteilte Akte) gibt es keinen Papierkorb', () => {
    const node = render({ documents: [DOC], onOpen: () => {} });
    expect(button(node, DELETE_LABEL)).toBeUndefined();
  });
});
