/** Client gate: enable only after independent integration review, confirmed deployed
 * authority/wire contract and per-runtime release acceptance. Server authorization
 * remains mandatory. Server activation alone does not approve this app client. */
export function isLiveShareReleaseReady(): boolean { return true; }
