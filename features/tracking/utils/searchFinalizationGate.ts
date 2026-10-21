export interface SearchOperationIdentity { sessionId: string | null; runId?: string | null; dogId?: string | null }
/** A save operation outlives control leases, but never its authenticated owner or target.
 * A database write already issued may finish; stale continuations cannot touch another store.
 */
export function captureSearchFinalization(input: {
  assertOwner(): void; read(): SearchOperationIdentity; routeIsCurrent(): boolean;
  expected: SearchOperationIdentity;
}) {
  const same = (a: SearchOperationIdentity, b: SearchOperationIdentity) => a.sessionId === b.sessionId
    && (a.dogId ?? null) === (b.dogId ?? null) && (a.runId ?? null) === (b.runId ?? null);
  const expected = { ...input.expected };
  const assert = () => {
    input.assertOwner();
    if (!input.routeIsCurrent() || !same(input.read(), expected)) throw new Error('SEARCH_OPERATION_CHANGED');
  };
  assert();
  return { assert, isCurrent: () => { try { assert(); return true; } catch { return false; } } };
}
