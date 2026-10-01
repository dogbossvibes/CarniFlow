jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CURRENT_WHATS_NEW_RELEASE, LAST_SEEN_WHATS_NEW_KEY,
  markWhatsNewSeen, pendingWhatsNew,
} from '@/features/updates/whatsNew';

beforeEach(async () => { await AsyncStorage.clear(); });

describe('Neu in ANYVO', () => {
  it('zeigt die neue Tracking-UX-ID auch nach dem vorigen Release nur einmal', async () => {
    await markWhatsNewSeen('2026-09-newbie-backpack');
    expect(CURRENT_WHATS_NEW_RELEASE?.id).toBe('2026-10-tracking-ux');
    expect(await pendingWhatsNew()).toEqual(CURRENT_WHATS_NEW_RELEASE);
    await markWhatsNewSeen(CURRENT_WHATS_NEW_RELEASE!.id);
    expect(await AsyncStorage.getItem(LAST_SEEN_WHATS_NEW_KEY)).toBe('2026-10-tracking-ux');
    expect(await pendingWhatsNew()).toBeNull();
  });

  it('zeigt eine spätere Release-ID erneut', async () => {
    await markWhatsNewSeen(CURRENT_WHATS_NEW_RELEASE!.id);
    expect(await pendingWhatsNew({ ...CURRENT_WHATS_NEW_RELEASE!, id: 'next-release' })).not.toBeNull();
  });

  it('kann ohne Release-Hinweis deaktiviert werden', async () => {
    expect(await pendingWhatsNew(null)).toBeNull();
  });
});
