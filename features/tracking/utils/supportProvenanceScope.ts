// Account identity is shared across all supported platform baselines. QA permission
// changes/TTL do not revoke ordinary customers' recording metadata.
import { getDiagnosticsAccessSnapshot, subscribeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
let owner = getDiagnosticsAccessSnapshot().userId;
let epoch = 0;
let storageEpoch = 0;
let wiping = 0;
const generations = new Map<string, number>();
const blocked = new Map<string, number>();
subscribeDiagnosticsAccess(() => {
  const next = getDiagnosticsAccessSnapshot().userId;
  if (next !== owner) { owner = next; epoch++; generations.clear(); blocked.clear(); }
});
export function supportProvenanceScope() { return { owner: getDiagnosticsAccessSnapshot().userId, epoch, storageEpoch }; }
export type SupportProvenanceScope = ReturnType<typeof supportProvenanceScope>;
export function supportProvenanceScopeMatches(scope: SupportProvenanceScope): boolean {
  const now = supportProvenanceScope();
  return scope.owner === now.owner && scope.epoch === now.epoch && scope.storageEpoch === now.storageEpoch;
}
const sessionKey = (scope: SupportProvenanceScope, session: string) => JSON.stringify([scope.owner, session]);
export function supportProvenanceLease(session: string) {
  const scope = supportProvenanceScope(), key = sessionKey(scope, session), generation = generations.get(key) ?? 0;
  return { scope, valid: () => !wiping && supportProvenanceScopeMatches(scope) && !blocked.has(key) && (generations.get(key) ?? 0) === generation };
}
export function beginSupportProvenanceFence(sessions: readonly string[]) {
  const scope = supportProvenanceScope(), keys = sessions.map(session => sessionKey(scope, session));
  keys.forEach(key => { generations.set(key, (generations.get(key) ?? 0) + 1); blocked.set(key, (blocked.get(key) ?? 0) + 1); });
  let released = false;
  return { scope, release: () => {
    if (released) return;
    released = true;
    // A cancelled wipe invalidates work leases, but must not strand this fence.
    // Account epochs still prevent an old owner from releasing a new owner's fence.
    const now = supportProvenanceScope();
    if (scope.owner === now.owner && scope.epoch === now.epoch) keys.forEach(key => {
      const count = blocked.get(key) ?? 0;
      if (count <= 1) blocked.delete(key); else blocked.set(key, count - 1);
    });
  } };
}
export function beginSupportProvenanceWipeFence() {
  storageEpoch++; wiping++;
  const scope = supportProvenanceScope();
  let released = false;
  return { scope, release: () => { if (!released) { released = true; wiping--; } } };
}
