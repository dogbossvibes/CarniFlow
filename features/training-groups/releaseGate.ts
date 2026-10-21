/** Deliberate release gate: change only with reviewed ACTIVE authority, compatible
 * purchase/restore client, live RPC grant and normal multi-account acceptance.
 * This is additional UX protection, never a substitute for server authorization.
 */
export function isLiveShareReleaseReady(): boolean { return false; }
