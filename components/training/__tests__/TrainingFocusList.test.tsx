import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { TrainingFocusList } from '../TrainingFocusList';
import type { TrainingFocus } from '@/features/training/documentation/focus';

const mockRead = jest.fn(); const mockStatus = jest.fn(); const mockText = jest.fn(); const mockChanged = jest.fn();
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/features/training/documentation/focus', () => ({
  readTrainingFocuses: (...args: unknown[]) => mockRead(...args),
  setTrainingFocusStatus: (...args: unknown[]) => mockStatus(...args),
  setTrainingFocusText: (...args: unknown[]) => mockText(...args),
}));
const focus: TrainingFocus = { id: 'f1', dogId: 'dog-a', discipline: 'Obedience', originUnitId: 'unit-a',
  originDate: '2026-10-14', originText: 'Original target', text: 'Current target', status: 'open' };
type TestItem = { props: { children?: unknown; onPress?: () => void }; findAllByType: (type: unknown) => TestItem[] };
let node: ReactTestRenderer;
const root = () => node.root as unknown as TestItem;
async function show(owner: string, sources?: ReadonlySet<string>) {
  await act(async () => {
    const element = <TrainingFocusList ownerId={owner} onChange={mockChanged} availableUnitIds={sources} onOpenSource={jest.fn()} />;
    if (node) (node as unknown as { update: (element: React.ReactElement) => void }).update(element); else node = TestRenderer.create(element);
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockImplementation(async (owner: string) => owner === 'owner-a' ? [focus] : []);
  mockStatus.mockResolvedValue(undefined); mockText.mockResolvedValue(undefined);
});
afterEach(() => { act(() => { node?.unmount(); }); node = undefined as unknown as ReactTestRenderer; });
test('an old status completion cannot act after owner A to B to A in the same mounted component', async () => {
  let resolve!: () => void;
  mockStatus.mockReturnValue(new Promise<void>(done => { resolve = done; }));
  await show('owner-a');
  const doneButton = root().findAllByType(TouchableOpacity).find(b => b.findAllByType(Text).some(t => t.props.children === 'trainingDoc.focusDone'))!;
  act(() => { doneButton.props.onPress!(); });
  const isCurrent = mockStatus.mock.calls[0][3] as () => boolean;
  expect(isCurrent()).toBe(true);
  await show('owner-b'); await show('owner-a');
  expect(isCurrent()).toBe(false);
  await act(async () => { resolve(); await Promise.resolve(); });
  expect(mockChanged).not.toHaveBeenCalled();
  const currentDone = root().findAllByType(TouchableOpacity).find(b => b.findAllByType(Text).some(t => t.props.children === 'trainingDoc.focusDone'))!;
  expect((currentDone.props as { disabled?: boolean }).disabled).toBe(false);
});
test('missing source rows retain their snapshot and never expose a broken open-source action', async () => {
  await show('owner-a', new Set());
  const text = root().findAllByType(Text).flatMap(t => Array.isArray(t.props.children) ? t.props.children : [t.props.children]);
  expect(text).toContain('trainingDoc.sourceUnavailable'); expect(text).toContain('Current target');
  expect(text).not.toContain('trainingDoc.openHistory');
});
