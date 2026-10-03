jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.3', nativeBuildVersion: '48' }));
jest.mock('expo-constants', () => ({ executionEnvironment: 'standalone' }));
jest.mock('expo-updates', () => ({ isEnabled: true, channel: 'production' }));

import {
  ANYVO_APP_STORE_URL, STORE_DISMISS_COOLDOWN_MS,
  compareVersions, fetchPublicStoreVersion, getInstalledBuild, getInstalledVersion,
  refreshStoreVersion, shouldShowStoreNotice, dismissStoreVersion, STORE_UPDATE_KEY,
} from '@/features/updates/storeVersion';
import AsyncStorage from '@react-native-async-storage/async-storage';

const state = (knownVersion: string, dismissedVersion: string | null = null, dismissedAt = 0) => ({
  checkedAt: 0, knownVersion, dismissedVersion, dismissedAt,
});

describe('iOS App-Store-Version', () => {
  it('vergleicht numerische Versionssegmente korrekt', () => {
    expect(compareVersions('1.0.4', '1.0.3')).toBe(1);
    expect(compareVersions('1.0.4', '1.0.4')).toBe(0);
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.0.9', '1.0.10')).toBe(-1);
    expect(compareVersions('bad', '1.0.3')).toBeNull();
  });

  it('meldet nur bei neuerer Store-Version und nach einem vernünftigen Cooldown', () => {
    expect(shouldShowStoreNotice('1.0.3', state('1.0.4'), 1000)).toBe(true);
    expect(shouldShowStoreNotice('1.0.4', state('1.0.4'), 1000)).toBe(false);
    expect(shouldShowStoreNotice('1.0.10', state('1.0.9'), 1000)).toBe(false);
    expect(shouldShowStoreNotice('1.0.3', state('1.0.4', '1.0.4', 1000), 2000)).toBe(false);
    expect(shouldShowStoreNotice('1.0.3', state('1.0.4', '1.0.4', 1000), 1000 + STORE_DISMISS_COOLDOWN_MS)).toBe(true);
    expect(shouldShowStoreNotice('1.0.3', state('1.0.5', '1.0.4', 1000), 2000)).toBe(true);
  });

  it('nutzt native Versionsdaten und den im Projekt belegten ANYVO-Link', () => {
    expect(getInstalledVersion()).toBe('1.0.3');
    expect(getInstalledBuild()).toBe('48');
    expect(ANYVO_APP_STORE_URL).toBe('https://apps.apple.com/app/id6776362904');
  });

  it('liest ausschliesslich die passende ANYVO-App aus Apples öffentlichem Lookup', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [
        { trackId: 1, bundleId: 'other.app', version: '99.0.0' },
        { trackId: 6776362904, bundleId: 'com.anyvo.app', version: '1.0.4' },
      ] }),
    });
    expect(await fetchPublicStoreVersion(fetcher)).toBe('1.0.4');
    expect(fetcher).toHaveBeenCalledWith('https://itunes.apple.com/lookup?id=6776362904&country=ch');
  });

  it('behandelt Netzwerkfehler still', async () => {
    expect(await fetchPublicStoreVersion(jest.fn().mockRejectedValue(new Error('offline')))).toBeNull();
  });

  it('führt in DEV keinen Production-Check aus', async () => {
    const fetcher = jest.spyOn(global, 'fetch');
    await expect(refreshStoreVersion()).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
  });

  it('prüft einen Production-Build einmal, speichert die Version und respektiert Später', async () => {
    const originalDev = __DEV__;
    (global as typeof globalThis & { __DEV__: boolean }).__DEV__ = false;
    await AsyncStorage.clear();
    const fetcher = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ trackId: 6776362904, bundleId: 'com.anyvo.app', version: '1.0.4' }] }),
    } as Response);
    try {
      const now = Date.now();
      expect(await refreshStoreVersion(now)).toBe('1.0.4');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(JSON.parse((await AsyncStorage.getItem(STORE_UPDATE_KEY))!)).toMatchObject({ knownVersion: '1.0.4' });
      await dismissStoreVersion('1.0.4', now);
      expect(await refreshStoreVersion(now + 1000)).toBeNull();
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      fetcher.mockRestore();
      (global as typeof globalThis & { __DEV__: boolean }).__DEV__ = originalDev;
    }
  });
});
