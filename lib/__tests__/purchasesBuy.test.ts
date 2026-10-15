
import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';
import type { PurchasePackage } from '@/lib/purchases';
jest.mock('@/lib/supabase', () => ({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'A'}}},error:null}),getUser:async()=>({data:{user:{id:'A'}},error:null}),onAuthStateChange:jest.fn()}}}));
process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'appl_synthetic';
process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'goog_synthetic';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- keys set before isolated SDK module load.
const {buyPackage} = require('@/lib/purchases') as typeof import('@/lib/purchases');

// react-native-purchases mocken → lib/purchases.ts erhält diese Default-Instanz.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    purchasePackage: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    restorePurchases: jest.fn(),
    configure: jest.fn(),
    isConfigured: jest.fn(async()=>true),
    getAppUserID: jest.fn(async()=>'A'),
    logIn: jest.fn(),
  },
}));

const mockPP = Purchases.purchasePackage as unknown as jest.Mock;

// CustomerInfo mit aktivem Trainer-Entitlement → fromInfo() liefert ok:true.
const okInfo = {
  entitlements: { active: { trainer: { expirationDate: '2030-01-01' } } },
  activeSubscriptions: [],
  allPurchasedProductIdentifiers: [],
};

const setPlatform = (os: string) => { (Platform as unknown as { OS: string }).OS = os; };

const pkg: PurchasePackage = {
  id: 'p', offeringId: 'o', title: 't', priceString: '', packageType: '',
  productId: 'anyvo_trainer_monthly_30.00', tier: 'trainer', raw: { RAW: true },
};

describe('buyPackage — Android Product-Change Wiring', () => {
  beforeEach(() => { mockPP.mockReset(); mockPP.mockResolvedValue({ customerInfo: okInfo }); });
  afterEach(() => setPlatform('ios'));

  it('Android Active→Trainer: übergibt oldProductIdentifier + WITH_TIME_PRORATION (3. Argument)', async () => {
    setPlatform('android');
    await buyPackage(pkg, { userId: 'A', oldProductIdentifier: 'anyvo_active_monthly_10' });
    expect(mockPP).toHaveBeenCalledWith(pkg.raw, null, {
      oldProductIdentifier: 'anyvo_active_monthly_10',
      replacementMode: 'WITH_TIME_PRORATION',
    });
  });

  it('Android Founder→Trainer: übergibt den Founder-Identifier als oldProductIdentifier', async () => {
    setPlatform('android');
    await buyPackage(pkg, { userId: 'A', oldProductIdentifier: 'anyvo_founder_active_monthly_8.00' });
    expect(mockPP).toHaveBeenCalledWith(pkg.raw, null, {
      oldProductIdentifier: 'anyvo_founder_active_monthly_8.00',
      replacementMode: 'WITH_TIME_PRORATION',
    });
  });

  it('Android Neukauf (Newbie→bezahlt, kein alter Identifier): normaler Kauf ohne Change-Info', async () => {
    setPlatform('android');
    await buyPackage(pkg, { userId: 'A' });
    expect(mockPP).toHaveBeenCalledWith(pkg.raw);
    expect(mockPP.mock.calls[0]).toHaveLength(1);
  });

  it('iOS-Wechsel: KEINE Change-Info (unverändert), auch wenn oldProductIdentifier gesetzt', async () => {
    setPlatform('ios');
    await buyPackage(pkg, { userId: 'A', oldProductIdentifier: 'anyvo_active_monthly_10' });
    expect(mockPP).toHaveBeenCalledWith(pkg.raw);
    expect(mockPP.mock.calls[0]).toHaveLength(1);
  });

  it('Kauf-Fehler → ok:false mit Fehlermeldung', async () => {
    setPlatform('android');
    mockPP.mockRejectedValueOnce({ message: 'boom' });
    const res = await buyPackage(pkg, { userId: 'A', oldProductIdentifier: 'anyvo_active_monthly_10' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
  });

  it('Nutzer-Abbruch → cancelled:true', async () => {
    setPlatform('android');
    mockPP.mockRejectedValueOnce({ userCancelled: true });
    const res = await buyPackage(pkg, { userId: 'A' });
    expect(res.cancelled).toBe(true);
  });
});
