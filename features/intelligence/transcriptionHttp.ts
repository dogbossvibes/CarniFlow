import { boundedJsonText, intelligenceEndpoint } from './httpBoundary';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validUuid, type IntelligenceError } from './contract';
export const AUDIO_LIMITS = Object.freeze({ uploadBytes: 1985536, pcmBytes: 1920000, maxSeconds: 60, transcriptChars: 4000 });
export interface TranscriptionRequest { accountId: string; requestId: string; policyId: string; bytes: Uint8Array }
export type TranscriptionResult = { text: string } | { error: IntelligenceError };
export interface TranscriptionGateway { transcribe(request: TranscriptionRequest, signal: AbortSignal): Promise<TranscriptionResult> }
export type IntelligenceFetch = (url: string, options: RequestInit) => Promise<Response>;
const POLICY = /^[A-Za-z0-9._:-]{1,128}$/;
// This explicit name is the local contract63, not a claim of live deployment.
export function createTranscriptionHttpGateway(client: SupabaseClient, currentAccount: () => string | null,
  projectUrl: string, publicKey: string, fetcher: IntelligenceFetch): TranscriptionGateway {
  const endpoint = intelligenceEndpoint(projectUrl, 'intelligence-transcribe');
  return { async transcribe(requested, signal) {
    const context = { accountId: requested.accountId, requestId: requested.requestId, policyId: requested.policyId };
    const current = () => { try { return !signal.aborted && currentAccount() === context.accountId; } catch { return false; } };
    if (!endpoint || typeof publicKey !== 'string' || !publicKey || !validUuid(context.accountId) || !validUuid(context.requestId)
      || !POLICY.test(context.policyId) || !(requested.bytes instanceof Uint8Array) || requested.bytes.byteLength < 46
      || requested.bytes.byteLength > AUDIO_LIMITS.uploadBytes || !current()) return { error: 'UNAVAILABLE' };
    // Separate immutable body snapshot; caller may zero/release its own buffer.
    const bytes = requested.bytes.slice();
    try {
      const { data, error } = await client.auth.getSession(); const session = data.session;
      if (error || !session || session.user.id !== context.accountId || typeof session.access_token !== 'string'
        || !session.access_token || !current()) return { error: 'UNAVAILABLE' };
      const response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: publicKey,
          'Content-Type': 'audio/wav', 'X-Request-Id': context.requestId, 'X-Policy-Id': context.policyId }, body: bytes.buffer });
      const text = await boundedJsonText(response, endpoint, signal);
      if (!current()) return { error: 'UNAVAILABLE' };
      const raw: unknown = JSON.parse(text);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'INVALID_RESPONSE' };
      const r = raw as Record<string, unknown>;
      if (response.status >= 300) {
        const e = r.error as Record<string, unknown> | null;
        if (r.version !== 1 || Object.keys(r).some(k => k !== 'version' && k !== 'error') || !e || Array.isArray(e)
          || typeof e !== 'object' || Object.keys(e).some(k => k !== 'code')) return { error: 'INVALID_RESPONSE' };
        if (e.code === 'DAILY_LIMIT_REACHED') return { error: response.status === 429 ? 'DAILY_LIMIT_REACHED' : 'INVALID_RESPONSE' };
        if (e.code === 'BUDGET_EXHAUSTED' || e.code === 'CONSENT_REQUIRED' || e.code === 'UNAVAILABLE') return { error: e.code };
        return { error: e.code === 'INVALID_AUDIO' || e.code === 'INVALID_INPUT' ? 'INVALID_INPUT' : 'INVALID_RESPONSE' };
      }
      return r.version === 1 && r.requestId === context.requestId && typeof r.text === 'string' && !!r.text.trim()
        && r.text.length <= AUDIO_LIMITS.transcriptChars && Object.keys(r).every(k => ['version','requestId','text'].includes(k))
        ? { text: r.text } : { error: 'INVALID_RESPONSE' };
    } catch { return { error: signal.aborted ? 'UNAVAILABLE' : 'NETWORK' }; }
    finally { bytes.fill(0); }
  } };
}
