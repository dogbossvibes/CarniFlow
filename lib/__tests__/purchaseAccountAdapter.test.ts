/** @jest-environment node */
import { createPurchaseAccountAdapter } from '../purchaseAccountAdapter';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return {promise,resolve}; }
function setup() {
  let user: string | null = 'A', nativeUser = '', configured = false;
  let listener: (event: string, session: {user:{id:string}} | null) => void = () => {};
  const auth = {
    getSession: jest.fn(async () => ({data:{session:user ? {user:{id:user}} : null},error:null})),
    getUser: jest.fn(async () => ({data:{user:user ? {id:user} : null},error:null})),
    onAuthStateChange: jest.fn((callback: typeof listener) => { listener = callback; }),
  };
  const sdk = {
    configure: jest.fn(({appUserID}: {apiKey:string;appUserID:string}) => { configured=true;nativeUser=appUserID; }),
    isConfigured: jest.fn(async () => configured),
    getAppUserID: jest.fn(async () => nativeUser),
    logIn: jest.fn(async (uid:string) => { nativeUser=uid; }),
  };
  const adapter = createPurchaseAccountAdapter(auth,sdk,()=>'appl_synthetic');
  return {adapter,auth,sdk,nativeUser:()=>nativeUser,change:(uid:string|null)=>{user=uid;listener('SIGNED_IN',uid?{user:{id:uid}}:null);}};
}
test('real adapter initializes exactly once with the authenticated UID and reads native identity', async()=>{
  const {adapter,sdk,auth}=setup();
  await expect(adapter.ensure('A')).resolves.toBe(true);
  await expect(adapter.ensure('A')).resolves.toBe(true);
  expect(sdk.configure).toHaveBeenCalledTimes(1);expect(sdk.configure).toHaveBeenCalledWith({apiKey:'appl_synthetic',appUserID:'A'});
  expect(sdk.logIn).not.toHaveBeenCalled();expect(auth.onAuthStateChange).toHaveBeenCalledTimes(1);
});
test('real native identity mismatch requires successful login and matching getAppUserID',async()=>{
  const {adapter,sdk,change}=setup(); await adapter.ensure('A');change('B');
  await expect(adapter.ensure('B')).resolves.toBe(true);expect(sdk.logIn).toHaveBeenCalledWith('B');
  sdk.getAppUserID.mockResolvedValue('A');await expect(adapter.ensure('B')).resolves.toBe(false);
});
test('failed login never starts a Store operation',async()=>{
  const {adapter,sdk,change}=setup();await adapter.ensure('A');change('B');sdk.logIn.mockRejectedValueOnce(new Error('offline'));
  const native=jest.fn(async()=>true);await expect(adapter.run('B',native)).rejects.toThrow('offline');expect(native).not.toHaveBeenCalled();
  await expect(adapter.run('B',native)).resolves.toBe(true);
});
test('logout fences a stale getSession response before SDK configuration',async()=>{
  const {adapter,auth,change,sdk}=setup();const read=deferred<{data:{session:{user:{id:string}}};error:null}>();
  auth.getSession.mockReturnValueOnce(read.promise);const ready=adapter.ensure('A');change(null);read.resolve({data:{session:{user:{id:'A'}}},error:null});
  await expect(ready).resolves.toBe(false);expect(sdk.configure).not.toHaveBeenCalled();
});
test.each(['purchase','restore','android old-product read'])('%s retains A SDK identity until native completion while B waits',async()=>{
  const {adapter,change,nativeUser}=setup();const entered=deferred<void>(),finish=deferred<string>();
  const operationA=adapter.run('A',async()=>{entered.resolve();return finish.promise;});
  const rejected=expect(operationA).rejects.toMatchObject({code:'IAP_ACCOUNT_CHANGED'});await entered.promise;
  change('B');const operationB=adapter.run('B',async()=>nativeUser());await Promise.resolve();expect(nativeUser()).toBe('A');
  finish.resolve('receipt-A');await rejected;await expect(operationB).resolves.toBe('B');
});
test('offline session read and signed-out operation never reach Store',async()=>{
  const {adapter,auth,change,sdk}=setup();auth.getSession.mockRejectedValueOnce(new Error('offline'));await expect(adapter.ensure('A')).resolves.toBe(false);
  change(null);const native=jest.fn(async()=>true);await expect(adapter.run('A',native)).rejects.toMatchObject({code:'IAP_ACCOUNT_CHANGED'});
  expect(sdk.configure).not.toHaveBeenCalled();expect(native).not.toHaveBeenCalled();
});
test('unverified auth UID never configures native identity',async()=>{
  const {adapter,auth,sdk}=setup();auth.getUser.mockResolvedValue({data:{user:{id:'B'}},error:null});await expect(adapter.ensure('A')).resolves.toBe(false);expect(sdk.configure).not.toHaveBeenCalled();
});
test('A-B-A while awaiting initial session does not start a stale purchase intent',async()=>{
  const {adapter,auth,change}=setup();await adapter.ensure('A');
  const read=deferred<{data:{session:{user:{id:string}}};error:null}>();
  auth.getSession.mockReturnValueOnce(read.promise);
  const native=jest.fn(async()=>true);
  const operation=adapter.run('A',native);
  const rejected=expect(operation).rejects.toMatchObject({code:'IAP_ACCOUNT_CHANGED'});
  change('B');change('A');read.resolve({data:{session:{user:{id:'A'}}},error:null});
  await rejected;expect(native).not.toHaveBeenCalled();
});
