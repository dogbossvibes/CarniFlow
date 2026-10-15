const mockConfigure=jest.fn(),mockIsConfigured=jest.fn(),mockLogIn=jest.fn(),mockGetID=jest.fn();
let mockUser='A',mockNative='A';
let mockAuthListener:(event:string,session:{user:{id:string}}|null)=>void=()=>{};
jest.mock('@/lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:mockUser}}},error:null}),getUser:async()=>({data:{user:{id:mockUser}},error:null}),onAuthStateChange:(callback:typeof mockAuthListener)=>{mockAuthListener=callback;}}}}));
jest.mock('react-native-purchases',()=>({__esModule:true,default:{configure:(...a:unknown[])=>mockConfigure(...a),isConfigured:()=>mockIsConfigured(),getAppUserID:()=>mockGetID(),logIn:(uid:string)=>mockLogIn(uid)}}));
function load(key='appl_synthetic') {
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY=key;
  let mod:typeof import('@/lib/purchases');
  jest.isolateModules(()=>{
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- exercise initialization with a new module per test.
    mod=require('@/lib/purchases');
  });return mod!;
}
beforeEach(()=>{mockUser='A';mockNative='A';mockConfigure.mockReset();mockIsConfigured.mockReset().mockResolvedValue(false);mockGetID.mockReset().mockImplementation(async()=>mockNative);mockLogIn.mockReset().mockImplementation(async(uid:string)=>{mockNative=uid;});mockConfigure.mockImplementation(()=>{mockIsConfigured.mockResolvedValue(true);});});
afterAll(()=>{delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;});
it('idempotent initialization awaits readiness and configures the authenticated account once',async()=>{
  const m=load();m.configurePurchases('A');await expect(m.ensurePurchasesConfigured('A')).resolves.toBe(true);
  expect(mockConfigure).toHaveBeenCalledTimes(1);expect(mockConfigure).toHaveBeenCalledWith({apiKey:'appl_synthetic',appUserID:'A'});expect(m.purchasesReady()).toBe(true);
});
it('auth switch logs in and verifies the new native account without reconfigure',async()=>{
  const m=load();await m.ensurePurchasesConfigured('A');mockUser='B';mockAuthListener('SIGNED_IN',{user:{id:'B'}});
  await expect(m.ensurePurchasesConfigured('B')).resolves.toBe(true);expect(mockConfigure).toHaveBeenCalledTimes(1);expect(mockLogIn).toHaveBeenCalledWith('B');
});
it('native configured status avoids another configure but still checks native identity',async()=>{
  const m=load();mockIsConfigured.mockResolvedValue(true);await expect(m.ensurePurchasesConfigured('A')).resolves.toBe(true);expect(mockConfigure).not.toHaveBeenCalled();expect(mockGetID).toHaveBeenCalled();
});
it('same UID requires no logIn',async()=>{const m=load();await m.ensurePurchasesConfigured('A');await m.ensurePurchasesConfigured('A');expect(mockLogIn).not.toHaveBeenCalled();});
it('missing key fails closed before SDK configure',async()=>{const m=load('');await expect(m.ensurePurchasesConfigured('A')).resolves.toBe(false);expect(mockConfigure).not.toHaveBeenCalled();});
it('configure failure stays controlled and not ready',async()=>{const m=load();mockConfigure.mockImplementation(()=>{throw Error('failed');});await expect(m.ensurePurchasesConfigured('A')).resolves.toBe(false);expect(m.purchasesReady()).toBe(false);});
it('logout invalidates readiness without creating an anonymous RevenueCat identity',async()=>{
  const m=load();await m.ensurePurchasesConfigured('A');mockAuthListener('SIGNED_OUT',null);expect(m.purchasesReady()).toBe(false);expect(m.isPurchaseAccountCurrent('A')).toBe(false);expect(mockConfigure).toHaveBeenCalledTimes(1);
});
