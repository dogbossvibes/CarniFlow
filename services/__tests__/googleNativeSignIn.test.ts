/* eslint-disable import/first */

const mockSignIn = jest.fn();
const mockSignOut = jest.fn(() => Promise.resolve(null));
const mockConfigure = jest.fn();
const mockHasPlayServices = jest.fn(() => Promise.resolve(true));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: mockConfigure,
    signIn: mockSignIn,
    signOut: mockSignOut,
    hasPlayServices: mockHasPlayServices,
  },
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
  isErrorWithCode: (e: any) => e != null && typeof e === 'object' && 'code' in e,
  isCancelledResponse: (r: any) => r?.type === 'cancelled',
  isSuccessResponse: (r: any) => r?.type === 'success',
}));

import { Platform, TurboModuleRegistry } from 'react-native';

const WEB_ID = 'web-123.apps.googleusercontent.com';
const IOS_ID = 'ios-456.apps.googleusercontent.com';

function load(env: { web?: string; ios?: string }, os: 'ios' | 'android', hasModule = true) {
  jest.resetModules();
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = env.web ?? '';
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = env.ios ?? '';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rn = require('react-native') as typeof import('react-native');
  Object.defineProperty(rn.Platform, 'OS', { configurable: true, get: () => os });
  jest.spyOn(rn.TurboModuleRegistry, 'get').mockReturnValue(hasModule ? ({} as any) : null);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/services/googleNativeSignIn') as typeof import('@/services/googleNativeSignIn');
}

describe('googleNativeSignIn', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'tok' } });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    void TurboModuleRegistry;
  });

  it('ist ohne Web-Client-ID nicht verfügbar und lädt das Paket nicht', async () => {
    const m = load({}, 'android');
    expect(m.isNativeGoogleSignInAvailable()).toBe(false);
    await expect(m.getNativeGoogleIdToken()).resolves.toEqual({ type: 'unavailable', reason: 'not-configured' });
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it('ist auf iOS ohne iOS-Client-ID nicht verfügbar', () => {
    expect(load({ web: WEB_ID }, 'ios').isNativeGoogleSignInAvailable()).toBe(false);
  });

  it('ist ohne natives Modul (z. B. iOS 60) nicht verfügbar', () => {
    expect(load({ web: WEB_ID, ios: IOS_ID }, 'ios', false).isNativeGoogleSignInAvailable()).toBe(false);
  });

  it('liefert auf Android das ID-Token und erzwingt die Kontoauswahl', async () => {
    const m = load({ web: WEB_ID }, 'android');
    await expect(m.getNativeGoogleIdToken()).resolves.toEqual({ type: 'success', idToken: 'tok' });
    expect(mockConfigure).toHaveBeenCalledWith({ webClientId: WEB_ID });
    expect(mockHasPlayServices).toHaveBeenCalled();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('übergibt auf iOS die iOS-Client-ID', async () => {
    const m = load({ web: WEB_ID, ios: IOS_ID }, 'ios');
    await m.getNativeGoogleIdToken();
    expect(mockConfigure).toHaveBeenCalledWith({ webClientId: WEB_ID, iosClientId: IOS_ID });
    expect(mockHasPlayServices).not.toHaveBeenCalled();
  });

  it('meldet Abbruch als cancelled', async () => {
    mockSignIn.mockResolvedValueOnce({ type: 'cancelled', data: null });
    const m = load({ web: WEB_ID }, 'android');
    await expect(m.getNativeGoogleIdToken()).resolves.toEqual({ type: 'cancelled' });
  });

  it('meldet Konfigurationsfehler als unavailable statt zu werfen', async () => {
    mockSignIn.mockRejectedValueOnce(Object.assign(new Error('DEVELOPER_ERROR'), { code: '10' }));
    const m = load({ web: WEB_ID }, 'android');
    await expect(m.getNativeGoogleIdToken()).resolves.toEqual({ type: 'unavailable', reason: 'sign-in-error:10' });
  });

  it('meldet fehlende Play-Dienste als unavailable', async () => {
    mockHasPlayServices.mockRejectedValueOnce(Object.assign(new Error('no play'), { code: 'PLAY_SERVICES_NOT_AVAILABLE' }));
    const m = load({ web: WEB_ID }, 'android');
    await expect(m.getNativeGoogleIdToken()).resolves.toEqual({ type: 'unavailable', reason: 'native-error:PLAY_SERVICES_NOT_AVAILABLE' });
  });

  it('meldet fehlendes ID-Token als unavailable', async () => {
    mockSignIn.mockResolvedValueOnce({ type: 'success', data: { idToken: null } });
    const m = load({ web: WEB_ID }, 'android');
    await expect(m.getNativeGoogleIdToken()).resolves.toEqual({ type: 'unavailable', reason: 'no-id-token' });
  });
});
