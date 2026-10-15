import { createPurchaseAccountGuard, PurchaseAccountError } from './purchaseAccountGuard';

type Session = { user: { id: string } } | null;
export interface PurchaseAuth {
  getSession(): Promise<{ data: { session: Session }; error: unknown }>;
  getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  onAuthStateChange(callback: (event: string, session: Session) => void): unknown;
}
export interface PurchaseIdentitySDK {
  configure(options: { apiKey: string; appUserID: string }): void;
  isConfigured(): Promise<boolean>;
  getAppUserID(): Promise<string>;
  logIn(userId: string): Promise<unknown>;
}

/** Read-only auth checks may time out; native Store work must retain the queue
 * until it actually settles, even when the app account changes meanwhile. */
export async function boundedAccountRead<T>(read: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PurchaseAccountError('IAP_ACCOUNT_NOT_READY')), 8000);
    })]);
  } finally { clearTimeout(timer); }
}

export function createPurchaseAccountAdapter(auth: PurchaseAuth, sdk: PurchaseIdentitySDK, apiKey: () => string) {
  let currentUserId: string | null | undefined;
  let generation = 0;
  let nativeUserId: string | null = null;
  let notifications = 0;
  let listening = false;
  const guard = createPurchaseAccountGuard({
    confirmAccount: async expected => {
      const { data, error } = await boundedAccountRead(auth.getUser());
      return !error && data.user?.id === expected && currentUserId === expected;
    },
    prepareIdentity: async expected => {
      if (!apiKey()) return false;
      if (!await sdk.isConfigured()) sdk.configure({ apiKey: apiKey(), appUserID: expected });
      if (await sdk.getAppUserID() !== expected) await sdk.logIn(expected);
      nativeUserId = await sdk.getAppUserID();
      return nativeUserId === expected;
    },
  });
  const observe = (session: Session) => {
    if (currentUserId !== undefined && currentUserId !== (session?.user.id ?? null)) generation++;
    currentUserId = session?.user.id ?? null;
    guard.accountChanged(currentUserId);
  };
  const initialize = async () => {
    if (!listening) {
      // Synchronous listener: never await another Supabase auth call here.
      auth.onAuthStateChange((_event, session) => { notifications++; observe(session); });
      listening = true;
    }
    const before = notifications;
    const { data, error } = await boundedAccountRead(auth.getSession());
    if (error) throw new PurchaseAccountError('IAP_ACCOUNT_NOT_READY');
    // A delayed initial session may never overwrite a newer logout/login event.
    if (notifications === before) observe(data.session);
  };
  const assertIntent = (ticket: number) => {
    if (ticket !== generation) throw new PurchaseAccountError('IAP_ACCOUNT_CHANGED');
  };
  const run = async <T>(expected: string, operation: () => Promise<T>) => {
    if (!expected) throw new PurchaseAccountError('IAP_ACCOUNT_CHANGED');
    const ticket = generation;
    await initialize();
    assertIntent(ticket);
    return guard.run(expected, operation);
  };
  return {
    run,
    async readCurrent<T>(operation: () => Promise<T>) {
      const ticket = generation;
      await initialize();
      assertIntent(ticket);
      if (!currentUserId) throw new PurchaseAccountError('IAP_ACCOUNT_CHANGED');
      return guard.run(currentUserId, operation);
    },
    async ensure(expected?: string): Promise<boolean> {
      try {
        const ticket = generation;
        await initialize();
        assertIntent(ticket);
        const userId = expected ?? currentUserId;
        if (!userId) return false;
        return await guard.prepare(userId);
      } catch { return false; }
    },
    isCurrent: (expected: string) => !!expected && currentUserId === expected,
    isReady: () => !!currentUserId && nativeUserId === currentUserId,
  };
}
