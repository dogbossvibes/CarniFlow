import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntelligenceScope } from './contract';
import type { ConsentStorage } from './consentOutbox';
import type { PcmCapturePort } from './pcmCapture';
import type { IntelligenceFetch } from './transcriptionHttp';
import { createTranscriptionHttpGateway } from './transcriptionHttp';
import { createConversationHttpGateway } from './conversationHttp';
import { createConsentRpcGateway } from './consentRpcGateway';
import { createIntelligenceRouteRuntime } from './routeRuntime';

// Explicit integration seam for the independently reviewed deployment. This is
// not selected by appRuntime until the publisher binds the actual server freeze.
// Construction has no permission, file, auth or network side effects.
export function createCandidateIntelligenceRuntime(scope: IntelligenceScope, deps: {
  client: SupabaseClient; projectUrl: string; publicKey: string; fetcher: IntelligenceFetch;
  storage: ConsentStorage; uuid: () => string; currentAccount: () => string | null;
  pcm: PcmCapturePort; audioIdle: () => boolean;
}) {
  return createIntelligenceRouteRuntime(scope, {
    storage: deps.storage, uuid: deps.uuid, currentAccount: deps.currentAccount, policy: null,
    consentGateway: createConsentRpcGateway(deps.client, deps.currentAccount),
    gateway: createConversationHttpGateway(deps.client, deps.currentAccount, deps.projectUrl, deps.publicKey, deps.fetcher),
    serverSpeech: { port: deps.pcm, audioIdle: deps.audioIdle,
      gateway: createTranscriptionHttpGateway(deps.client, deps.currentAccount, deps.projectUrl, deps.publicKey, deps.fetcher) },
  });
}
