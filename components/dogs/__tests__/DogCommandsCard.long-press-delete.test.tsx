// ANYVO-wide long-press-delete standardization (29.09.2026): commands were
// found to be an "A" candidate — the list card (this component) had a normal
// tap to open/edit but NO delete affordance at all (unlike DogHeatCard/
// DogDocumentsCard/JournalCard, which already had an explicit trash icon).
// Added onLongPress (delayLongPress=350, the established ANYVO convention)
// calling the caller's onDelete — reusing the exact same deleteCommand
// service the command detail screen's own delete button already used
// (app/dog-command/detail.tsx). No ownership gating is needed: commands are
// stored purely in local AsyncStorage per dog_id (features/dogs/
// dogCommands.ts) — no Supabase table, no RLS, no cross-device data to gate.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { DogCommandsCard } from '@/components/dogs/DogCommandsCard';
import type { DogCommand } from '@/features/dogs/dogCommands';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const SIT: DogCommand = {
  id: 'cmd-1', dogId: 'dog-1', name: 'Sitz', category: 'sport', area: null,
  verbalCue: 'Sitz', handSignal: null, goal: null, description: null,
  steps: [], tips: [], commonMistakes: [], videoUrl: null, audioUrl: null,
  difficulty: 'easy', isFavorite: false, lastUsedAt: null, usageCount: 0,
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z',
};

function render(props: Partial<Parameters<typeof DogCommandsCard>[0]> = {}): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => {
    node = TestRenderer.create(
      <DogCommandsCard commands={[SIT]} onAdd={() => {}} onOpen={() => {}} onToggleFavorite={() => {}} {...props} />,
    );
  });
  return node;
}

function findRow(node: ReactTestRenderer) {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { onPress?: () => void; onLongPress?: () => void; accessibilityLabel?: string } }[] })
    .findAllByType(TouchableOpacity).find((c) => typeof c.props.accessibilityLabel === 'string' && c.props.accessibilityLabel.includes('lange drücken zum Löschen'));
}

describe('DogCommandsCard — long-press delete', () => {
  it('no onDelete passed → no long-press-delete affordance at all', () => {
    const node = render();
    expect(findRow(node)).toBeUndefined();
  });

  it('onDelete passed → the command row exposes onLongPress', () => {
    const node = render({ onDelete: jest.fn() });
    const row = findRow(node);
    expect(row).toBeTruthy();
    expect(typeof row!.props.onLongPress).toBe('function');
  });

  it('long press calls onDelete with the exact command', () => {
    const onDelete = jest.fn();
    const node = render({ onDelete });
    act(() => { findRow(node)!.props.onLongPress?.(); });
    expect(onDelete).toHaveBeenCalledWith(SIT);
  });

  it('normal tap still opens the command, unaffected by onDelete being present', () => {
    const onOpen = jest.fn();
    const node = render({ onOpen, onDelete: jest.fn() });
    act(() => { findRow(node)!.props.onPress?.(); });
    expect(onOpen).toHaveBeenCalledWith(SIT);
  });
});
