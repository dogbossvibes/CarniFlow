// Fährten-Einstellungen je Hund: Auswahl speichert sofort ins Konto (dogs.track_settings),
// ohne Spalte nur auf dem Gerät (Hinweis), und bietet nie «Verbellen» an.
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetDog = jest.fn();
const mockUpdate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'dog-1', name: 'Aron' }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'owner-1' } } }) }));
jest.mock('@/services/dogs', () => ({
  getDogById: (...a: unknown[]) => mockGetDog(...a),
  updateDog: (...a: unknown[]) => mockUpdate(...a),
}));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

/* eslint-disable import/first -- Mocks müssen vor den Imports registriert sein */
import DogTrackSettingsScreen from '@/app/dog-track-settings/[id]';
/* eslint-enable import/first */

type Node = any;
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); }); };
const byId = (r: Node, id: string) => r.root.find((n: Node) => n.props?.testID === id && typeof n.props.onPress === 'function');
const texts = (r: Node) => r.root.findAll((n: Node) => typeof n.children?.[0] === 'string').map((n: Node) => n.children[0]);

beforeEach(async () => {
  await AsyncStorage.clear();
  mockGetDog.mockReset(); mockUpdate.mockReset();
});

it('speichert die Anzeige ins Konto und bietet nur Liegen, Sitzen, Stehen, Aufnehmen', async () => {
  let row: Record<string, unknown> = { id: 'dog-1', owner_id: 'owner-1', track_settings: { version: 1, futureKey: 'keep' } };
  mockGetDog.mockImplementation(async () => ({ data: row, error: null }));
  mockUpdate.mockImplementation(async (_id: string, u: Record<string, unknown>) => { row = { ...row, ...u }; return { data: row, error: null }; });
  let r: Node;
  await act(async () => { r = TestRenderer.create(<DogTrackSettingsScreen />); });
  await flush();
  const shown = texts(r!);
  for (const key of ['down', 'sit', 'stand', 'retrieve']) expect(shown).toContain(`track.settings.indication.${key}`);
  expect(shown.some((s: string) => /bark|bell/i.test(s))).toBe(false);
  await act(async () => { byId(r!, 'indication-down').props.onPress(); });
  await flush();
  expect(mockUpdate).toHaveBeenLastCalledWith('dog-1', { track_settings: { version: 1, futureKey: 'keep', indication: 'down' } });
  expect(texts(r!)).not.toContain('track.settings.deviceOnly');
});

it('ohne Spalte (Migration offen): nur auf dem Gerät, mit Hinweis, kein Schreibversuch', async () => {
  mockGetDog.mockResolvedValue({ data: { id: 'dog-1', owner_id: 'owner-1' }, error: null });
  let r: Node;
  await act(async () => { r = TestRenderer.create(<DogTrackSettingsScreen />); });
  await flush();
  await act(async () => { byId(r!, 'reminder-60').props.onPress(); });
  await flush();
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(texts(r!)).toContain('track.settings.deviceOnly');
  const cached = JSON.parse((await AsyncStorage.getItem('anyvo.dogTrackSettings.v1::owner-1::dog-1'))!);
  expect(cached).toEqual({ raw: { version: 1, layReminderMin: 60 }, pending: true, pendingKeys: ['layReminderMin'] });
});
