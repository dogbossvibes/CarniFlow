import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import type { IntelligenceScope } from './contract';
import { createIntelligenceRouteRuntime } from './routeRuntime';
import { createAccountConsentPrivacy } from './accountPrivacyRuntime';
import { createConsentRpcGateway, createIntelligencePolicyRpcReader } from './consentRpcGateway';
import { createCandidateIntelligenceRuntime } from './deploymentRuntime';
import { conversationReleaseReady } from './releaseGate';

// Client RPCs match the reviewed local SQL but are not deployed/activated.
// The route gates and null initial policy prevent calls until release approval.
// No network, storage read, permission request or recording during construction.
export function createAppIntelligenceRuntime(scope: IntelligenceScope, currentAccount: () => string | null) {
  if (conversationReleaseReady()) {
    // Native audio is loaded only after the reviewed deployment and budget gates.
    // Construction still starts no recording, permission, auth or HTTP request.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Keep native capture outside the locked route and account privacy path.
    const { createExpoPcmCapture, intelligenceAudioIdle } = require('./expoPcmCapture') as typeof import('./expoPcmCapture');
    return createCandidateIntelligenceRuntime(scope, {
      client: supabase, projectUrl: SUPABASE_URL, publicKey: SUPABASE_ANON_KEY,
      fetcher: (url, options) => fetch(url, options), storage: AsyncStorage,
      uuid: randomUUID, currentAccount,
      pcm: createExpoPcmCapture(AsyncStorage, intelligenceAudioIdle), audioIdle: intelligenceAudioIdle,
    });
  }
  return createIntelligenceRouteRuntime(scope, {
    storage: AsyncStorage, uuid: randomUUID, currentAccount,
    policy: null,
    gateway: { respond: async () => ({ version: 1, error: { code: 'UNAVAILABLE' } }) },
    consentGateway: createConsentRpcGateway(supabase, currentAccount),
    // Locked fallback never imports native audio or connects a provider port.
  });
}

// Called only by the guarded route after server/review/global-budget gates pass.
// The authenticated server returns null while disabled or pricing has expired.
export function loadAppIntelligencePolicy(accountId: string, currentAccount: () => string | null, signal: AbortSignal) {
  return createIntelligencePolicyRpcReader(supabase, currentAccount)(accountId, signal);
}

export function createAppAccountConsentPrivacy(accountId: string, currentAccount: () => string | null) {
  return createAccountConsentPrivacy(accountId, currentAccount, AsyncStorage, createConsentRpcGateway(supabase, currentAccount));
}
