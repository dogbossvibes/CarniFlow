// Regressionstests für app/add-dog.tsx (HOTFIX „Hund hinzufügen nicht mehr
// möglich"). Root Cause: addDog() im Erfolgspfad war NICHT gegen geworfene
// Exceptions abgesichert (nur der Foto-Upload war es) — bei einem Wurf statt
// eines regulären {error}-Ergebnisses blieb der Button dauerhaft im Loading-
// Zustand hängen, ohne jede Fehlermeldung. Diese Suite deckt sowohl den
// bestehenden Normalfall als auch genau dieses Fehlerverhalten ab.
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Platform, Text, TextInput } from 'react-native';
import HundHinzufuegenScreen from '@/app/add-dog';

const mockAddDog = jest.fn();
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockRequestMediaLibraryPermissions = jest.fn();
const mockLaunchImageLibrary = jest.fn();
let mockDogs: { id: string }[] = [];
let mockIsPro = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: (...a: unknown[]) => mockPush(...a) }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...a: unknown[]) => mockRequestMediaLibraryPermissions(...a),
  launchImageLibraryAsync: (...a: unknown[]) => mockLaunchImageLibrary(...a),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'LinearGradient' }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'owner-1' } } }) }));
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isPro: mockIsPro }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockDogs }) }));
jest.mock('@/services/dogs', () => ({ addDog: (...a: unknown[]) => mockAddDog(...a) }));
jest.mock('@/services/storage', () => ({ uploadDogImage: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptic: { light: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/ui/DateField', () => ({ DateField: () => null }));
jest.mock('@/components/dogs/DisciplinePicker', () => ({ DisciplinePicker: () => null, disciplineToStored: (v: string) => v || null }));
jest.mock('@/components/dogs/OfficialRegistrySection', () => ({ OfficialRegistrySection: () => null }));

function render(): ReactTestRenderer {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<HundHinzufuegenScreen />); });
  return node;
}

// Button ist NICHT gemockt (echte Komponente) — Save über den Text „dog.save"
// finden, analog zum bereits etablierten Muster in document.test.tsx. Immer
// frisch abfragen (nie eine Referenz über einen State-Wechsel hinweg wieder-
// verwenden), da TouchableOpacity/AnimatedPressable sonst eine veraltete
// Closure liefern können.
function findSave(node: ReactTestRenderer) {
  return (node.root as unknown as {
    findAll: (p: (c: { props: { onPress?: () => void }; findAllByType: (t: unknown) => { props: { children: unknown } }[] }) => boolean) => { props: { onPress: () => void; disabled?: boolean } }[];
  }).findAll((c) => typeof c.props.onPress === 'function' && c.findAllByType(Text).some((t) => t.props.children === 'dog.save'))[0];
}

// Findet die gesamte Foto-Fläche über den Platzhaltertitel „dog.photoAdd" —
// dasselbe Prinzip wie findSave, immer frisch abfragen.
function findPhotoCard(node: ReactTestRenderer) {
  return (node.root as unknown as {
    findAll: (p: (c: { props: { onPress?: () => void }; findAllByType: (t: unknown) => { props: { children: unknown } }[] }) => boolean) => { props: { onPress: () => void; disabled?: boolean } }[];
  }).findAll((c) => typeof c.props.onPress === 'function' && c.findAllByType(Text).some((t) => t.props.children === 'dog.photoAdd'))[0];
}

function nameInput(node: ReactTestRenderer) {
  return (node.root as unknown as {
    findAllByType: (t: unknown) => { props: { placeholder?: string; onChangeText: (v: string) => void } }[];
  }).findAllByType(TextInput).find((i) => i.props.placeholder === 'dog.namePlaceholder')!;
}

function strings(node: ReactTestRenderer): string[] {
  return (node.root as unknown as {
    findAllByType: (type: unknown) => { props: { children: unknown } }[];
  }).findAllByType(Text)
    .flatMap((t) => (Array.isArray(t.props.children) ? t.props.children : [t.props.children]))
    .filter((c): c is string => typeof c === 'string');
}

describe('add-dog', () => {
  beforeEach(() => {
    mockAddDog.mockReset();
    mockBack.mockReset();
    mockPush.mockReset();
    mockDogs = [];
    mockIsPro = false;
  });

  it('1. gültiges neues Hundeprofil → erfolgreich', async () => {
    const node = render();
    act(() => { nameInput(node).props.onChangeText('Rex'); });

    mockAddDog.mockResolvedValue({ error: null, data: { id: 'dog-1' } });
    await act(async () => { await findSave(node).props.onPress(); });

    expect(mockAddDog).toHaveBeenCalledTimes(1);
    expect(mockAddDog).toHaveBeenCalledWith('owner-1', expect.objectContaining({ name: 'Rex' }));
  });

  it('2. ohne Profilbild → erfolgreich (photo_url bleibt null, kein Upload-Aufruf blockiert)', async () => {
    const node = render();
    act(() => { nameInput(node).props.onChangeText('Rex'); });

    mockAddDog.mockResolvedValue({ error: null, data: { id: 'dog-1' } });
    await act(async () => { await findSave(node).props.onPress(); });

    expect(mockAddDog).toHaveBeenCalledWith('owner-1', expect.objectContaining({ photo_url: null }));
  });

  it('3. fehlendes Pflichtfeld (Name) → verständliche Validierung, kein Insert', async () => {
    const node = render();
    await act(async () => { await findSave(node).props.onPress(); });

    expect(mockAddDog).not.toHaveBeenCalled();
    expect(strings(node)).toContain('dog.nameRequired');
  });

  it('4. NEWBIE mit erreichtem Hundelimit (1) → korrekt blockiert, Redirect zur Paywall', async () => {
    mockDogs = [{ id: 'dog-existing' }];
    mockIsPro = false;
    const node = render();
    act(() => { nameInput(node).props.onChangeText('Rex'); });
    await act(async () => { await findSave(node).props.onPress(); });

    expect(mockAddDog).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/premium');
  });

  it('5. berechtigter Plan (ACTIVE/pro) mit mehreren Hunden → nicht fälschlich blockiert', async () => {
    mockDogs = [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }];
    mockIsPro = true;
    const node = render();
    act(() => { nameInput(node).props.onChangeText('Rex'); });

    mockAddDog.mockResolvedValue({ error: null, data: { id: 'dog-9' } });
    await act(async () => { await findSave(node).props.onPress(); });

    expect(mockAddDog).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalledWith('/premium');
  });

  it('6a. Backend liefert {error} → sichtbare Fehlermeldung, Button danach wieder aktiv', async () => {
    const node = render();
    act(() => { nameInput(node).props.onChangeText('Rex'); });

    mockAddDog.mockResolvedValueOnce({ error: { message: 'db down' }, data: null });
    await act(async () => { await findSave(node).props.onPress(); });

    expect(strings(node)).toContain('dog.saveError');
    expect(mockBack).not.toHaveBeenCalled();

    // Button wieder aktiv: ein zweiter Tap löst erneut einen Insert-Versuch aus.
    mockAddDog.mockResolvedValueOnce({ error: null, data: { id: 'dog-2' } });
    await act(async () => { await findSave(node).props.onPress(); });
    expect(mockAddDog).toHaveBeenCalledTimes(2);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('6b. addDog() wirft (z. B. Netzwerkabbruch) statt {error} zurückzugeben → sichtbare Fehlermeldung, Loading-State zurückgesetzt', async () => {
    const node = render();
    act(() => { nameInput(node).props.onChangeText('Rex'); });

    mockAddDog.mockRejectedValueOnce(new Error('network request failed'));
    await act(async () => { await findSave(node).props.onPress(); });

    // Vorher (Bug): setLaden(false) wurde nie erreicht → Button blieb im
    // Loading-Zustand hängen, ohne jede Meldung.
    expect(strings(node)).toContain('dog.saveError');
    expect(mockBack).not.toHaveBeenCalled();

    mockAddDog.mockResolvedValueOnce({ error: null, data: { id: 'dog-3' } });
    await act(async () => { await findSave(node).props.onPress(); });
    expect(mockAddDog).toHaveBeenCalledTimes(2);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('7. Navigation nach erfolgreichem Speichern (router.back)', async () => {
    const node = render();
    act(() => { nameInput(node).props.onChangeText('Rex'); });

    mockAddDog.mockResolvedValue({ error: null, data: { id: 'dog-1' } });
    await act(async () => { await findSave(node).props.onPress(); });

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// HOTFIX „Foto hinzufügen reagiert nicht": Root Cause war ein iOS-Permission-
// Ergebnis, das nur in der `fehler`-Box ganz unten im Formular landete — von
// der Foto-Fläche oben aus unsichtbar, ohne zu scrollen. Fix: Alert.alert()
// (wie im bereits funktionierenden components/ui/PhotoPicker.tsx) statt der
// unsichtbaren fehler-Box, plus try/catch/finally gegen hängendes bildLaden.
describe('add-dog — Foto hinzufügen', () => {
  const originalPlatformOS = Platform.OS;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    mockRequestMediaLibraryPermissions.mockReset();
    mockLaunchImageLibrary.mockReset();
    Platform.OS = 'ios';
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    Platform.OS = originalPlatformOS;
    alertSpy.mockRestore();
  });

  it('1. Tap ruft ImagePicker auf', async () => {
    const node = render();
    mockRequestMediaLibraryPermissions.mockResolvedValue({ status: 'granted' });
    mockLaunchImageLibrary.mockResolvedValue({ canceled: true });

    await act(async () => { await findPhotoCard(node).props.onPress(); });

    expect(mockRequestMediaLibraryPermissions).toHaveBeenCalledTimes(1);
    expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(1);
  });

  it('2. erfolgreich gewähltes Bild wird als Preview übernommen', async () => {
    const node = render();
    mockRequestMediaLibraryPermissions.mockResolvedValue({ status: 'granted' });
    mockLaunchImageLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://photo.jpg' }] });

    await act(async () => { await findPhotoCard(node).props.onPress(); });

    // bildUri gesetzt → Karte wechselt vom Platzhalter („dog.photoAdd") zur
    // Bild-Ansicht mit „dog.photoChange"-Badge (siehe JSX-Zweig in add-dog.tsx).
    expect(strings(node)).toContain('dog.photoChange');
    expect(strings(node)).not.toContain('dog.photoAdd');
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('3. Picker cancelled → kein Fehler, kein Alert', async () => {
    const node = render();
    mockRequestMediaLibraryPermissions.mockResolvedValue({ status: 'granted' });
    mockLaunchImageLibrary.mockResolvedValue({ canceled: true });

    await act(async () => { await findPhotoCard(node).props.onPress(); });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(strings(node)).toContain('dog.photoAdd'); // weiterhin Platzhalter, kein Bild gesetzt
  });

  it('4. Permission denied → sauber behandelt (sichtbarer Alert statt unsichtbarer fehler-Box)', async () => {
    const node = render();
    mockRequestMediaLibraryPermissions.mockResolvedValue({ status: 'denied' });

    await act(async () => { await findPhotoCard(node).props.onPress(); });

    expect(alertSpy).toHaveBeenCalledWith('media.permissionDenied', 'dog.photoPermissionError', expect.any(Array));
    expect(mockLaunchImageLibrary).not.toHaveBeenCalled();
  });

  it('5. Picker wirft Exception → sichtbare Fehlerbehandlung, kein hängender Loading-State', async () => {
    const node = render();
    mockRequestMediaLibraryPermissions.mockResolvedValue({ status: 'granted' });
    mockLaunchImageLibrary.mockRejectedValueOnce(new Error('picker crashed'));

    await act(async () => { await findPhotoCard(node).props.onPress(); });

    expect(alertSpy).toHaveBeenCalledWith('media.uploadFailed', 'picker crashed');

    // bildLaden wieder false: ein zweiter Tap ruft den Picker erneut auf statt
    // dauerhaft disabled zu bleiben (vorher wäre setBildLaden(false) übersprungen worden).
    mockLaunchImageLibrary.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file://photo2.jpg' }] });
    await act(async () => { await findPhotoCard(node).props.onPress(); });
    expect(mockLaunchImageLibrary).toHaveBeenCalledTimes(2);
    expect(strings(node)).toContain('dog.photoChange');
  });

  it('6. Hund ohne Bild bleibt weiterhin speicherbar (Foto-Fläche nie berührt)', async () => {
    const node = render();
    act(() => { nameInput(node).props.onChangeText('Rex'); });
    mockAddDog.mockResolvedValue({ error: null, data: { id: 'dog-1' } });

    await act(async () => { await findSave(node).props.onPress(); });

    expect(mockRequestMediaLibraryPermissions).not.toHaveBeenCalled();
    expect(mockLaunchImageLibrary).not.toHaveBeenCalled();
    expect(mockAddDog).toHaveBeenCalledWith('owner-1', expect.objectContaining({ photo_url: null }));
  });
});
