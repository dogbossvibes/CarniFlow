import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';
import {
  DEFAULT_HOME_CONFIG,
  DEFAULT_FAB_ACTION,
  HOME_FAB_ACTIONS_META,
  type HomeFabActionId,
  type HomeScreenConfig,
} from '@/stores/homeScreenConfig';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockPush = jest.fn();
let mockLabels: Record<string, string> = {};
let mockConfig: HomeScreenConfig = { ...DEFAULT_HOME_CONFIG };
let mockDogs: { id: string; name: string }[] = [];
let mockIsPro = false;
const mockSetConfig = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ bottom: 0, top: 0, left: 0, right: 0 }),
  };
});

jest.mock('@/hooks/useFabBottom', () => ({
  useFabBottom: () => 100,
  useFloatingBottomInset: () => 100,
}));

jest.mock('@/stores/activeTraining', () => ({ useActiveTraining: () => ({ unitId: null }) }));

jest.mock('@/hooks/useSession', () => ({
  useSession: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } } }),
}));

jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isPro: mockIsPro }) }));

jest.mock('@/hooks/useDogs', () => ({
  useDogs: () => ({ dogs: mockDogs, loading: false, refresh: jest.fn() }),
}));

jest.mock('@/stores/homeScreenConfig', () => {
  const actual = jest.requireActual('@/stores/homeScreenConfig');
  return {
    ...actual,
    useHomeScreenConfig: () => mockConfig,
    setHomeScreenConfig: (next: HomeScreenConfig) => mockSetConfig(next),
  };
});

jest.mock('@/i18n', () => ({
  useT: () => ({ t: (key: string) => mockLabels[key] ?? key, locale: 'de-CH' }),
}));

// react-test-renderer unter React 19 hat nur eine minimale Typdeklaration
// (react-test-renderer.d.ts). Diese Hilfstypen spiegeln die Laufzeit-API.
type TestInstance = {
  props: Record<string, any>;
  type: unknown;
  findAll: (predicate: (n: TestInstance) => boolean) => TestInstance[];
  findAllByType: (type: unknown) => TestInstance[];
};
type Node = TestInstance;

function inst(node: ReactTestRenderer): TestInstance {
  return node.root as unknown as TestInstance;
}

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<QuickAddSheet personalized />); });
  return node;
}

function allStrings(node: ReactTestRenderer): string[] {
  const texts = inst(node).findAllByType(Text);
  return texts
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((x): x is string => typeof x === 'string');
}

// Der FAB ist die einzige TouchableOpacity mit onPress UND onLongPress
// (TouchableOpacity wird als forwardRef gerendert → mehrere Knoten mit den
// gleichen Props; findAllByType matcht nur das Element selbst).
function fab(node: ReactTestRenderer): Node {
  const found = inst(node)
    .findAllByType(TouchableOpacity)
    .filter((n) => typeof n.props.onPress === 'function' && typeof n.props.onLongPress === 'function');
  expect(found.length).toBe(1);
  return found[0];
}

function iconNames(node: ReactTestRenderer): string[] {
  return inst(node)
    .findAll((n) => n.type === 'Ionicons')
    .map((n) => String(n.props.name));
}

function rowWithLabel(node: ReactTestRenderer, label: string): Node | undefined {
  return inst(node).findAll(
    (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  )[0];
}

function setup(labels: Record<string, string>, config?: Partial<HomeScreenConfig>) {
  mockLabels = labels;
  mockConfig = { ...DEFAULT_HOME_CONFIG, ...config };
  mockSetConfig.mockReset();
  mockPush.mockReset();
}

const SIMPLE_ROUTE_ACTIONS: { id: HomeFabActionId; route: string }[] = [
  { id: 'start_training', route: '/unit/start' },
  { id: 'document_training', route: '/unit/document' },
  { id: 'training_journal', route: '/training-journal' },
  { id: 'start_track', route: '/track' },
  { id: 'create_appointment', route: '/training-hub' },
];

describe('QuickAddSheet (personalisierter FAB)', () => {
  beforeEach(() => { mockDogs = []; mockIsPro = false; });

  it('1) Default = Termin erstellen (Label + Route)', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    const label = deCH['fab.actionCreateAppointment'];
    expect(fab(node).props.accessibilityLabel).toBe(label);
    act(() => { fab(node).props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/training-hub');
  });

  it('2) korrektes Icon pro Aktion', () => {
    for (const id of SIMPLE_ROUTE_ACTIONS.map(a => a.id)) {
      setup(deCH as unknown as Record<string, string>, { fabActionId: id });
      const node = render();
      expect(iconNames(node)).toContain(HOME_FAB_ACTIONS_META[id]?.icon);
    }
  });

  it('3) kurzer Tipp führt die gewählte Aktion direkt aus', () => {
    for (const { id, route } of SIMPLE_ROUTE_ACTIONS) {
      setup(deCH as unknown as Record<string, string>, { fabActionId: id });
      const node = render();
      act(() => { fab(node).props.onPress?.(); });
      expect(mockPush).toHaveBeenCalledWith(route);
    }
  });

  it('4) langer Tipp öffnet den Auswahl-Dialog', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    act(() => { fab(node).props.onLongPress?.(); });
    const s = allStrings(node);
    expect(s).toContain(deCH['fab.selectTitle']);
    expect(s).toContain(deCH['fab.actionCreateAppointment']); // aktuelle Auswahl gelistet
    expect(s).toContain(deCH['fab.hide']);                      // „Button ausblenden"
  });

  it('5) Auswahl über den Dialog wird gespeichert', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    act(() => { fab(node).props.onLongPress?.(); });
    const trainingRow = rowWithLabel(node, deCH['fab.actionStartTraining']);
    expect(trainingRow).toBeDefined();
    act(() => { trainingRow?.props.onPress?.(); });
    expect(mockSetConfig).toHaveBeenCalledWith(expect.objectContaining({ fabActionId: 'start_training' }));
  });

  it('6) „Button ausblenden" speichert fabVisible=false', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    act(() => { fab(node).props.onLongPress?.(); });
    const hideRow = rowWithLabel(node, deCH['fab.hide']);
    act(() => { hideRow?.props.onPress?.(); });
    expect(mockSetConfig).toHaveBeenCalledWith(expect.objectContaining({ fabVisible: false }));
  });

  it('7) Button ausblenden → kein leerer Platzhalter', () => {
    setup(deCH as unknown as Record<string, string>, { fabVisible: false });
    const node = render();
    expect(inst(node).findAll((n) => n.props.accessibilityRole === 'button')).toHaveLength(0);
  });

  it('8) Aktion hidden → kein Button', () => {
    setup(deCH as unknown as Record<string, string>, { fabActionId: 'hidden' });
    const node = render();
    expect(inst(node).findAll((n) => n.props.accessibilityRole === 'button')).toHaveLength(0);
  });

  it('15) Übersetzung (DE) ohne sichtbare i18n-Keys', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    expect(fab(node).props.accessibilityLabel).toBe(deCH['fab.actionCreateAppointment']);
    act(() => { fab(node).props.onLongPress?.(); });
    const s = allStrings(node);
    const rawKeys = s.filter((x) => /^[a-z]+\.(?:[a-zA-Z0-9]+\.?)+$/.test(x));
    expect(rawKeys).toEqual([]);
  });

  it('15) Übersetzung (gsw-CH) ohne sichtbare i18n-Keys', () => {
    setup(gswCH as unknown as Record<string, string>);
    const node = render();
    expect(fab(node).props.accessibilityLabel).toBe(gswCH['fab.actionCreateAppointment']);
    act(() => { fab(node).props.onLongPress?.(); });
    const s = allStrings(node);
    const rawKeys = s.filter((x) => /^[a-z]+\.(?:[a-zA-Z0-9]+\.?)+$/.test(x));
    expect(rawKeys).toEqual([]);
  });

  it('15) Übersetzung (FR) ohne sichtbare i18n-Keys', () => {
    setup(fr as unknown as Record<string, string>);
    const node = render();
    expect(fab(node).props.accessibilityLabel).toBe(fr['fab.actionCreateAppointment']);
    act(() => { fab(node).props.onLongPress?.(); });
    const s = allStrings(node);
    const rawKeys = s.filter((x) => /^[a-z]+\.(?:[a-zA-Z0-9]+\.?)+$/.test(x));
    expect(rawKeys).toEqual([]);
  });

  it('9) Hund hinzufügen mit freier Kapazität → /add-dog', () => {
    setup(deCH as unknown as Record<string, string>, { fabActionId: 'add_dog' });
    const node = render();
    act(() => { fab(node).props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/add-dog');
  });

  it('10) Hund hinzufügen am NEWBIE-Limit → Paywall', () => {
    mockDogs = [{ id: 'd1', name: 'Malu' }]; // 1/1 belegt
    mockIsPro = false;
    setup(deCH as unknown as Record<string, string>, { fabActionId: 'add_dog' });
    const node = render();
    act(() => { fab(node).props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/premium');
    expect(mockPush).not.toHaveBeenCalledWith('/add-dog');
  });

  it('11) Backpack ohne Hund → Hinweis + Hund-anlegen-Flow', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setup(deCH as unknown as Record<string, string>, { fabActionId: 'open_backpack' });
    const node = render();
    act(() => { fab(node).props.onPress?.(); });
    expect(alertSpy).toHaveBeenCalledWith(deCH['fab.noDogTitle'], deCH['fab.noDogBody'], expect.any(Array));
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as { text: string; onPress?: () => void }[];
    const addDogBtn = buttons.find((b) => b.text === deCH['fab.addDog']);
    act(() => { addDogBtn?.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/add-dog');
    alertSpy.mockRestore();
  });

  it('12) Backpack mit einem Hund → direkt öffnen', () => {
    mockDogs = [{ id: 'd1', name: 'Malu' }];
    setup(deCH as unknown as Record<string, string>, { fabActionId: 'open_backpack' });
    const node = render();
    act(() => { fab(node).props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/dog-backpack/[id]', params: { id: 'd1', name: 'Malu' } });
  });

  it('13) Backpack mit mehreren Hunden → vorhandene Hund-Auswahl', () => {
    mockDogs = [{ id: 'd1', name: 'Malu' }, { id: 'd2', name: 'Yam' }];
    setup(deCH as unknown as Record<string, string>, { fabActionId: 'open_backpack' });
    const node = render();
    act(() => { fab(node).props.onPress?.(); });
    expect(allStrings(node)).toContain(deCH['home.selectDog']);
    const maluRow = rowWithLabel(node, 'Malu');
    expect(maluRow).toBeDefined();
    act(() => { maluRow?.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/dog-backpack/[id]', params: { id: 'd1', name: 'Malu' } });
  });

  it('14) ungültige/veraltete Action-ID → sicherer Fallback (kein Crash, Route vorhanden)', () => {
    setup(deCH as unknown as Record<string, string>, { fabActionId: 'ghost_action' as HomeFabActionId });
    const node = render();
    expect(fab(node)).toBeDefined();
    expect(iconNames(node)).toContain(HOME_FAB_ACTIONS_META[DEFAULT_FAB_ACTION]?.icon);
    act(() => { fab(node).props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/training-hub');
  });
});
