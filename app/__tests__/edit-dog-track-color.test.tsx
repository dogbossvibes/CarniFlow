// Hundeprofil bearbeiten — Fährtenfarbe über den BESTEHENDEN Save (updateDog), ohne neuen Flow:
// • Spalte noch nicht migriert → Abschnitt ausgeblendet, Feld wird nie gesendet (Save bleibt intakt)
// • Farbe gesendet nur bei Änderung; alle anderen Felder identisch zum Save ohne Farbänderung
// • Save-Fehler → Fehlermeldung, kein Zurück (bestehendes Verhalten, kein Optimistic UI)
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';

const mockBack = jest.fn();
const mockGetDog = jest.fn();
const mockUpdate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'dog-malu' }),
}));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'owner-1' } } }) }));
jest.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: () => null }));
jest.mock('@/services/dogs', () => ({
  getDogById: (...a: unknown[]) => mockGetDog(...a),
  updateDog: (...a: unknown[]) => mockUpdate(...a),
  deleteDogWithDependents: jest.fn(),
}));
jest.mock('@/services/storage', () => ({ uploadDogImage: jest.fn() }));
jest.mock('@/lib/haptics', () => ({ haptic: { light: jest.fn(), success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/ui/DateField', () => ({ DateField: () => null }));
jest.mock('@/components/dogs/DisciplinePicker', () => ({ DisciplinePicker: () => null, disciplineToStored: (v: string) => v || null }));
jest.mock('@/components/dogs/OfficialRegistrySection', () => ({ OfficialRegistrySection: () => null }));
jest.mock('@/components/ui/AnyvoBottomSheet', () => ({ AnyvoBottomSheet: () => null }));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import HundBearbeitenScreen from '@/app/edit-dog';
/* eslint-enable import/first */

type Node = any;
const DOG = {
  id: 'dog-malu', owner_id: 'owner-1', name: 'Malu', breed: 'Malinois', birth_date: null, weight_kg: 28, gender: 'female',
  photo_url: null, titles: ['IGP 1'], sire: null, dam: null, kennel: null, is_favorite: false, color: 'Fawn',
  microchip_number: '756', tasso_registered: false, registry_country_code: null, registry_type: null, registry_name: null,
  registry_number: null, discipline: 'IGP', level: null, best_score: null, vet: 'Dr. X', vaccination: null, food: null,
  created_at: '2026-01-01',
};
let r: Node = null;
const mount = async (dog: Record<string, unknown>) => {
  mockGetDog.mockResolvedValue({ data: dog, error: null });
  await act(async () => { r = TestRenderer.create(<HundBearbeitenScreen />); });
  await act(async () => { await Promise.resolve(); });
};
const byId = (id: string) => r.root.findAll((n: Node) => n.props.testID === id)[0];
const save = async () => {
  const btn = r.root.findAll((c: Node) => typeof c.props.onPress === 'function' && c.findAllByType(Text).some((t: Node) => t.props.children === 'dog.saveChanges'))[0];
  await act(async () => { await btn.props.onPress(); });
};
const texts = () => r.root.findAllByType(Text).map((t: Node) => [].concat(t.props.children).join(''));

beforeEach(() => { [mockBack, mockGetDog, mockUpdate].forEach(m => m.mockReset()); mockUpdate.mockResolvedValue({ data: {}, error: null }); });
afterEach(() => { if (r) act(() => r.unmount()); r = null; });

it('Spalte noch nicht migriert → kein Abschnitt, Feld wird nie gesendet, Save funktioniert', async () => {
  await mount(DOG);
  expect(byId('track-color-auto')).toBeUndefined();
  expect(texts()).not.toContain('dog.trackColor.section');
  await save();
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty('track_overlay_color_key');
  expect(mockBack).toHaveBeenCalled();
});

it('Spalte vorhanden (Automatisch) → Abschnitt sichtbar; Violett wählen → nur dieses Feld zusätzlich gesendet', async () => {
  await mount({ ...DOG, track_overlay_color_key: null });
  expect(texts()).toContain('dog.trackColor.section');
  expect(byId('track-color-auto').props.accessibilityState).toMatchObject({ selected: true });
  await save();   // ohne Änderung
  const withoutChange = mockUpdate.mock.calls[0][1];
  expect(withoutChange).not.toHaveProperty('track_overlay_color_key');

  act(() => r.unmount()); r = null; mockUpdate.mockClear();
  await mount({ ...DOG, track_overlay_color_key: null });
  act(() => byId('track-color-violet').props.onPress());
  expect(byId('track-color-violet').props.accessibilityState).toMatchObject({ selected: true });
  await save();
  const withChange = mockUpdate.mock.calls[0][1];
  expect(mockUpdate.mock.calls[0][0]).toBe('dog-malu');
  expect(withChange.track_overlay_color_key).toBe('violet');
  const { track_overlay_color_key: _k, ...rest } = withChange;
  expect(rest).toEqual(withoutChange);   // keine anderen Dog-Felder verändert
});

it('gespeicherte Farbe → zurück auf Automatisch sendet NULL', async () => {
  await mount({ ...DOG, track_overlay_color_key: 'orange' });
  expect(byId('track-color-orange').props.accessibilityState).toMatchObject({ selected: true });
  act(() => byId('track-color-auto').props.onPress());
  await save();
  expect(mockUpdate.mock.calls[0][1].track_overlay_color_key).toBeNull();
});

it('Save-Fehler → Fehlermeldung, kein Zurück (nicht als gespeichert behandelt)', async () => {
  mockUpdate.mockResolvedValue({ data: null, error: { message: 'network' } });
  await mount({ ...DOG, track_overlay_color_key: null });
  act(() => byId('track-color-pink').props.onPress());
  await save();
  expect(texts()).toContain('dog.saveErrorPlain');
  expect(mockBack).not.toHaveBeenCalled();
});
