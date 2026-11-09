/** Server-only allowlisted diagnostics. Never serialize an upstream error/body. */
export type Stage = 'authenticate' | 'request' | 'reserve' | 'reconcile';
export type Operation = 'v1_subscriber' | 'v2_customer_subscriptions' | 'v2_aliases' | 'v2_subscription' | 'v2_product' | 'v2_entitlements' | 'v2_other';
export type Rpc = 'subscription_client_v1' | 'subscription_owned_state_v1' | 'subscription_reconcile_lease_v1' | 'subscription_apply_owned_v1';
type Context = { operation?: Operation; rpc?: Rpc; status?: number; databaseCode?: string };
export class DiagnosticError extends Error {
  constructor(readonly category: 'PROVIDER_HTTP' | 'PROVIDER_NETWORK' | 'PROVIDER_RESPONSE' | 'DATABASE_RPC', readonly context: Context) {
    super(category);
  }
}
const codes = new Set<string>([
  'AUTHORITY_NOT_ACTIVATED', 'SERVER_NOT_CONFIGURED', 'PROVIDER_CONFIG',
  'SHAPE', 'UNCONFIRMED_STATE', 'SYNC_RATE_LIMIT', 'AUTHORITY_DATABASE_PENDING',
  'PROVIDER_SHAPE', 'PROVIDER_ALIAS_SHAPE', 'PROVIDER_TIME', 'PROVIDER_SCOPE',
  'PROVIDER_UNAVAILABLE', 'PROVIDER_PAGINATION', 'PROVIDER_BOUND', 'BINDING_SCOPE',
  'PROVIDER_ENVIRONMENT_PENDING', 'OWNER_NOT_CANONICAL', 'PROVIDER_PRODUCT',
  'PROVIDER_ENTITLEMENT', 'PROVIDER_STALE', 'GRACE_PROOF_PENDING', 'STATE_MISSING',
  'OWNERSHIP_SCOPE', 'OWNERSHIP_UNSTABLE', 'RECONCILIATION_BUSY',
  'OWNERSHIP_PROOF_EXPIRED', 'OWNERSHIP_STATE_CHANGED', 'BOUNDED_INPUT',
  'ACCOUNT_PROOF_INVALID', 'AMBIGUOUS_ALIAS', 'MULTIPLE_AUTH_ACCOUNTS_IN_ALIAS_SET',
  'BINDING_INVALID', 'DUPLICATE_BINDING', 'RECEIPT_SCOPE_INVALID',
  'DUPLICATE_RECEIPT', 'OWNERSHIP_REVISION_CHANGED', 'PREVIOUS_OWNER_NOT_LOCKED',
  'PERIOD_INVALID', 'PRODUCT_ENTITLEMENT_UNKNOWN', 'INCOMPLETE_PREVIOUS_OWNERSHIP',
  'V1_V2_DISAGREE', 'INVALID_PROVIDER_RESPONSE', 'INVALID_PROVIDER_DATE',
  'STALE_PROVIDER_RESPONSE', 'UNMAPPED_PROVIDER_AUTHORITY', 'UNMAPPED_PROVIDER_PRODUCT',
  'SANDBOX_OR_UNVERIFIED_ENVIRONMENT', 'UNMAPPED_PROVIDER_STORE',
  'PROVIDER_ENTITLEMENT_MISMATCH',
]);
export function providerOperation(path: string): Operation {
  if (/\/customers\/[^/]+\/subscriptions$/.test(path)) return 'v2_customer_subscriptions';
  if (/\/customers\/[^/]+\/aliases$/.test(path)) return 'v2_aliases';
  if (/\/subscriptions\/[^/]+\/entitlements$/.test(path)) return 'v2_entitlements';
  if (/\/subscriptions\/[^/]+$/.test(path)) return 'v2_subscription';
  if (/\/products\/[^/]+$/.test(path)) return 'v2_product';
  return 'v2_other';
}
export function failureEvent(error: unknown, entrypoint: 'sync' | 'webhook', stage: Stage, requestId: string) {
  const event: Record<string, string | number> = {
    event: 'subscription_authority_failure', entrypoint, stage, requestId,
    code: error instanceof Error && codes.has(error.message) ? error.message : 'UNEXPECTED_ERROR',
  };
  if (error instanceof DiagnosticError) {
    event.code = error.category;
    const c = error.context;
    if (c.operation) event.operation = c.operation;
    if (c.rpc) event.rpc = c.rpc;
    if (Number.isInteger(c.status) && c.status! >= 100 && c.status! <= 599) event.providerStatus = c.status!;
    // PostgREST codes and SQLSTATE only; never its message, details or hint.
    if (c.databaseCode && /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(c.databaseCode)) event.databaseCode = c.databaseCode;
  }
  return event;
}
export function reportFailure(error: unknown, entrypoint: 'sync' | 'webhook', stage: Stage, requestId: string) {
  try { console.error(JSON.stringify(failureEvent(error, entrypoint, stage, requestId))); }
  catch { /* Diagnostics may never alter the authorization outcome. */ }
}
