// Source-controlled release gates. Neither route params, environment variables,
// cached consent nor a successful revision read can activate this feature.
export const INTELLIGENCE_RELEASE = Object.freeze({
  serverDeployed: false,
  independentReviewApproved: false,
  globalBudgetVerified: false,
});
export function conversationReleaseReady(gates: Readonly<Record<keyof typeof INTELLIGENCE_RELEASE, boolean>> = INTELLIGENCE_RELEASE) {
  return gates.serverDeployed === true && gates.independentReviewApproved === true && gates.globalBudgetVerified === true;
}
