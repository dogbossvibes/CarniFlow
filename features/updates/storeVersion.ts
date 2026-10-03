import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

// Existing public ANYVO link in legal-web and App Store Connect ID in eas.json.
export const ANYVO_APP_STORE_URL = 'https://apps.apple.com/app/id6776362904';
const APP_STORE_ID = 6776362904;
const LOOKUP_URL = `https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=ch`;
export const STORE_UPDATE_KEY = 'anyvo:updates:store:v1';
export const STORE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const STORE_DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredStoreState {
  checkedAt: number;
  knownVersion: string | null;
  dismissedVersion: string | null;
  dismissedAt: number;
}

const EMPTY_STATE: StoredStoreState = {
  checkedAt: 0, knownVersion: null, dismissedVersion: null, dismissedAt: 0,
};

export type StoreUpdateStatus = 'unknown' | 'current' | 'available';
let status: StoreUpdateStatus = 'unknown';
const listeners = new Set<() => void>();
export const getStoreUpdateStatus = () => status;
export const subscribeStoreUpdateStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
function setStatus(next: StoreUpdateStatus) {
  if (status === next) return;
  status = next;
  for (const listener of listeners) listener();
}

export function getInstalledVersion(): string | null {
  return Application.nativeApplicationVersion;
}

export function getInstalledBuild(): string | null {
  return Application.nativeBuildVersion;
}

export function compareVersions(left: string, right: string): number | null {
  const parse = (value: string) => /^\d+(?:\.\d+)*$/.test(value)
    ? value.split('.').map(Number) : null;
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return Math.sign(delta);
  }
  return 0;
}

export function isProductionIosBuild(): boolean {
  return !__DEV__
    && Platform.OS === 'ios'
    && Constants.executionEnvironment !== 'storeClient'
    && Updates.isEnabled
    && Updates.channel === 'production';
}

export async function fetchPublicStoreVersion(
  fetcher: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const response = await fetcher(LOOKUP_URL);
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('results' in body) || !Array.isArray(body.results)) return null;
    const app = body.results.find((item: unknown) =>
      !!item && typeof item === 'object'
      && 'trackId' in item && item.trackId === APP_STORE_ID
      && 'bundleId' in item && item.bundleId === 'com.anyvo.app');
    return app && typeof app.version === 'string' && compareVersions(app.version, app.version) !== null
      ? app.version : null;
  } catch {
    return null;
  }
}

async function readState(): Promise<StoredStoreState> {
  try {
    const raw = await AsyncStorage.getItem(STORE_UPDATE_KEY);
    if (!raw) return { ...EMPTY_STATE };
    const parsed = JSON.parse(raw) as Partial<StoredStoreState>;
    return {
      checkedAt: Number.isFinite(parsed.checkedAt) ? parsed.checkedAt! : 0,
      knownVersion: typeof parsed.knownVersion === 'string' ? parsed.knownVersion : null,
      dismissedVersion: typeof parsed.dismissedVersion === 'string' ? parsed.dismissedVersion : null,
      dismissedAt: Number.isFinite(parsed.dismissedAt) ? parsed.dismissedAt! : 0,
    };
  } catch {
    return { ...EMPTY_STATE };
  }
}

async function writeState(next: StoredStoreState): Promise<void> {
  try { await AsyncStorage.setItem(STORE_UPDATE_KEY, JSON.stringify(next)); } catch { /* optional hint */ }
}

export function shouldShowStoreNotice(
  installedVersion: string,
  state: StoredStoreState,
  now: number,
): boolean {
  if (!state.knownVersion || compareVersions(state.knownVersion, installedVersion) !== 1) return false;
  return state.dismissedVersion !== state.knownVersion
    || now - state.dismissedAt >= STORE_DISMISS_COOLDOWN_MS;
}

let currentCheck: Promise<string | null> | null = null;
export function refreshStoreVersion(now = Date.now()): Promise<string | null> {
  if (!isProductionIosBuild()) return Promise.resolve(null);
  if (currentCheck) return currentCheck;
  currentCheck = (async () => {
    const installed = getInstalledVersion();
    if (!installed) return null;
    const state = await readState();
    if (state.knownVersion && compareVersions(state.knownVersion, installed) !== null) {
      setStatus(compareVersions(state.knownVersion, installed) === 1 ? 'available' : 'current');
    }
    if (now - state.checkedAt >= STORE_CHECK_INTERVAL_MS) {
      const version = await fetchPublicStoreVersion();
      state.checkedAt = now;
      if (version) {
        state.knownVersion = version;
        setStatus(compareVersions(version, installed) === 1 ? 'available' : 'current');
      }
      await writeState(state);
    }
    return shouldShowStoreNotice(installed, state, now) ? state.knownVersion : null;
  })().finally(() => { currentCheck = null; });
  return currentCheck;
}

export async function dismissStoreVersion(version: string, now = Date.now()): Promise<void> {
  const state = await readState();
  state.dismissedVersion = version;
  state.dismissedAt = now;
  await writeState(state);
}
