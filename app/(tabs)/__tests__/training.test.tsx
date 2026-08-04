import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import TrainingScreen from '@/app/(tabs)/training';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';

const mockPush = jest.fn();
let mockCurrentLabels: Record<string, string> = {};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('@/components/ui/AnimatedPressable', () => {
  const { Pressable: RNPressable } = jest.requireActual('react-native');
  return {
    AnimatedPressable: ({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: unknown }) => (
      <RNPressable testID="trainingCard" onPress={onPress} style={style}>{children}</RNPressable>
    ),
  };
});

jest.mock('@/components/training/HeroImage', () => {
  const { View } = jest.requireActual('react-native');
  return { HeroImage: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('@/i18n', () => ({
  useT: () => ({ t: (key: string) => mockCurrentLabels[key] ?? key }),
}));

type CardInstance = { props: { onPress?: () => void } };

function render(labels: Record<string, string>): ReactTestRenderer {
  mockCurrentLabels = labels;
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<TrainingScreen />); });
  return node;
}

function allStrings(node: ReactTestRenderer): string[] {
  const texts = (node.root as unknown as { findAllByType: (t: unknown) => { props: { children: unknown } }[] }).findAllByType(Text);
  return texts
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((x): x is string => typeof x === 'string');
}

function cards(node: ReactTestRenderer): CardInstance[] {
  return (node.root as unknown as { findAll: (pred: (n: { props: { testID?: string; onPress?: () => void } }) => boolean) => CardInstance[] })
    .findAll((n) => n.props.testID === 'trainingCard');
}

function textOf(card: CardInstance): string {
  const texts = (card as unknown as { findAllByType: (t: unknown) => { props: { children: unknown } }[] }).findAllByType(Text);
  return texts
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((x): x is string => typeof x === 'string')
    .join(' ');
}

function pressableTexts(node: ReactTestRenderer): string[] {
  return Array.from(new Set(cards(node).map(textOf)));
}

function cardContaining(node: ReactTestRenderer, needle: string): CardInstance | undefined {
  return cards(node).find((card) => textOf(card).includes(needle));
}

describe('Training-Tab — Trainingstagebuch-Karte', () => {
  beforeEach(() => { mockPush.mockReset(); });

  it('zeigt die Karte sichtbar (DE)', () => {
    const node = render(deCH as unknown as Record<string, string>);
    const s = allStrings(node);
    expect(s).toContain(deCH['training.journal']);
    expect(s).toContain(deCH['training.journalSub']);
  });

  it('korrekte Position: zwischen "Training dokumentieren" und "Fährte (GPS)"', () => {
    const node = render(deCH as unknown as Record<string, string>);
    const texts = pressableTexts(node);
    const idx = texts.findIndex((t) => t.includes(deCH['training.journal']));
    expect(idx).toBeGreaterThan(-1);
    expect(texts[idx - 1]).toContain(deCH['training.document']);
    expect(texts[idx + 1]).toContain(deCH['training.faehrteGps']);
  });

  it('Navigation öffnet /training-journal', () => {
    const node = render(deCH as unknown as Record<string, string>);
    const journalCard = cardContaining(node, deCH['training.journal']);
    expect(journalCard).toBeDefined();
    act(() => { journalCard?.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/training-journal');
  });

  it.each([
    ['DE', deCH as unknown as Record<string, string>],
    ['gsw-CH', gswCH as unknown as Record<string, string>],
    ['FR', fr as unknown as Record<string, string>],
  ])('zeigt korrekte Übersetzung (%s) ohne rohe Keys', (_label, labels) => {
    const node = render(labels);
    const s = allStrings(node);
    expect(s).toContain(labels['training.journal']);
    expect(s).toContain(labels['training.journalSub']);
    const rawKeys = s.filter((x) => /^[a-z]+\.(?:[a-zA-Z0-9]+\.?)+$/.test(x));
    expect(rawKeys).toEqual([]);
  });
});
