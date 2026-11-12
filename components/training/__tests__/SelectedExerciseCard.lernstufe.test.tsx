import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { SelectedExerciseCard } from '../SelectedExerciseCard';

jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/lib/haptics', () => ({ tapHaptic: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

type Props = React.ComponentProps<typeof SelectedExerciseCard>;

function render(props: Partial<Props>, onRatingChange = jest.fn()) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <SelectedExerciseCard name="Fusslaufen" accentColor="#00aa88" rating={null} notes={null}
        onRatingChange={onRatingChange} onNotesChange={jest.fn()} onRemove={jest.fn()} {...props} />,
    );
  });
  return { tree, onRatingChange };
}
const byLabel = (tree: ReactTestRenderer, label: string) =>
  tree.root.findAllByType(TouchableOpacity).filter(node => node.props.accessibilityLabel === label);
const radios = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TouchableOpacity).filter(node => node.props.accessibilityRole === 'radio');
const stars = (tree: ReactTestRenderer) =>
  tree.root.findAllByType(TouchableOpacity).filter(node => typeof node.props.accessibilityLabel === 'string'
    && node.props.accessibilityLabel.includes('training.exerciseRatingA11y'));

describe('SelectedExerciseCard – Lernstufe auf der Build-57-Linie', () => {
  test('als Lernstufe markierte Übung zeigt vier Lernstufen und keine Sterne', () => {
    const { tree } = render({ rating: 4, ratingScale: 'lernstufe' });
    expect(radios(tree)).toHaveLength(4);
    expect(stars(tree)).toHaveLength(0);
    const active = radios(tree).filter(node => node.props.accessibilityState?.checked);
    expect(active).toHaveLength(1);
    expect(active[0].props.accessibilityLabel).toBe('Fusslaufen: trainingLevel.festigen');
  });

  test('Auswahl schreibt nur die erlaubten Werte 1/2/4/5, nie 3', () => {
    const { tree, onRatingChange } = render({ rating: null, ratingScale: 'lernstufe' });
    for (const level of ['neu', 'lernen', 'festigen', 'sitzt']) {
      act(() => { byLabel(tree, `Fusslaufen: trainingLevel.${level}`)[0].props.onPress(); });
    }
    expect(onRatingChange.mock.calls.map(call => call[0])).toEqual([1, 2, 4, 5]);
  });

  test('erneutes Antippen der aktiven Lernstufe setzt die Bewertung zurück', () => {
    const { tree, onRatingChange } = render({ rating: 5, ratingScale: 'lernstufe' });
    act(() => { byLabel(tree, 'Fusslaufen: trainingLevel.sitzt')[0].props.onPress(); });
    expect(onRatingChange).toHaveBeenCalledWith(null);
  });

  test('Übung ohne Markierung behält die fünf Sterne unverändert', () => {
    const { tree, onRatingChange } = render({ rating: 3, ratingScale: null });
    expect(radios(tree)).toHaveLength(0);
    expect(stars(tree)).toHaveLength(5);
    act(() => { stars(tree)[3].props.onPress(); });
    expect(onRatingChange).toHaveBeenCalledWith(4);
  });

  test('fehlende Markierung (ältere Entwürfe) gilt als Sterne', () => {
    const { tree } = render({ rating: 4 });
    expect(radios(tree)).toHaveLength(0);
    expect(stars(tree)).toHaveLength(5);
  });

  test('letzter Stand zeigt eine Lernstufe als Text, alte Sterne als x/5', () => {
    const text = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());
    const level = render({ historical: { date: '2026-11-10', rating: 2, ratingScale: 'lernstufe', notes: null, onOpen: jest.fn() } });
    expect(text(level.tree)).toContain('trainingLevel.lernen');
    expect(text(level.tree)).not.toContain('["2/5"]');
    const legacy = render({ historical: { date: '2026-11-10', rating: 2, ratingScale: null, notes: null, onOpen: jest.fn() } });
    expect(text(legacy.tree)).toContain('["2/5"]');
    expect(text(legacy.tree)).not.toContain('trainingLevel.lernen');
  });
});
