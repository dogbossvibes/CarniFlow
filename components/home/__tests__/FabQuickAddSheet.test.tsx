import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Dimensions, Text } from 'react-native';
import { QuickAddSheet } from '@/components/QuickAddSheet';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { fr } from '@/i18n/locales/fr';
import {
  DEFAULT_HOME_CONFIG,
  MAX_QUICK_BUTTON_ACTIONS,
  dogBackpackActionId,
  dogOpenActionId,
  QUICK_BUTTON_ROUTE_ACTIONS,
  type HomeScreenConfig,
} from '@/stores/homeScreenConfig';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockPush = jest.fn();
let mockLabels: Record<string, string> = {};
let mockConfig: HomeScreenConfig = { ...DEFAULT_HOME_CONFIG };
let mockDogs: { id: string; name: string; photo_url: string | null }[] = [];
let mockIsPro = false;
let mockActiveUnit: string | null = null;
let mockActiveTracks: unknown[] = [];
const mockSetConfig = jest.fn();
let mounted: ReactTestRenderer | null = null;

// Haptik (T-42D): Mock, damit Auswahl-Haptik deterministisch gezählt werden kann.
const mockHapticSelection = jest.fn();
const mockHapticLight = jest.fn();
const mockHapticMedium = jest.fn();
const mockHapticWarning = jest.fn();

jest.mock('@/lib/haptics', () => ({
  haptic: {
    selection: (...a: unknown[]) => mockHapticSelection(...a),
    light: (...a: unknown[]) => mockHapticLight(...a),
    medium: (...a: unknown[]) => mockHapticMedium(...a),
    warning: (...a: unknown[]) => mockHapticWarning(...a),
    heavy: jest.fn(),
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('expo-image', () => ({ Image: 'ExpoImage' }));

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

jest.mock('@/stores/activeTraining', () => ({
  useActiveTraining: () => ({ unitId: mockActiveUnit }),
}));

jest.mock('@/features/tracking/hooks/useActiveFaehrte', () => ({
  useActiveFaehrtenList: () => mockActiveTracks,
}));

jest.mock('@/features/tracking/components/GlobalActiveFaehrtenBar', () => ({
  GlobalActiveFaehrtenBar: mockGlobalActiveFaehrtenBarMarker,
}));

// LiveTrainingBar wird im QuickAddSheet-Live-Fall gerendert; hier nur als Marker.
jest.mock('@/components/training/LiveTrainingBar', () => ({
  LiveTrainingBar: mockLiveTrainingBarMarker,
}));

function mockGlobalActiveFaehrtenBarMarker() {
  return <Text>TRACKBAR</Text>;
}

function mockLiveTrainingBarMarker() {
  return <Text>LIVEBAR</Text>;
}

// DogAvatar: Marker mit sichtbarer photoUrl (Profilbild) bzw. 'none' (Fallback).
jest.mock('@/components/dogs/DogAvatar', () => ({
  DogAvatar: mockDogAvatarMarker,
}));

function mockDogAvatarMarker({ photoUrl }: { photoUrl: string | null }) {
  return <Text>{photoUrl ? `AVATAR:${photoUrl}` : 'AVATAR:none'}</Text>;
}

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
  useT: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      let s = mockLabels[key] ?? key;
      if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
      return s;
    },
    locale: 'de-CH',
  }),
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
  act(() => { node = TestRenderer.create(<QuickAddSheet />); });
  mounted = node;
  return node;
}

function allStrings(node: ReactTestRenderer): string[] {
  const texts = inst(node).findAllByType(Text);
  return texts
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((x): x is string => typeof x === 'string');
}

// Der Schnellbutton ist seit T-42C eine View mit PanResponder (kurzer Tipp,
// langer Druck, Ziehen) und testID 'quick-fab'. (Composite + Host teilen sich
// dieselbe testID → erstes Vorkommen genügt.)
function fab(node: ReactTestRenderer): Node {
  const found = inst(node).findAll((n) => n.props.testID === 'quick-fab');
  expect(found.length).toBeGreaterThanOrEqual(1);
  return found[0];
}

// Simulierter GestureResponder-Event für einen einzelnen aktiven Touch.
// PanResponder leitet dx/dy intern aus touchHistory ab (previous → current).
function panEvent(x: number, y: number, prevX: number, prevY: number, ts: number) {
  return {
    nativeEvent: { touches: [{ pageX: x, pageY: y, timestamp: ts }] },
    touchHistory: {
      mostRecentTimeStamp: ts,
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      touchBank: [{
        touchActive: true,
        currentTimeStamp: ts,
        previousTimeStamp: ts,
        startTimeStamp: ts,
        currentPageX: x,
        currentPageY: y,
        previousPageX: prevX,
        previousPageY: prevY,
        startPageX: prevX,
        startPageY: prevY,
      }],
    },
  };
}

// Kurzer Tipp: Grant + Release ohne Bewegung → Aktion ausführen / Fächer öffnen.
function tap(node: ReactTestRenderer): void {
  act(() => {
    fab(node).props.onResponderGrant?.(panEvent(0, 0, 0, 0, 1));
    fab(node).props.onResponderRelease?.(panEvent(0, 0, 0, 0, 2));
  });
}

// Langer Druck: 500 ms ohne Bewegung → Schnellbutton-Einstellungen öffnen.
function longPress(node: ReactTestRenderer): void {
  act(() => { fab(node).props.onResponderGrant?.(panEvent(0, 0, 0, 0, 1)); });
  act(() => { jest.advanceTimersByTime(500); });
  act(() => { fab(node).props.onResponderRelease?.(panEvent(0, 0, 0, 0, 3)); });
}

// Ziehen: Grant + Bewegung (>6 px → Drag) + Release → Snap + Persistenz.
function drag(node: ReactTestRenderer, dx: number, dy: number): void {
  act(() => { fab(node).props.onResponderGrant?.(panEvent(0, 0, 0, 0, 1)); });
  act(() => { fab(node).props.onResponderMove?.(panEvent(dx, dy, 0, 0, 2)); });
  act(() => { fab(node).props.onResponderRelease?.(panEvent(dx, dy, dx, dy, 3)); });
}

// Position (links/oben) eines Elements aus dessen gerendertem Style.
function nodePosition(node: ReactTestRenderer, testID: string): { left: number; top: number } | undefined {
  const el = inst(node).findAll((n) => n.props.testID === testID)[0];
  if (!el) return undefined;
  const style = Array.isArray(el.props.style) ? el.props.style : [el.props.style];
  const left = style.map((o: { left?: number } | undefined) => o?.left).find((v) => typeof v === 'number') as number;
  const top = style.map((o: { top?: number } | undefined) => o?.top).find((v) => typeof v === 'number') as number;
  return { left, top };
}

// Aktuelle FAB-Ecke (links/oben) aus dem gerenderten Style.
function fabPosition(node: ReactTestRenderer): { left: number; top: number } {
  return nodePosition(node, 'quick-fab')!;
}

// Fächer-Anker (FAB-Zentrum in absoluten Koordinaten).
function fanPosition(node: ReactTestRenderer): { left: number; top: number } {
  return nodePosition(node, 'quick-fan-anchor')!;
}

// Zuletzt persistierte Position (Seite + Höhe) aus setHomeScreenConfig-Aufrufen.
function lastSavedPosition(): { side: 'left' | 'right'; yRatio: number } | undefined {
  const calls = mockSetConfig.mock.calls as [HomeScreenConfig][];
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0].quickButtonPosition) return calls[i][0].quickButtonPosition;
  }
  return undefined;
}

// Öffnet den Fächer über einen KURZEN Tipp (mehrere Aktionen). Langer Tipp öffnet
// seit T-42B die Schnellbutton-Einstellungen (home-customize), nie den Fächer.
function openFan(node: ReactTestRenderer): void {
  tap(node);
}

// ── T-42D: Hover-by-drag im offenen Aktionsfächer ─────────────────────────────
// Der volle Fächer-Overlay trägt die PanResponder (testID 'quick-fan-overlay');
// direkte Taps laufen über die Kinder (Aktions-Buttons/X/Scrim). Für den Hover
// simulieren wir Grant/Move/Release direkt auf dem Overlay (wie beim FAB).
function overlay(node: ReactTestRenderer): Node {
  const found = inst(node).findAll((n) => n.props.testID === 'quick-fan-overlay');
  expect(found.length).toBeGreaterThanOrEqual(1);
  return found[0];
}

// Der PanResponder-Rechner verlangt strikt steigende Zeitstempel je Geste
// (sonst überspringt onResponderMove den Event als "schon verarbeitet"). Die
// Helfer zählen deshalb intern hoch; ein explizit übergebenes ts wird ignoriert.
let fanTs = 0;

function fanGrant(node: ReactTestRenderer, x: number, y: number): void {
  act(() => { overlay(node).props.onResponderGrant?.(panEvent(x, y, 0, 0, ++fanTs)); });
}

function fanMove(node: ReactTestRenderer, x: number, y: number): void {
  act(() => { overlay(node).props.onResponderMove?.(panEvent(x, y, 0, 0, ++fanTs)); });
}

function fanRelease(node: ReactTestRenderer, x: number, y: number): void {
  act(() => { overlay(node).props.onResponderRelease?.(panEvent(x, y, 0, 0, ++fanTs)); });
}

// Absoluter Mittelpunkt eines Aktionskreises (Anker + Linke-Oben-Ecke + halbe
// Grösse). Die Item-Styles sind relativ zum Fächer-Anker; der Hit-Test im Overlay
// arbeitet mit absoluten Seiten-Koordinaten (g.moveX/moveY).
function fanItemCenter(node: ReactTestRenderer, id: string): { x: number; y: number } {
  const p = nodePosition(node, `quick-fan-item:${id}`)!;
  const a = fanPosition(node);
  return { x: a.left + p.left + 23, y: a.top + p.top + 23 };
}

// Aktueller Skalenwert des sichtbaren Kreises (Animated-Node oder fester Wert).
function circleScale(node: ReactTestRenderer, id: string): number {
  const c = inst(node).findAll((n) => n.props.testID === `quick-fan-circle:${id}`)[0];
  const style = Array.isArray(c?.props?.style) ? c.props.style : [c?.props?.style];
  const transform = style.map((o: { transform?: unknown } | undefined) => o?.transform).find((t) => Array.isArray(t)) as
    Array<{ scale?: unknown }> | undefined;
  const entry = transform?.find((t) => t && typeof t === 'object' && 'scale' in t);
  const scale = entry?.scale;
  return typeof scale === 'number' ? scale : ((scale as { __getValue?: () => number })?.__getValue?.() ?? NaN);
}

// Randfarbe des sichtbaren Kreises (letzte Angabe im Style-Array gewinnt).
function circleBorderColor(node: ReactTestRenderer, id: string): string | undefined {
  const c = inst(node).findAll((n) => n.props.testID === `quick-fan-circle:${id}`)[0];
  const style = Array.isArray(c?.props?.style) ? c.props.style : [c?.props?.style];
  const colors = style.map((o: { borderColor?: string } | undefined) => o?.borderColor).filter((v): v is string => typeof v === 'string');
  return colors[colors.length - 1];
}

// accessibilityState.selected eines Aktions-Buttons (normalisiert: immer boolean).
function itemSelected(node: ReactTestRenderer, id: string): boolean {
  const item = inst(node).findAll((n) => n.props.testID === `quick-fan-item:${id}`)[0];
  return Boolean(item?.props?.accessibilityState?.selected);
}

function iconNames(node: ReactTestRenderer): string[] {
  return inst(node)
    .findAll((n) => n.type === 'Ionicons')
    .map((n) => String(n.props.name));
}

function logoNodes(node: ReactTestRenderer): Node[] {
  return inst(node).findAll((n) => n.type === 'ExpoImage');
}

function rowWithLabel(node: ReactTestRenderer, label: string): Node | undefined {
  return inst(node).findAll(
    (n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  )[0];
}

function fanItems(node: ReactTestRenderer): Node[] {
  // TouchableOpacity wird als forwardRef gerendert → mehrere Knoten teilen sich
  // dieselbe testID; hier wird pro testID nur das erste Vorkommen gezählt.
  const seen = new Set<string>();
  const out: Node[] = [];
  for (const n of inst(node).findAll(
    (x) => typeof x.props.testID === 'string' && x.props.testID.startsWith('quick-fan-item:'),
  )) {
    const id = n.props.testID as string;
    if (!seen.has(id)) {
      seen.add(id);
      out.push(n);
    }
  }
  return out;
}

function fanClose(node: ReactTestRenderer): Node | undefined {
  return inst(node).findAll((n) => n.props.testID === 'quick-fan-close')[0];
}

function dogs(arr: { id: string; name: string; photo_url?: string | null }[]) {
  return arr.map((d) => ({ photo_url: null, ...d }));
}

function setup(labels: Record<string, string>, config?: Partial<HomeScreenConfig>) {
  mockLabels = labels;
  mockConfig = { ...DEFAULT_HOME_CONFIG, ...config };
  mockSetConfig.mockReset();
  mockPush.mockReset();
}

const ALL_SINGLE_ACTIONS: string[] = [
  ...QUICK_BUTTON_ROUTE_ACTIONS,
  'hide_button',
  dogOpenActionId('d1'),
  dogBackpackActionId('d1'),
];

describe('QuickAddSheet (globaler Schnellbutton mit Aktionsfächer)', () => {
  beforeEach(() => {
    mockDogs = [];
    mockIsPro = false;
    mockActiveUnit = null;
    mockActiveTracks = [];
    mockHapticSelection.mockReset();
    mockHapticLight.mockReset();
    mockHapticMedium.mockReset();
    mockHapticWarning.mockReset();
    // Deterministische Fenstergröße für Drag-/Snap-/Fächer-Geometrie (iPhone-ish).
    act(() => { Dimensions.set({ window: { width: 390, height: 844, scale: 2, fontScale: 2 } }); });
    jest.useRealTimers();
  });
  afterEach(() => {
    // Gemountete Renderer trennen, damit Dimensions.set-Events keinen sichtbaren
    // Zustand außerhalb von act() ändern (React-19-Warnung vermeiden).
    act(() => { mounted?.unmount(); });
    mounted = null;
    jest.useRealTimers();
  });

  it('1) Default = Termin erstellen (Label + Route, direkter Tipp)', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    const label = deCH['quickButton.actions.createAppointment'];
    expect(fab(node).props.accessibilityLabel).toBe(label);
    tap(node);
    expect(mockPush).toHaveBeenCalledWith('/training-hub');
  });

  it('2) Button zeigt IMMER das anyvologo-Bild, nie ein Icon (Kalender/Plus)', () => {
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]);
    for (const id of ALL_SINGLE_ACTIONS) {
      setup(deCH as unknown as Record<string, string>, { quickButtonActions: [id] });
      const node = render();
      const logos = logoNodes(node);
      expect(logos.length).toBeGreaterThanOrEqual(1);
      const icons = iconNames(node);
      expect(icons).not.toContain('calendar');
      expect(icons).not.toContain('add');
    }
  });

  it('3) eine aktive Aktion: kurzer Tipp führt direkt aus', () => {
    mockDogs = []; // freie Hund-Kapazität → add_dog führt zu /add-dog
    const routeTests: Record<string, string> = {
      start_training: '/unit/start',
      document_training: '/unit/document',
      training_journal: '/training-journal',
      start_track: '/track',
      create_appointment: '/training-hub',
      add_dog: '/add-dog',
    };
    for (const [id, route] of Object.entries(routeTests)) {
      setup(deCH as unknown as Record<string, string>, { quickButtonActions: [id] });
      const node = render();
      tap(node);
      expect(mockPush).toHaveBeenCalledWith(route);
    }
  });

  it('4) zwei Aktionen: kurzer Tipp öffnet den Fächer (kein direktes Ausführen)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'create_appointment'],
    });
    const node = render();
    tap(node);
    expect(mockPush).not.toHaveBeenCalled();
    expect(fanItems(node).length).toBe(2);
    const labels = fanItems(node).map((n) => n.props.accessibilityLabel);
    expect(labels).toContain(deCH['quickButton.actions.startTraining']);
    expect(labels).toContain(deCH['quickButton.actions.createAppointment']);
  });

  it('5) langer Tipp öffnet IMMER die Schnellbutton-Einstellungen (nie Fächer, nie Aktion)', () => {
    jest.useFakeTimers();
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]);
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', dogOpenActionId('d1')],
    });
    const node = render();
    longPress(node);
    // Einstellungen öffnen, keine Aktion ausführen, keinen Fächer öffnen.
    expect(mockPush).toHaveBeenCalledWith('/home-customize');
    expect(mockPush).not.toHaveBeenCalledWith('/unit/start');
    expect(mockPush).not.toHaveBeenCalledWith('/dog/d1');
    expect(fanItems(node).length).toBe(0);
    // Accessibility-Hint aus T-42C (verschiebbar + langer Druck für Einstellungen).
    expect(fab(node).props.accessibilityHint).toBe(deCH['quickButton.dragHint']);
  });

  it('6) Fächer-Aktion antippen führt die Route aus und schließt den Fächer', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const item = rowWithLabel(node, deCH['quickButton.actions.startTraining']);
    expect(item).toBeDefined();
    act(() => { item?.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/unit/start');
    expect(fanItems(node).length).toBe(0);
  });

  it('7) X-Button und Tipp-außerhalb (Scrim) schließen den Fächer', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    expect(fanItems(node).length).toBe(2);
    act(() => { fanClose(node)?.props.onPress?.(); });
    expect(fanItems(node).length).toBe(0);

    openFan(node);
    const scrim = inst(node).findAll((n) => n.props.testID === 'quick-fan-scrim')[0];
    expect(scrim).toBeDefined();
    act(() => { scrim?.props.onPress?.(); });
    expect(fanItems(node).length).toBe(0);
  });

  it('8) Hund-Aktion mit Profilbild → Avatar mit photoUrl; Tipp → Hundeprofil', () => {
    mockDogs = dogs([{ id: 'd1', name: 'Malu', photo_url: 'https://x/malu.jpg' }]);
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: [dogOpenActionId('d1'), 'start_training'],
    });
    const node = render();
    openFan(node);
    expect(allStrings(node)).toContain('AVATAR:https://x/malu.jpg');
    const item = rowWithLabel(node, 'Malu öffnen');
    expect(item).toBeDefined();
    act(() => { item?.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/dog/d1');
  });

  it('9) Hund-Aktion ohne Profilbild → Fallback-Avatar', () => {
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]);
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: [dogOpenActionId('d1'), 'start_training'],
    });
    const node = render();
    openFan(node);
    expect(allStrings(node)).toContain('AVATAR:none');
  });

  it('10) Backpack-Hund-Aktion → Backpack mit id + Name', () => {
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]);
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: [dogBackpackActionId('d1'), 'start_training'],
    });
    const node = render();
    openFan(node);
    const item = rowWithLabel(node, 'Malu Backpack öffnen');
    expect(item).toBeDefined();
    act(() => { item?.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/dog-backpack/[id]', params: { id: 'd1', name: 'Malu' } });
  });

  it('11) Hund hinzufügen mit freier Kapazität → /add-dog', () => {
    setup(deCH as unknown as Record<string, string>, { quickButtonActions: ['add_dog'] });
    const node = render();
    tap(node);
    expect(mockPush).toHaveBeenCalledWith('/add-dog');
  });

  it('12) Hund hinzufügen am NEWBIE-Limit → Paywall', () => {
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]); // 1/1 belegt
    mockIsPro = false;
    setup(deCH as unknown as Record<string, string>, { quickButtonActions: ['add_dog'] });
    const node = render();
    tap(node);
    expect(mockPush).toHaveBeenCalledWith('/premium');
    expect(mockPush).not.toHaveBeenCalledWith('/add-dog');
  });

  it('13) gelöschter Hund in gespeicherten Aktionen → gefiltert, übrige Aktion läuft (kein Crash)', () => {
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]);
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: [dogOpenActionId('ghost'), 'start_track'],
    });
    const node = render();
    // Nur die gültige Aktion bleibt → kurzer Tipp führt sie direkt aus.
    tap(node);
    expect(mockPush).toHaveBeenCalledWith('/track');
  });

  it('14) 0 aktive Aktionen → kein Button (kein Platzhalter)', () => {
    setup(deCH as unknown as Record<string, string>, { quickButtonActions: [] });
    const node = render();
    expect(inst(node).findAll((n) => n.props.accessibilityRole === 'button')).toHaveLength(0);
  });

  it('15) quickButtonVisible=false → kein Button', () => {
    setup(deCH as unknown as Record<string, string>, { quickButtonVisible: false });
    const node = render();
    expect(inst(node).findAll((n) => n.props.accessibilityRole === 'button')).toHaveLength(0);
  });

  it('16) laufendes Training → Live-Leiste ersetzt den Button (kein Button)', () => {
    mockActiveUnit = 'u1';
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    expect(allStrings(node)).toContain('LIVEBAR');
    expect(inst(node).findAll((n) => n.props.accessibilityRole === 'button')).toHaveLength(0);
  });

  it('17) offene GPS-Fährte → Fährten-Leiste ersetzt den Button (kein Button)', () => {
    mockActiveTracks = [{ id: 't1' }];
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    expect(allStrings(node)).toContain('TRACKBAR');
    expect(inst(node).findAll((n) => n.props.accessibilityRole === 'button')).toHaveLength(0);
  });

  it('18) Training UND Fährte aktiv → Training gewinnt (nie zwei primäre Elemente)', () => {
    mockActiveUnit = 'u1';
    mockActiveTracks = [{ id: 't1' }];
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    expect(allStrings(node)).toContain('LIVEBAR');
    expect(allStrings(node)).not.toContain('TRACKBAR');
  });

  it('19) „Button ausblenden" antippen → quickButtonVisible=false + Aktion entfernt', () => {
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]);
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: [dogOpenActionId('d1'), 'hide_button'],
    });
    const node = render();
    openFan(node);
    const hideItem = rowWithLabel(node, deCH['quickButton.actions.hideButton']);
    expect(hideItem).toBeDefined();
    act(() => { hideItem?.props.onPress?.(); });
    expect(mockSetConfig).toHaveBeenCalledWith(expect.objectContaining({ quickButtonVisible: false }));
    const saved = mockSetConfig.mock.calls[0][0];
    expect(saved.quickButtonActions).toEqual([dogOpenActionId('d1')]);
  });

  it('20) max. 8 Aktionen im Fächer (9 konfiguriert → 8 sichtbar)', () => {
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]);
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: [
        'start_training', 'document_training', 'training_journal', 'start_track',
        'create_appointment', 'add_dog', 'hide_button', dogOpenActionId('d1'), dogBackpackActionId('d1'),
      ],
    });
    const node = render();
    openFan(node);
    const items = fanItems(node);
    expect(items.length).toBe(MAX_QUICK_BUTTON_ACTIONS);
    const ids = items.map((n) => n.props.testID as string);
    expect(ids).toContain('quick-fan-item:open-dog:d1');
    expect(ids).not.toContain('quick-fan-item:open-backpack:d1'); // Nummer 9 → gekappt
  });

  it('21) mehrere Hunde → eigene Aktionen pro Hund (Profilbild + Fallback, Reihenfolge)', () => {
    mockDogs = dogs([
      { id: 'd1', name: 'Malu', photo_url: 'https://x/malu.jpg' },
      { id: 'd2', name: 'Yam' },
    ]);
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: [dogOpenActionId('d1'), dogBackpackActionId('d2')],
    });
    const node = render();
    openFan(node);
    const labels = fanItems(node).map((n) => n.props.accessibilityLabel);
    expect(labels).toEqual(['Malu öffnen', 'Yam Backpack öffnen']);
    expect(allStrings(node)).toContain('AVATAR:https://x/malu.jpg');
    expect(allStrings(node)).toContain('AVATAR:none');
  });

  it('22) Übersetzung (DE) ohne sichtbare i18n-Keys', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', dogOpenActionId('d1')],
    });
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]);
    const node = render();
    // Zwei Aktionen → Button-Label ist der generische „auswählen"-Hinweis.
    expect(fab(node).props.accessibilityLabel).toBe(deCH['quickButton.chooseAction']);
    openFan(node);
    const s = allStrings(node);
    const rawKeys = s.filter((x) => /^[a-z]+\.(?:[a-zA-Z0-9]+\.?)+$/.test(x));
    expect(rawKeys).toEqual([]);
  });

  it('23) Übersetzung (gsw-CH) ohne sichtbare i18n-Keys; „Eigener Hund"-Fix ist aktiv', () => {
    expect(gswCH['quickButton.actions.openDog']).toBe('Eigener Hund');
    expect(gswCH['quickButton.actions.openDog']).not.toBe('Äigene Hund');
    setup(gswCH as unknown as Record<string, string>);
    const node = render();
    expect(fab(node).props.accessibilityLabel).toBe(gswCH['quickButton.actions.createAppointment']);
    openFan(node);
    const s = allStrings(node);
    const rawKeys = s.filter((x) => /^[a-z]+\.(?:[a-zA-Z0-9]+\.?)+$/.test(x));
    expect(rawKeys).toEqual([]);
  });

  it('24) Übersetzung (FR) ohne sichtbare i18n-Keys', () => {
    setup(fr as unknown as Record<string, string>);
    const node = render();
    expect(fab(node).props.accessibilityLabel).toBe(fr['quickButton.actions.createAppointment']);
    openFan(node);
    const s = allStrings(node);
    const rawKeys = s.filter((x) => /^[a-z]+\.(?:[a-zA-Z0-9]+\.?)+$/.test(x));
    expect(rawKeys).toEqual([]);
  });

  it('25) kein KI-Coach (keine „Coach"-Strings, auch bei offenem Fächer)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', dogOpenActionId('d1')],
    });
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]);
    const node = render();
    openFan(node);
    const s = allStrings(node);
    expect(s.filter((x) => /coach/i.test(x))).toEqual([]);
  });

  // ── T-42C: verschiebbarer FAB (Drag, Snap, Persistenz, Fächer-Ausrichtung) ─
  // Fenster 390×844, TabBar fabBottom=100, Insets 0 → erlaubte Ecke:
  // xLeft=20, xRight=312, yTop=8, yBottom=686; Seiten-Entscheid bei x+29 < 195.

  it('26) Standardposition ohne gespeicherte Position = rechts/unten', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    expect(fabPosition(node)).toEqual({ left: 312, top: 686 });
  });

  it('27) gespeicherte Position wird beim Öffnen übernommen (links unten + ganz oben)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'left', yRatio: 1 },
    });
    expect(fabPosition(render())).toEqual({ left: 20, top: 686 });

    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'right', yRatio: 0 },
    });
    expect(fabPosition(render())).toEqual({ left: 312, top: 8 });
  });

  it('28) Ziehen nach links → Snap an den linken Rand + yRatio unten (1)', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    drag(node, -200, 0);
    expect(fabPosition(node)).toEqual({ left: 20, top: 686 });
    expect(lastSavedPosition()).toEqual({ side: 'left', yRatio: 1 });
  });

  it('29) Ziehen nach rechts (von links) → Snap an den rechten Rand, yRatio bleibt', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'left', yRatio: 0.5 },
    });
    const node = render();
    expect(fabPosition(node)).toEqual({ left: 20, top: 347 });
    drag(node, 400, 0);
    expect(fabPosition(node)).toEqual({ left: 312, top: 347 });
    expect(lastSavedPosition()).toEqual({ side: 'right', yRatio: 0.5 });
  });

  it('30) Ziehen nach oben → yRatio < 1, Seite bleibt rechts', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    drag(node, 0, -300);
    expect(fabPosition(node).left).toBe(312);
    expect(fabPosition(node).top).toBe(386);
    expect(lastSavedPosition()?.side).toBe('right');
    expect(lastSavedPosition()?.yRatio).toBeCloseTo(378 / 678, 3);
  });

  it('31) Ziehen nach unten → yRatio steigt, Seite bleibt rechts', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'right', yRatio: 0.3 },
    });
    const node = render();
    expect(fabPosition(node).top).toBe(211);
    drag(node, 0, 400);
    expect(fabPosition(node).top).toBe(611);
    expect(lastSavedPosition()?.side).toBe('right');
    expect(lastSavedPosition()?.yRatio).toBeCloseTo(603 / 678, 3);
  });

  it('32) Ziehen weit nach oben → Klemme an die oberste Kante (yRatio 0)', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    drag(node, 0, -5000);
    expect(fabPosition(node)).toEqual({ left: 312, top: 8 });
    expect(lastSavedPosition()).toEqual({ side: 'right', yRatio: 0 });
  });

  it('33) Ziehen weit nach unten → Klemme über der Tab-Leiste (yRatio 1)', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    drag(node, 0, 5000);
    expect(fabPosition(node)).toEqual({ left: 312, top: 686 });
    expect(lastSavedPosition()).toEqual({ side: 'right', yRatio: 1 });
  });

  it('34) Snap an den NÄHEREN Rand (kleine Bewegung links → bleibt links)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'left', yRatio: 1 },
    });
    const node = render();
    drag(node, 100, 0);
    expect(fabPosition(node).left).toBe(20);
    expect(lastSavedPosition()?.side).toBe('left');
  });

  it('35) Snap über die Mitte hinweg (grosse Bewegung links → rechts)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'left', yRatio: 1 },
    });
    const node = render();
    drag(node, 200, 0);
    expect(fabPosition(node).left).toBe(312);
    expect(lastSavedPosition()?.side).toBe('right');
  });

  it('35b) mehrstufiger Drag (Gerät-Verhalten): Button folgt JEDER Bewegung, Snap am Ende', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    // Wie auf dem Gerät: mehrere Move-Events mit Re-Render dazwischen (jeder
    // Move setzt die Position). PanResponder akkumuliert dx/dy pro Event
    // (nextDX = dx + (currentPageX - previousPageX)) → prev = Position des
    // vorherigen Moves. Der PanResponder darf dabei NICHT neu erzeugt werden
    // (stabil via useRef), sonst ginge die Geste verloren.
    act(() => { fab(node).props.onResponderGrant?.(panEvent(0, 0, 0, 0, 1)); });
    act(() => { fab(node).props.onResponderMove?.(panEvent(-50, -30, 0, 0, 2)); });
    expect(fabPosition(node)).toEqual({ left: 262, top: 656 });
    act(() => { fab(node).props.onResponderMove?.(panEvent(-120, -80, -50, -30, 3)); });
    expect(fabPosition(node)).toEqual({ left: 192, top: 606 });
    act(() => { fab(node).props.onResponderMove?.(panEvent(-180, -140, -120, -80, 4)); });
    expect(fabPosition(node)).toEqual({ left: 132, top: 546 });
    act(() => { fab(node).props.onResponderRelease?.(panEvent(-180, -140, -180, -140, 5)); });
    expect(fabPosition(node)).toEqual({ left: 20, top: 546 });
    expect(lastSavedPosition()?.side).toBe('left');
  });

  it('36) Drag führt NIE eine Aktion aus (1 Aktion konfiguriert)', () => {
    setup(deCH as unknown as Record<string, string>, { quickButtonActions: ['start_training'] });
    const node = render();
    drag(node, -150, -100);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('37) Drag öffnet NIE den Fächer (2 Aktionen konfiguriert)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    drag(node, -150, -100);
    expect(fanItems(node).length).toBe(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('38) Drag öffnet NIE die Einstellungen (LongPress bricht bei Bewegung ab)', () => {
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    drag(node, -120, -60);
    expect(mockPush).not.toHaveBeenCalledWith('/home-customize');
  });

  it('39) Bewegung >6 px bricht den langen Druck ab (keine Einstellungen)', () => {
    jest.useFakeTimers();
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    act(() => { fab(node).props.onResponderGrant?.(panEvent(0, 0, 0, 0, 1)); });
    act(() => { fab(node).props.onResponderMove?.(panEvent(10, 0, 0, 0, 2)); });
    act(() => { jest.advanceTimersByTime(500); });
    act(() => { fab(node).props.onResponderRelease?.(panEvent(10, 0, 10, 0, 3)); });
    expect(mockPush).not.toHaveBeenCalledWith('/home-customize');
  });

  it('40) Bewegung ≤6 px bricht den langen Druck NICHT ab → Einstellungen', () => {
    jest.useFakeTimers();
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    act(() => { fab(node).props.onResponderGrant?.(panEvent(0, 0, 0, 0, 1)); });
    act(() => { fab(node).props.onResponderMove?.(panEvent(3, 0, 0, 0, 2)); });
    act(() => { jest.advanceTimersByTime(500); });
    act(() => { fab(node).props.onResponderRelease?.(panEvent(3, 0, 3, 0, 3)); });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/home-customize');
  });

  it('41) langer Druck mit EINER Aktion öffnet Einstellungen (führt Aktion nicht aus)', () => {
    jest.useFakeTimers();
    setup(deCH as unknown as Record<string, string>, { quickButtonActions: ['start_training'] });
    const node = render();
    longPress(node);
    expect(mockPush).toHaveBeenCalledWith('/home-customize');
    expect(mockPush).not.toHaveBeenCalledWith('/unit/start');
  });

  it('42) langer Druck öffnet Einstellungen genau EINMAL (Release wiederholt nicht)', () => {
    jest.useFakeTimers();
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    longPress(node);
    const settingsCalls = mockPush.mock.calls.filter((c) => c[0] === '/home-customize');
    expect(settingsCalls).toHaveLength(1);
  });

  it('43) Fächer-Anker folgt der gespeicherten Position (links, mittlere Höhe)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'left', yRatio: 0.3 },
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    expect(fanPosition(node)).toEqual({ left: 49, top: 240 });
  });

  it('44) Fächer klappt nach UNTEN, wenn oben zu wenig Platz ist (Button ganz oben)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'right', yRatio: 0 },
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    // Button ganz oben (nahe Statusbar/Dynamic Island) → nicht genug Platz oben,
    // unten deutlich mehr → Fächer + X-Schließen liegen UNTERHALB des Buttons.
    const close = nodePosition(node, 'quick-fan-close');
    expect(close).toBeDefined();
    expect(close!.top).toBe(49);
    const anchor = fanPosition(node);
    const c0 = fanItemCenter(node, 'start_training');
    const c1 = fanItemCenter(node, 'training_journal');
    expect(c0.y).toBeGreaterThan(anchor.top);
    expect(c1.y).toBeGreaterThan(anchor.top);
  });

  it('44b) Fächer bleibt oben, sobald oben genug Platz ist (mittlere Höhe)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'right', yRatio: 0.3 },
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const close = nodePosition(node, 'quick-fan-close');
    expect(close).toBeDefined();
    expect(close!.top).toBe(-79);
    const anchor = fanPosition(node);
    expect(fanItemCenter(node, 'start_training').y).toBeLessThan(anchor.top);
    expect(fanItemCenter(node, 'training_journal').y).toBeLessThan(anchor.top);
  });

  it('45) Fächer öffnet nach oben, wenn der Button unten liegt', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const close = nodePosition(node, 'quick-fan-close');
    expect(close).toBeDefined();
    expect(close!.top).toBe(-79);
  });

  it('45b) rechts → Fächer nach oben-LINKS, nichts unter dem Button', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const anchor = fanPosition(node); // rechts/unten (341, 715)
    const c0 = fanItemCenter(node, 'start_training');
    const c1 = fanItemCenter(node, 'training_journal');
    // Nichts unterhalb des Buttons (kein Kreis an der Tab-Leiste).
    expect(c0.y).toBeLessThan(anchor.top);
    expect(c1.y).toBeLessThan(anchor.top);
    // Rechte Seite → Fächer nach oben-LINKS (kein Kreis rechts vom Button).
    expect(c0.x).toBeLessThanOrEqual(anchor.left);
    expect(c1.x).toBeLessThan(anchor.left);
  });

  it('45c) links → Fächer nach oben-RECHTS (gespiegelt)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'left', yRatio: 1 },
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const anchor = fanPosition(node); // links/unten (49, 715)
    const c0 = fanItemCenter(node, 'start_training');
    const c1 = fanItemCenter(node, 'training_journal');
    expect(c0.y).toBeLessThan(anchor.top);
    expect(c1.y).toBeLessThan(anchor.top);
    expect(c0.x).toBeGreaterThanOrEqual(anchor.left);
    expect(c1.x).toBeGreaterThan(anchor.left);
  });

  it('46) Drag persistiert die übrigen Einstellungen unverändert', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
      quickButtonVisible: true,
    });
    const node = render();
    drag(node, -200, 0);
    expect(mockSetConfig).toHaveBeenCalledWith(expect.objectContaining({
      quickButtonActions: ['start_training', 'training_journal'],
      quickButtonVisible: true,
      quickButtonPosition: { side: 'left', yRatio: 1 },
    }));
  });

  it('47) Gerätevariante gross (768×1024) → Standardposition skaliert', () => {
    act(() => { mounted?.unmount(); mounted = null; });
    act(() => { Dimensions.set({ window: { width: 768, height: 1024, scale: 2, fontScale: 2 } }); });
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    expect(fabPosition(node)).toEqual({ left: 690, top: 866 });
  });

  it('48) Gerätevariante klein (320×568) → Standardposition skaliert', () => {
    act(() => { mounted?.unmount(); mounted = null; });
    act(() => { Dimensions.set({ window: { width: 320, height: 568, scale: 2, fontScale: 2 } }); });
    setup(deCH as unknown as Record<string, string>);
    const node = render();
    expect(fabPosition(node)).toEqual({ left: 242, top: 410 });
  });

  it('49) gespeicherte Position bleibt auf anderem Gerät (yRatio 1 = unten)', () => {
    act(() => { mounted?.unmount(); mounted = null; });
    act(() => { Dimensions.set({ window: { width: 768, height: 1024, scale: 2, fontScale: 2 } }); });
    setup(deCH as unknown as Record<string, string>, {
      quickButtonPosition: { side: 'left', yRatio: 1 },
    });
    const node = render();
    expect(fabPosition(node)).toEqual({ left: 20, top: 866 });
  });

  it('50) Tipp funktioniert weiterhin nach einem Drag (Position ändert die Aktion nicht)', () => {
    setup(deCH as unknown as Record<string, string>, { quickButtonActions: ['start_training'] });
    const node = render();
    drag(node, -200, 0);
    expect(fabPosition(node).left).toBe(20);
    mockPush.mockClear();
    tap(node);
    expect(mockPush).toHaveBeenCalledWith('/unit/start');
  });

  // ── T-42D: Hover-by-drag im Aktionsfächer ─────────────────────────────────
  // Fenster 390×844, FAB rechts/unten (312,686) → Anker (341,715). Der Fächer
  // öffnet nach oben; die Tests lesen die Kreiszentren dynamisch aus dem Baum.

  it('51) Drüberziehen hebt die Aktion hervor (Skalierung, Teal-Rand, Label, Icon)', () => {
    jest.useFakeTimers();
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const c0 = fanItemCenter(node, 'start_training');
    // Ausserhalb starten → auf Button 0 ziehen.
    fanGrant(node, c0.x - 80, c0.y - 80);
    act(() => { jest.advanceTimersByTime(30); });
    fanMove(node, c0.x, c0.y);
    act(() => { jest.advanceTimersByTime(400); });
    // Aktiver Button: hervorgehoben (selected, Teal-Rand, skaliert, Icon grösser).
    expect(itemSelected(node, 'start_training')).toBe(true);
    expect(circleBorderColor(node, 'start_training')).toBe('#00FFCC');
    expect(circleScale(node, 'start_training')).toBeGreaterThan(1.15);
    expect(inst(node).findAll((n) => n.type === 'Ionicons' && n.props.size === 26).length).toBe(1);
    // Nachbar bleibt unverändert (Normalgrösse, kein Layout-Sprung).
    expect(itemSelected(node, 'training_journal')).toBeFalsy();
    expect(circleBorderColor(node, 'training_journal')).toBe('#1E1E1E');
    expect(circleScale(node, 'training_journal')).toBeLessThan(1.05);
    // VoiceOver: Button-Rolle + Label + selected-State.
    const item = inst(node).findAll((n) => n.props.testID === 'quick-fan-item:start_training')[0];
    expect(item.props.accessibilityRole).toBe('button');
    expect(item.props.accessibilityLabel).toBe(deCH['quickButton.actions.startTraining']);
    // Loslassen auf dem Button führt genau diese Aktion aus + schliesst den Fächer.
    fanRelease(node, c0.x, c0.y);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/unit/start');
    expect(fanItems(node).length).toBe(0);
  });

  it('52) Wechsel zwischen zwei Buttons: vorheriger normal, neuer hervorgehoben', () => {
    jest.useFakeTimers();
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const c0 = fanItemCenter(node, 'start_training');
    const c1 = fanItemCenter(node, 'training_journal');
    fanGrant(node, c0.x, c0.y);
    expect(itemSelected(node, 'start_training')).toBe(true);
    act(() => { jest.advanceTimersByTime(400); });
    fanMove(node, c1.x, c1.y);
    act(() => { jest.advanceTimersByTime(400); });
    expect(itemSelected(node, 'training_journal')).toBe(true);
    expect(itemSelected(node, 'start_training')).toBe(false);
    expect(circleBorderColor(node, 'training_journal')).toBe('#00FFCC');
    expect(circleScale(node, 'start_training')).toBeLessThan(1.1);
    fanRelease(node, c1.x, c1.y);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/training-journal');
  });

  it('53) Loslassen ausserhalb eines Buttons → keine Aktion, Fächer schliesst', () => {
    jest.useFakeTimers();
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const c0 = fanItemCenter(node, 'start_training');
    fanGrant(node, c0.x - 80, c0.y - 80);
    fanMove(node, c0.x, c0.y);
    act(() => { jest.advanceTimersByTime(200); });
    expect(itemSelected(node, 'start_training')).toBe(true);
    // Finger verlässt alle Buttons → Rückkehr zur Normalgrösse.
    fanMove(node, c0.x - 90, c0.y - 90);
    act(() => { jest.advanceTimersByTime(400); });
    expect(itemSelected(node, 'start_training')).toBe(false);
    expect(circleScale(node, 'start_training')).toBeLessThan(1.1);
    // Loslassen ausserhalb: keine Aktion, nur schliessen (wie Scrim-Tipp).
    mockPush.mockClear();
    fanRelease(node, c0.x - 90, c0.y - 90);
    expect(mockPush).not.toHaveBeenCalled();
    expect(fanItems(node).length).toBe(0);
  });

  it('54) kein doppeltes Ausführen (genau eine Aktion pro Loslassen)', () => {
    jest.useFakeTimers();
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const c0 = fanItemCenter(node, 'start_training');
    const c1 = fanItemCenter(node, 'training_journal');
    fanGrant(node, c0.x - 80, c0.y - 80);
    fanMove(node, c0.x, c0.y);
    fanMove(node, c1.x, c1.y);
    act(() => { jest.advanceTimersByTime(100); });
    fanRelease(node, c1.x, c1.y);
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/training-journal');
    expect(fanItems(node).length).toBe(0);
  });

  it('55) Haptik nur bei echtem Wechsel der aktiven Aktion', () => {
    jest.useFakeTimers();
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const c0 = fanItemCenter(node, 'start_training');
    const c1 = fanItemCenter(node, 'training_journal');
    mockHapticSelection.mockClear();
    fanGrant(node, c0.x, c0.y);
    expect(mockHapticSelection).toHaveBeenCalledTimes(1);      // Grant auf Button
    fanMove(node, c0.x, c0.y);                                 // gleicher Button → kein Wechsel
    expect(mockHapticSelection).toHaveBeenCalledTimes(1);
    fanMove(node, c1.x, c1.y);                                 // Wechsel → +1
    expect(mockHapticSelection).toHaveBeenCalledTimes(2);
    fanMove(node, c1.x + 2, c1.y);                             // weiterhin c1 → kein Wechsel
    expect(mockHapticSelection).toHaveBeenCalledTimes(2);
    fanMove(node, c0.x - 90, c0.y - 90);                       // verlässt alle → keine Wechsel-Haptik
    expect(mockHapticSelection).toHaveBeenCalledTimes(2);
    fanRelease(node, c0.x - 90, c0.y - 90);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('56) kein FAB-Drag bei offenem Fächer (Geste läuft über den Overlay, Position bleibt)', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    const before = fabPosition(node);
    openFan(node);
    const c0 = fanItemCenter(node, 'start_training');
    // Hover-Geste im offenen Fächer: führt die Aktion aus, verschiebt aber den
    // Hauptbutton nicht und persistiert keine Position.
    fanGrant(node, c0.x - 80, c0.y - 80);
    fanMove(node, c0.x, c0.y);
    fanRelease(node, c0.x, c0.y);
    expect(mockPush).toHaveBeenCalledWith('/unit/start');
    expect(fabPosition(node)).toEqual(before);
    expect(lastSavedPosition()).toBeUndefined();
  });

  it('57) direktes Tippen auf einen Aktions-Button funktioniert weiterhin', () => {
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const item = rowWithLabel(node, deCH['quickButton.actions.startTraining']);
    expect(item).toBeDefined();
    act(() => { item?.props.onPress?.(); });
    expect(mockPush).toHaveBeenCalledWith('/unit/start');
    expect(fanItems(node).length).toBe(0);
  });

  it('58) acht Aktionen: Hover funktioniert auch im dichten Fächer', () => {
    jest.useFakeTimers();
    mockDogs = dogs([{ id: 'd1', name: 'Malu' }]);
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: [
        'start_training', 'document_training', 'training_journal', 'start_track',
        'create_appointment', 'add_dog', 'hide_button', dogOpenActionId('d1'),
      ],
    });
    const node = render();
    openFan(node);
    // Start am Ankerpunkt (FAB-Zentrum): bei jedem Radius ≥ 92 px von allen Kreisen.
    const anchor = fanPosition(node);
    const c = fanItemCenter(node, 'start_track');
    fanGrant(node, anchor.left, anchor.top);
    fanMove(node, c.x, c.y);
    act(() => { jest.advanceTimersByTime(400); });
    expect(itemSelected(node, 'start_track')).toBe(true);
    fanRelease(node, c.x, c.y);
    expect(mockPush).toHaveBeenCalledWith('/track');
  });

  it('59) Hund-Aktion beim Hover: Profilbild bleibt sichtbar und wird leicht vergrössert', () => {
    jest.useFakeTimers();
    mockDogs = dogs([{ id: 'd1', name: 'Malu', photo_url: 'https://x/malu.jpg' }]);
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: [dogOpenActionId('d1'), 'start_training'],
    });
    const node = render();
    openFan(node);
    const avatarNormal = inst(node).findAllByType(mockDogAvatarMarker)[0];
    expect(avatarNormal.props.size).toBe(36);
    const c = fanItemCenter(node, `open-dog:d1`);
    fanGrant(node, c.x - 80, c.y - 80);
    fanMove(node, c.x, c.y);
    act(() => { jest.advanceTimersByTime(400); });
    const avatarActive = inst(node).findAllByType(mockDogAvatarMarker)[0];
    expect(avatarActive.props.size).toBe(40); // leicht vergrössert (FAN_ITEM - 6)
    expect(allStrings(node)).toContain('AVATAR:https://x/malu.jpg');
    fanRelease(node, c.x, c.y);
    expect(mockPush).toHaveBeenCalledWith('/dog/d1');
  });

  it('60) kleines Gerät (320×568): Hover funktioniert', () => {
    act(() => { mounted?.unmount(); mounted = null; });
    act(() => { Dimensions.set({ window: { width: 320, height: 568, scale: 2, fontScale: 2 } }); });
    jest.useFakeTimers();
    setup(deCH as unknown as Record<string, string>, {
      quickButtonActions: ['start_training', 'training_journal'],
    });
    const node = render();
    openFan(node);
    const c0 = fanItemCenter(node, 'start_training');
    fanGrant(node, c0.x - 60, c0.y - 60);
    fanMove(node, c0.x, c0.y);
    act(() => { jest.advanceTimersByTime(400); });
    expect(itemSelected(node, 'start_training')).toBe(true);
    fanRelease(node, c0.x, c0.y);
    expect(mockPush).toHaveBeenCalledWith('/unit/start');
  });
});
