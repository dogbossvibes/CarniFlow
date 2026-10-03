// RC-Fix "Backpack Gegenstand hinzufügen" — Tastatur/Input-Sichtbarkeit.
// Root Cause: a child KeyboardAvoidingView never moved the absolutely
// bottom-anchored shared sheet. The editor now opts into outer sheet avoidance.
// The actual on-device keyboard-avoidance
// behavior (does the sheet visually stay above the keyboard on a real
// iPhone) cannot be reliably asserted by a JS unit test — that part requires
// manual device verification (documented in the final report). This suite
// covers everything that IS reliably testable: the modal opens, the input
// accepts and retains text, validation still works, a valid submit adds
// exactly once (no duplicate from keyboard-submit + button-submit), and
// Backpack remains available for every plan.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { readFileSync } from 'fs';
import { Alert, Text, TextInput } from 'react-native';
import DogBackpackScreen from '@/app/dog-backpack/[id]';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { BackpackLimitError } from '@/features/dogs/backpack';

const mockGetBackpack = jest.fn();
const mockAddItem = jest.fn();
const mockUpdateItem = jest.fn();

jest.mock('expo-router', () => {
  // Real useFocusEffect only re-runs on focus, not on every render — a naive
  // `(cb) => cb()` here would re-invoke reload() (and its async .then) on
  // every re-render, leaking unwrapped state updates past the test that
  // triggered them. useEffect with an empty dep array mirrors "runs once on
  // mount", which is enough for these tests (focus doesn't change here).
  const { useEffect } = require('react');
  return {
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
    useLocalSearchParams: () => ({ id: 'dog-1', name: 'Rex', openAdd: '1' }),
    useFocusEffect: (cb: () => void) => { useEffect(() => { cb(); }, []); },
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@/lib/session-context', () => ({ useSession: () => ({ user: { id: 'owner-1' } }) }));
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isPro: false, loading: false }) }));
jest.mock('@/lib/haptics', () => ({ haptic: { light: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/features/dogs/backpack', () => {
  const actual = jest.requireActual('@/features/dogs/backpack');
  return {
    ...actual,
    getBackpack: (...a: unknown[]) => mockGetBackpack(...a),
    addItem: (...a: unknown[]) => mockAddItem(...a),
    updateItem: (...a: unknown[]) => mockUpdateItem(...a),
    deleteItem: jest.fn(),
    setActive: jest.fn(),
    togglePacked: jest.fn(),
    moveItem: jest.fn(),
    resetPacked: jest.fn(),
  };
});

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DogBackpackScreen />); });
  return node;
}

function labelInput(node: ReactTestRenderer) {
  return (node.root as unknown as {
    findAllByType: (t: unknown) => { props: { placeholder?: string; value: string; onChangeText: (v: string) => void; onSubmitEditing: () => void } }[];
  }).findAllByType(TextInput).find((i) => i.props.placeholder === 'backpack.labelPlaceholder')!;
}

function strings(node: ReactTestRenderer): string[] {
  return (node.root as unknown as {
    findAllByType: (type: unknown) => { props: { children: unknown } }[];
  }).findAllByType(Text)
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c): c is string => typeof c === 'string');
}

function findByText(node: ReactTestRenderer, text: string) {
  return (node.root as unknown as {
    findAll: (p: (c: { props: { onPress?: () => void }; findAllByType: (t: unknown) => { props: { children: unknown } }[] }) => boolean) => { props: { onPress: () => void } }[];
  }).findAll((c) => typeof c.props.onPress === 'function' && c.findAllByType(Text).some((t) => t.props.children === text))[0];
}

describe('Backpack "Gegenstand hinzufügen": modal, input, validation, submit', () => {
  beforeEach(() => {
    mockGetBackpack.mockReset().mockResolvedValue([]);
    mockAddItem.mockReset().mockResolvedValue({ id: 'item-1' });
    mockUpdateItem.mockReset().mockResolvedValue({ id: 'item-1' });
  });

  it('opens the editor sheet (openAdd param) with the Bezeichnung input rendered', async () => {
    const node = await (async () => { const n = render(); await act(async () => { await Promise.resolve(); }); return n; })();
    expect(labelInput(node)).toBeTruthy();
  });

  it('input accepts typed text and keeps it in state', async () => {
    const node = render();
    await act(async () => { await Promise.resolve(); });
    act(() => { labelInput(node).props.onChangeText('Leine'); });
    expect(labelInput(node).props.value).toBe('Leine');
  });

  it('empty submit shows validation, does not call addItem', async () => {
    const node = render();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await findByText(node, 'backpack.add').props.onPress(); });
    expect(mockAddItem).not.toHaveBeenCalled();
    expect(strings(node)).toContain('backpack.emptyLabelError');
  });

  it('typing after a validation error clears it', async () => {
    const node = render();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await findByText(node, 'backpack.add').props.onPress(); });
    expect(strings(node)).toContain('backpack.emptyLabelError');
    act(() => { labelInput(node).props.onChangeText('Leine'); });
    expect(strings(node)).not.toContain('backpack.emptyLabelError');
  });

  it('valid submit via the button adds exactly once and closes the editor', async () => {
    const node = render();
    await act(async () => { await Promise.resolve(); });
    act(() => { labelInput(node).props.onChangeText('Leine'); });
    await act(async () => { await findByText(node, 'backpack.add').props.onPress(); });
    expect(mockAddItem).toHaveBeenCalledTimes(1);
    expect(mockAddItem).toHaveBeenCalledWith('owner-1', 'dog-1', { label: 'Leine', category: undefined }, { isPro: false });
  });

  it('zeigt beim Limit die ACTIVE-Upgrade-Meldung', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockAddItem.mockRejectedValueOnce(new BackpackLimitError());
    const node = render();
    await act(async () => { await Promise.resolve(); });
    act(() => { labelInput(node).props.onChangeText('Napf'); });
    await act(async () => { await findByText(node, 'backpack.add').props.onPress(); });
    expect(alert).toHaveBeenCalledWith('backpack.limitTitle', 'backpack.limitBody', expect.arrayContaining([
      expect.objectContaining({ text: 'common.cancel' }),
      expect.objectContaining({ text: 'backpack.viewActive' }),
    ]));
    alert.mockRestore();
  });

  it('keyboard submit (onSubmitEditing) and the Hinzufügen button firing for the same intent never duplicate the item', async () => {
    const node = render();
    await act(async () => { await Promise.resolve(); });
    act(() => { labelInput(node).props.onChangeText('Leine'); });
    // Simulates the keyboard "Done" action and a near-simultaneous tap on
    // "Hinzufügen" for the same submit intent — the re-entrancy guard in
    // submitEditor must ensure only one addItem call survives.
    await act(async () => {
      await Promise.all([
        labelInput(node).props.onSubmitEditing(),
        findByText(node, 'backpack.add').props.onPress(),
      ]);
    });
    expect(mockAddItem).toHaveBeenCalledTimes(1);
  });

  it('typed text survives selecting a category (state not reset by chip selection)', async () => {
    const node = render();
    await act(async () => { await Promise.resolve(); });
    act(() => { labelInput(node).props.onChangeText('Leine'); });
    // "backpack.cat.faehrte" is CATEGORY_I18N_KEY.faehrte; the i18n mock
    // returns the key itself as the chip's rendered label.
    act(() => { findByText(node, 'backpack.cat.faehrte').props.onPress(); });
    expect(labelInput(node).props.value).toBe('Leine');
  });
});

describe('Backpack: available for every plan with a NEWBIE item limit', () => {
  const content = readFileSync('app/dog-backpack/[id].tsx', 'utf8');
  it('passes effective premium access to the domain service', () => {
    expect(content).toContain('useCapabilities()');
    expect(content).toContain('{ isPro }');
  });
});

describe('Backpack editor sheet: keyboard-aware layout structure', () => {
  const content = readFileSync('app/dog-backpack/[id].tsx', 'utf8');
  it('opts in only the editor; the Backpack action and suggestion sheets keep the default', async () => {
    const node = render();
    await act(async () => { await Promise.resolve(); });
    const sheets = (node.root as unknown as {
      findAll: (predicate: (instance: { type: unknown }) => boolean) => { props: { keyboardAware?: boolean } }[];
    }).findAll((instance) => instance.type === AnyvoBottomSheet);
    expect(sheets).toHaveLength(3);
    expect(sheets[0].props.keyboardAware).toBe(true);
    expect(sheets[1].props.keyboardAware).toBeUndefined();
    expect(sheets[2].props.keyboardAware).toBeUndefined();
  });
  it('removes the inner keyboard offset and lets the content shrink inside the outer sheet', () => {
    expect(content).not.toMatch(/<KeyboardAvoidingView/);
    expect(content).toMatch(/editorScroll: \{ flexShrink: 1 \}/);
    expect(content).toMatch(/<View style=\{s\.editorFooter\}>/);
  });
  it('keyboardShouldPersistTaps="handled" so chip/button taps work while the keyboard is open', () => {
    expect(content).toMatch(/keyboardShouldPersistTaps="handled"/);
  });
  it('iOS interactive keyboard dismissal is not preempted by an immediate dismiss', () => {
    expect(content).toMatch(/keyboardDismissMode=\{Platform\.OS === 'ios' \? 'interactive' : 'on-drag'\}/);
    expect(content).not.toMatch(/onScrollBeginDrag=\{Keyboard\.dismiss\}/);
    expect(content).toMatch(/Keyboard\.dismiss\(\)/);
  });
  it('returnKeyType="done" submits via onSubmitEditing', () => {
    expect(content).toMatch(/returnKeyType="done"/);
    expect(content).toMatch(/onSubmitEditing=\{submitEditor\}/);
  });
});
