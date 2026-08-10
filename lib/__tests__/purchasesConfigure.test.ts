// Init-Lifecycle-Regression (Apple 2.1b Root Cause): RevenueCat muss VOR jedem
// Store-Zugriff konfiguriert sein, idempotent, mit sauberem User-Switch.

const mockConfigure = jest.fn();
const mockIsConfigured = jest.fn();
const mockLogIn = jest.fn();

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: (...a: unknown[]) => mockConfigure(...a),
    isConfigured: (...a: unknown[]) => mockIsConfigured(...a),
    logIn: (...a: unknown[]) => mockLogIn(...a),
    setLogLevel: jest.fn(),
    LOG_LEVEL: { DEBUG: 'DEBUG' },
  },
}));

type PurchasesModule = typeof import('@/lib/purchases');

function load(key: string = 'appl_test'): PurchasesModule {
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = key;
  let mod: PurchasesModule | undefined;
  jest.isolateModules(() => { mod = require('@/lib/purchases') as PurchasesModule; });
  return mod as PurchasesModule;
}

beforeEach(() => { mockConfigure.mockReset(); mockIsConfigured.mockReset(); mockLogIn.mockReset(); });
afterAll(() => { delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY; });

describe('RevenueCat Init-Lifecycle', () => {
  it('configurePurchases konfiguriert genau einmal (idempotent, gleicher User)', () => {
    const m = load();
    m.configurePurchases('user-1');
    m.configurePurchases('user-1');
    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(mockConfigure).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'appl_test', appUserID: 'user-1' }));
    expect(m.purchasesReady()).toBe(true);
  });

  it('anderer User nach Konfiguration → logIn statt Re-configure', () => {
    const m = load();
    m.configurePurchases('user-1');
    m.configurePurchases('user-2');
    expect(mockConfigure).toHaveBeenCalledTimes(1);
    expect(mockLogIn).toHaveBeenCalledWith('user-2');
  });

  it('ensure: natives isConfigured=true → kein zweites configure', async () => {
    const m = load();
    mockIsConfigured.mockResolvedValue(true);
    const ok = await m.ensurePurchasesConfigured('user-1');
    expect(ok).toBe(true);
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it('ensure: SDK noch nicht konfiguriert → configure vor Zugriff', async () => {
    const m = load();
    mockIsConfigured.mockResolvedValue(false);
    const ok = await m.ensurePurchasesConfigured('user-1');
    expect(ok).toBe(true);
    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });

  it('ensure mit gleicher User-ID → idempotent (kein logIn)', async () => {
    const m = load();
    m.configurePurchases('user-1');
    mockIsConfigured.mockResolvedValue(true);
    mockLogIn.mockReset();
    await m.ensurePurchasesConfigured('user-1');
    expect(mockLogIn).not.toHaveBeenCalled();
  });

  it('fehlender API-Key → ensure=false, KEIN configure (verhindert „no singleton"-Blindflug)', async () => {
    const m = load('');
    expect(m.hasPurchasesApiKey()).toBe(false);
    const ok = await m.ensurePurchasesConfigured('user-1');
    expect(ok).toBe(false);
    expect(mockConfigure).not.toHaveBeenCalled();
  });

  it('configure-Fehler → kontrolliert (kein Throw, purchasesReady=false)', () => {
    const m = load();
    mockConfigure.mockImplementation(() => { throw new Error('boom'); });
    expect(() => m.configurePurchases('user-1')).not.toThrow();
    expect(m.purchasesReady()).toBe(false);
  });
});
