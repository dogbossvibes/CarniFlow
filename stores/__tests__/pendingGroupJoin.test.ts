import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_GROUP_JOIN_MAX_AGE_MS, savePendingGroupJoin, takePendingGroupJoin } from '../pendingGroupJoin';

jest.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

beforeEach(async () => { await AsyncStorage.clear(); });

it('merkt einen gültigen Code und gibt ihn genau einmal zurück', async () => {
  await savePendingGroupJoin('abcd-ef01-2345', 1000);
  expect(await takePendingGroupJoin(2000)).toBe('ABCDEF012345');
  expect(await takePendingGroupJoin(3000)).toBeNull();
});

it('merkt keine unvollständigen Codes', async () => {
  await savePendingGroupJoin('ABC', 1000);
  expect(await takePendingGroupJoin(2000)).toBeNull();
});

it('verwirft Codes, die älter als 24 Stunden sind, und entfernt sie', async () => {
  await savePendingGroupJoin('ABCDEF012345', 0);
  expect(await takePendingGroupJoin(PENDING_GROUP_JOIN_MAX_AGE_MS + 1)).toBeNull();
  expect(await AsyncStorage.getAllKeys()).toHaveLength(0);
});

it('übersteht beschädigte Einträge', async () => {
  await AsyncStorage.setItem('anyvo.groups.pendingJoinCode.v1', '{kaputt');
  expect(await takePendingGroupJoin(1)).toBeNull();
});

it('Tab-Layout öffnet «Gruppe beitreten» erst nach Anmeldung und Einführung wieder', () => {
  const { readFileSync } = jest.requireActual<typeof import('fs')>('fs');
  const { join } = jest.requireActual<typeof import('path')>('path');
  const src = readFileSync(join(__dirname, '..', '..', 'app', '(tabs)', '_layout.tsx'), 'utf8');
  expect(src).toMatch(/if \(!uid \|\| onboardingGate !== 'skip'\) return;\s*\n\s*\/\/[^\n]*\n\s*void takePendingGroupJoin\(\)/);
  expect(src).toMatch(/pathname: '\/groups\/join', params: \{ code \}/);
});
