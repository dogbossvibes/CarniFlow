import { createPurchaseAccountGuard, PurchaseAccountError } from '../purchaseAccountGuard';
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return {promise, resolve};
}
function setup() {
  let nativeUser = '';
  const adapter = {
    confirmAccount: jest.fn(async (_uid: string) => true),
    prepareIdentity: jest.fn(async (uid: string) => { nativeUser = uid; return true; }),
  };
  return { adapter, guard: createPurchaseAccountGuard(adapter), nativeUser: () => nativeUser };
}
test.each(['purchase', 'restore'])('%s cannot execute as B when requested by A', async () => {
  const {guard, nativeUser} = setup();
  guard.accountChanged('A');
  const native = jest.fn(async () => nativeUser());
  const operation = guard.run('A', native);
  guard.accountChanged('B');
  await expect(operation).rejects.toMatchObject({code:'IAP_ACCOUNT_CHANGED'});
  expect(native).not.toHaveBeenCalled();
});
test('native identity stays A during an already open Store operation; A receives no success after switching', async () => {
  const {guard, nativeUser, adapter} = setup();
  const entered = deferred<void>(), finish = deferred<string>();
  guard.accountChanged('A');
  const operationA = guard.run('A', async () => { entered.resolve(); return finish.promise; });
  // Attach rejection handling before intentionally invalidating this operation.
  const rejectedA = expect(operationA).rejects.toMatchObject({code:'IAP_ACCOUNT_CHANGED'});
  await entered.promise;
  guard.accountChanged('B');
  const operationB = guard.run('B', async () => nativeUser());
  expect(nativeUser()).toBe('A');
  expect(adapter.prepareIdentity.mock.calls.map(x => x[0])).toEqual(['A']);
  finish.resolve('old result');
  await rejectedA;
  await expect(operationB).resolves.toBe('B');
});
test('A to B to A invalidates the earlier A operation even though the UID matches again', async () => {
  const {guard} = setup();
  guard.accountChanged('A');
  const native = jest.fn(async () => true);
  const operation = guard.run('A', native);
  guard.accountChanged('B'); guard.accountChanged('A');
  await expect(operation).rejects.toMatchObject({code:'IAP_ACCOUNT_CHANGED'});
  expect(native).not.toHaveBeenCalled();
});
test('logout cancels queued work and rejects anonymous use before native calls', async () => {
  const {guard, adapter} = setup();
  guard.accountChanged('A');
  const operation = guard.prepare('A');
  guard.accountChanged(null);
  await expect(operation).rejects.toBeInstanceOf(PurchaseAccountError);
  await expect(guard.prepare('')).rejects.toBeInstanceOf(PurchaseAccountError);
  expect(adapter.prepareIdentity).not.toHaveBeenCalled();
});
test('failed login does not start the Store operation or poison subsequent attempts', async () => {
  const {guard, adapter} = setup();
  guard.accountChanged('A');
  adapter.prepareIdentity.mockResolvedValueOnce(false);
  const native = jest.fn(async () => true);
  await expect(guard.run('A', native)).rejects.toMatchObject({code:'IAP_ACCOUNT_NOT_READY'});
  expect(native).not.toHaveBeenCalled();
  await expect(guard.run('A', native)).resolves.toBe(true);
});
test('failed account verification performs no native configuration or work', async () => {
  const {guard, adapter} = setup();
  guard.accountChanged('A'); adapter.confirmAccount.mockResolvedValue(false);
  const native = jest.fn(async () => true);
  await expect(guard.run('A', native)).rejects.toMatchObject({code:'IAP_ACCOUNT_CHANGED'});
  expect(adapter.prepareIdentity).not.toHaveBeenCalled(); expect(native).not.toHaveBeenCalled();
});
test('account change while native login awaits blocks Store work', async () => {
  const {guard, adapter} = setup();
  const entered = deferred<void>(), loggedIn = deferred<boolean>();
  adapter.prepareIdentity.mockImplementation(async () => { entered.resolve(); return loggedIn.promise; });
  guard.accountChanged('A');
  const native = jest.fn(async () => true);
  const operation = guard.run('A', native);
  const rejected = expect(operation).rejects.toMatchObject({code:'IAP_ACCOUNT_CHANGED'});
  await entered.promise; guard.accountChanged('B'); loggedIn.resolve(true);
  await rejected; expect(native).not.toHaveBeenCalled();
});
test('native failure does not poison the shared queue', async () => {
  const {guard} = setup(); guard.accountChanged('A');
  await expect(guard.run('A', async () => { throw new Error('cancelled'); })).rejects.toThrow('cancelled');
  await expect(guard.run('A', async () => 'ok')).resolves.toBe('ok');
});
test('same-account token refresh preserves a queued request', async () => {
  const {guard, nativeUser} = setup(); guard.accountChanged('A');
  const operation = guard.run('A', async () => nativeUser());
  guard.accountChanged('A');
  await expect(operation).resolves.toBe('A');
});
test.each([1, 2, 3])('auth change at verification await boundary %i cannot escape the synchronous fence', async boundary => {
  const {guard, adapter} = setup(); guard.accountChanged('A');
  let confirmations = 0;
  adapter.confirmAccount.mockImplementation(async () => {
    if (++confirmations === boundary) {
      // Changes after confirm's own check but before its awaiting caller resumes.
      queueMicrotask(() => queueMicrotask(() => guard.accountChanged('B')));
    }
    return true;
  });
  const native = jest.fn(async () => 'result');
  await expect(guard.run('A', native)).rejects.toMatchObject({code:'IAP_ACCOUNT_CHANGED'});
  if (boundary < 3) expect(native).not.toHaveBeenCalled();
});
