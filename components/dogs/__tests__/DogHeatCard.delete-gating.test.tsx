// ANYVO-wide long-press-delete standardization audit (29.09.2026): DogHeatCard
// (the dog Hub preview widget) already had an explicit, always-visible trash
// icon per history row — classified "B, already equivalent" and left as-is.
// The gap found was one level up: app/dog/[id].tsx passed `onDelete:
// deleteHeat` unconditionally, so the trash icon rendered even for a viewer
// who cannot actually delete (dog_heat_cycles RLS grants DELETE to the owner
// only). The fix is `onDelete: isHeatOwner ? deleteHeat : undefined` — these
// tests verify DogHeatCard's own contract: it must show the trash icon only
// when a caller actually passes onDelete, and never otherwise.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { DogHeatCard } from '@/components/dogs/DogHeatCard';
import type { HeatCycle } from '@/features/dogs/heatCycles';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
// heatCycles.ts (imported by DogHeatCard for its pure date/duration helpers)
// imports lib/supabase at module scope, which fail-closes without
// EXPO_PUBLIC_BACKEND_ENV in this bare test env — irrelevant to this
// component-level test, so it's mocked away.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const CYCLE: HeatCycle = { id: 'cyc-1', dogId: 'dog-1', startDate: '2026-08-12', endDate: '2026-09-01', status: 'completed', notes: null, phase: null, createdAt: '2026-08-12T00:00:00Z' };

function render(props: Partial<Parameters<typeof DogHeatCard>[0]> = {}): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => {
    node = TestRenderer.create(
      <DogHeatCard cycles={[CYCLE]} prediction={null} onAdd={() => {}} onOpen={() => {}} {...props} />,
    );
  });
  return node;
}

function trashButtons(node: ReactTestRenderer) {
  return (node.root as unknown as { findAllByType: (t: unknown) => { props: { hitSlop?: number; onPress?: () => void } }[] })
    .findAllByType(TouchableOpacity).filter((c) => c.props.hitSlop === 8 && typeof c.props.onPress === 'function');
}

describe('DogHeatCard — delete affordance follows the onDelete prop (ownership gating happens in the parent)', () => {
  it('no onDelete passed (non-owner) → no trash icon rendered at all', () => {
    const node = render();
    expect(trashButtons(node)).toHaveLength(0);
  });

  it('onDelete passed (owner) → trash icon rendered', () => {
    const onDelete = jest.fn();
    const node = render({ onDelete });
    expect(trashButtons(node)).toHaveLength(1);
  });

  it('tapping the trash icon calls onDelete with the exact cycle', () => {
    const onDelete = jest.fn();
    const node = render({ onDelete });
    act(() => { trashButtons(node)[0].props.onPress?.(); });
    expect(onDelete).toHaveBeenCalledWith(CYCLE);
  });

  it('tapping the card itself still opens it — unaffected by whether onDelete is present', () => {
    const onOpen = jest.fn();
    const node = render({ onOpen, onDelete: jest.fn() });
    const cards = (node.root as unknown as { findAllByType: (t: unknown) => { props: { onPress?: () => void; disabled?: boolean } }[] })
      .findAllByType(TouchableOpacity).filter((c) => c.props.disabled === false);
    act(() => { cards[0].props.onPress?.(); });
    expect(onOpen).toHaveBeenCalledWith(CYCLE);
  });
});
