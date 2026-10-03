import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TranslationKey } from '@/i18n';

// Keep the established key so a previously acknowledged release can be compared.
export const LAST_SEEN_WHATS_NEW_KEY = 'anyvo:updates:lastSeenWhatsNewId';

export interface WhatsNewRelease {
  id: string;
  titleKey: TranslationKey;
  itemKeys: TranslationKey[];
}

// Set to null for releases without a customer-facing announcement.
export const CURRENT_WHATS_NEW_RELEASE: WhatsNewRelease | null = {
  id: '2026-10-tracking-angle-analysis',
  titleKey: 'updates.whatsNewTitle',
  itemKeys: [
    'updates.whatsNewTrackingAngles',
  ],
};

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export async function pendingWhatsNew(
  release: WhatsNewRelease | null = CURRENT_WHATS_NEW_RELEASE,
  storage: Storage = AsyncStorage,
): Promise<WhatsNewRelease | null> {
  if (!release) return null;
  try {
    return (await storage.getItem(LAST_SEEN_WHATS_NEW_KEY)) === release.id ? null : release;
  } catch {
    // A storage failure must not show the card at every launch.
    return null;
  }
}

export async function markWhatsNewSeen(id: string, storage: Storage = AsyncStorage): Promise<void> {
  await storage.setItem(LAST_SEEN_WHATS_NEW_KEY, id);
}
