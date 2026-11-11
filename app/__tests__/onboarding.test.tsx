// Bedientests für app/onboarding.tsx (Einführung beim ersten Start).
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Text, TextInput } from 'react-native';
import OnboardingScreen from '@/app/onboarding';

const mockAddDog = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockComplete = jest.fn();
const mockMarkHelpSeen = jest.fn();
const mockRegisterForPush = jest.fn();
const mockProfileUpdate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: (...a: unknown[]) => mockReplace(...a), push: (...a: unknown[]) => mockPush(...a) }),
  Redirect: () => null,
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'owner-1' } }, loading: false }) }));
jest.mock('@/services/dogs', () => ({ addDog: (...a: unknown[]) => mockAddDog(...a) }));
jest.mock('@/lib/haptics', () => ({ haptic: { light: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/lib/push', () => ({ registerForPush: (...a: unknown[]) => mockRegisterForPush(...a) }));
jest.mock('@/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ update: (v: unknown) => { mockProfileUpdate(v); return { eq: () => Promise.resolve({ error: null }) }; } }) },
}));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/ui/DateField', () => ({ DateField: () => null }));
jest.mock('@/stores/helpSeen', () => ({ useHelpSeen: () => [], markHelpSeen: (...a: unknown[]) => mockMarkHelpSeen(...a) }));
jest.mock('@/stores/onboarding', () => ({ completeOnboarding: (...a: unknown[]) => mockComplete(...a) }));

type Node = { props: { onPress?: () => void | Promise<void>; children?: unknown }; findAllByType: (t: unknown) => Node[] };

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<OnboardingScreen />); });
  return node;
}
// Immer frisch abfragen (keine Referenz über einen State-Wechsel hinweg halten).
function pressable(node: ReactTestRenderer, label: string) {
  const hits = (node.root as unknown as { findAll: (p: (c: Node) => boolean) => Node[] })
    .findAll((c) => typeof c.props.onPress === 'function' && c.findAllByType(Text).some((t) => t.props.children === label));
  return hits[hits.length - 1];
}
async function press(node: ReactTestRenderer, label: string) {
  await act(async () => { await pressable(node, label).props.onPress!(); });
}
function all(node: ReactTestRenderer, type: unknown) {
  return (node.root as unknown as Node).findAllByType(type);
}
function hasText(node: ReactTestRenderer, label: string) {
  return all(node, Text).some((t) => t.props.children === label);
}
function typeName(node: ReactTestRenderer, value: string) {
  const field = all(node, TextInput)[0] as unknown as { props: { onChangeText: (v: string) => void } };
  act(() => { field.props.onChangeText(value); });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockAddDog.mockResolvedValue({ data: { id: 'dog-1' }, error: null });
});
afterEach(() => { jest.useRealTimers(); });

describe('Einführung beim ersten Start', () => {
  it('„Später einrichten" beendet sofort, ohne etwas anzulegen oder nach Mitteilungen zu fragen', async () => {
    const node = render();
    await press(node, 'onboarding.later');
    expect(mockAddDog).not.toHaveBeenCalled();
    expect(mockProfileUpdate).not.toHaveBeenCalled();
    expect(mockRegisterForPush).not.toHaveBeenCalled();
    expect(mockComplete).toHaveBeenCalledWith({ pushDeclined: true });
    expect(mockMarkHelpSeen).toHaveBeenCalledWith('home');
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('ohne Namen wird kein Hund angelegt; Überspringen führt weiter', async () => {
    const node = render();
    await press(node, 'onboarding.start');
    expect(hasText(node, 'onboarding.dogTitle')).toBe(true);
    await press(node, 'common.next');
    expect(mockAddDog).not.toHaveBeenCalled();
    expect(hasText(node, 'dog.nameRequired')).toBe(true);
    await press(node, 'onboarding.skip');
    expect(hasText(node, 'onboarding.spartenTitle')).toBe(true);
  });

  it('legt genau einen Hund an, speichert Sparten und startet den gewählten ersten Schritt', async () => {
    const node = render();
    await press(node, 'onboarding.start');
    typeName(node, '  Yam ');
    await press(node, 'common.next');
    expect(mockAddDog).toHaveBeenCalledTimes(1);
    expect(mockAddDog.mock.calls[0][0]).toBe('owner-1');
    expect(mockAddDog.mock.calls[0][1]).toMatchObject({ name: 'Yam', breed: null, photo_url: null, is_favorite: false });

    await press(node, 'Mantrailing');
    await press(node, 'common.next');
    expect(mockProfileUpdate).toHaveBeenCalledTimes(1);
    expect((mockProfileUpdate.mock.calls[0][0] as { aktive_sparten: string[] }).aktive_sparten).toContain('Mantrailing');

    expect(hasText(node, 'onboarding.readyTitleDog')).toBe(true);
    await press(node, 'onboarding.pushAllow');
    expect(mockRegisterForPush).toHaveBeenCalledWith('owner-1');
    await press(node, 'onboarding.optTrack');
    expect(mockComplete).toHaveBeenCalledWith({ pushDeclined: false });
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
    act(() => { jest.runAllTimers(); });
    expect(mockPush).toHaveBeenCalledWith('/track');
  });

  it('Speicherfehler bleibt sichtbar, hängt nicht und lässt sich überspringen', async () => {
    mockAddDog.mockRejectedValueOnce(new Error('offline'));
    const node = render();
    await press(node, 'onboarding.start');
    typeName(node, 'Yam');
    await press(node, 'common.next');
    expect(hasText(node, 'dog.saveError')).toBe(true);
    expect(hasText(node, 'onboarding.dogTitle')).toBe(true);
    await press(node, 'onboarding.skip');
    expect(hasText(node, 'onboarding.spartenTitle')).toBe(true);
  });
});
