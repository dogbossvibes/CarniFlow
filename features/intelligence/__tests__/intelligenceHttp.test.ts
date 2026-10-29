import { createClient, type Session } from '@supabase/supabase-js';
import { createConversationHttpGateway } from '../conversationHttp';
import { createTranscriptionHttpGateway } from '../transcriptionHttp';
import { boundedJsonText } from '../httpBoundary';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const request = { version: 1 as const, requestId: owner, dogId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', policyId: 'p', messages: [{ role: 'user' as const, text: 'Hallo' }], sources: [] };
function response(body: unknown, status = 200) {
  const text = JSON.stringify(body); return new Response(text, { status, headers: { 'Content-Type': 'application/json', 'Content-Length': String(text.length) } });
}
function setup() {
  const client = createClient('https://fixture.supabase.co', 'synthetic-public', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const auth = jest.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'original-user-token', user: { id: owner } } as Session }, error: null });
  const current = jest.fn((): string | null => owner);
  const fetcher = jest.fn(async (_url: string, _options: RequestInit) => response({ ...request, messages: undefined, text: 'Antwort' }));
  return { client, auth, current, fetcher, text: createConversationHttpGateway(client, current, 'https://fixture.supabase.co', 'synthetic-public', fetcher),
    speech: createTranscriptionHttpGateway(client, current, 'https://fixture.supabase.co', 'synthetic-public', fetcher), signal: new AbortController().signal };
}
afterEach(() => jest.restoreAllMocks());
it('text uses the proposed separate endpoint and immutable user JWT; no owner or raw source data on wire', async () => {
  const s = setup(); expect(await s.text.respond(request, s.signal)).toMatchObject({ text: 'Antwort' });
  const [url, options] = s.fetcher.mock.calls[0]; expect(url).toBe('https://fixture.supabase.co/functions/v1/intelligence-respond');
  expect(options).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer original-user-token', 'Content-Type': 'application/json' } });
  expect(JSON.parse(options.body as string)).toEqual(request); expect(s.fetcher).toHaveBeenCalledTimes(1);
});
it('speech sends raw owned WAV bytes only and clears its private upload copy after completion', async () => {
  const s = setup(); s.fetcher.mockResolvedValue(response({ version: 1, requestId: owner, text: 'Prüfen' }));
  const bytes = new Uint8Array(46).fill(3); expect(await s.speech.transcribe({ accountId: owner, requestId: owner, policyId: 'p', bytes }, s.signal)).toEqual({ text: 'Prüfen' });
  const [url, options] = s.fetcher.mock.calls[0]; expect(url).toMatch(/\/intelligence-transcribe$/);
  expect(options.headers).toMatchObject({ 'Content-Type': 'audio/wav', 'X-Request-Id': owner, 'X-Policy-Id': 'p', Authorization: 'Bearer original-user-token' });
  expect(options.body).toBeInstanceOf(ArrayBuffer); expect(new Uint8Array(options.body as ArrayBuffer)).toEqual(new Uint8Array(46));
  expect(bytes).toEqual(new Uint8Array(46).fill(3)); expect(options.headers).not.toHaveProperty('accountId');
});
it('account switch while auth resolves prevents all upload', async () => {
  const s = setup(); s.auth.mockImplementation(async () => { s.current.mockReturnValue('cccccccc-cccc-4ccc-8ccc-cccccccccccc'); return { data: { session: { access_token: 'old', user: { id: owner } } as Session }, error: null }; });
  await s.text.respond(request, s.signal); expect(s.fetcher).not.toHaveBeenCalled();
});
it('foreign JWT, abort and invalid origins never dispatch speech', async () => {
  const s = setup(); s.auth.mockResolvedValue({ data: { session: { access_token: 'foreign', user: { id: 'foreign' } } as Session }, error: null });
  const audio = { accountId: owner, requestId: owner, policyId: 'p', bytes: new Uint8Array(46) };
  expect(await s.speech.transcribe(audio, s.signal)).toEqual({ error: 'UNAVAILABLE' });
  const denied = createTranscriptionHttpGateway(s.client, s.current, 'https://attacker.invalid', 'key', s.fetcher);
  await denied.transcribe(audio, s.signal); expect(s.fetcher).not.toHaveBeenCalled();
});
it.each(['BUDGET_EXHAUSTED', 'DAILY_LIMIT_REACHED', 'CONSENT_REQUIRED', 'UNAVAILABLE'])('strict speech server error %s is preserved without retry', async code => {
  const s = setup(); s.fetcher.mockResolvedValue(response({ version: 1, error: { code } }, code === 'DAILY_LIMIT_REACHED' ? 429 : 503));
  expect(await s.speech.transcribe({ accountId: owner, requestId: owner, policyId: 'p', bytes: new Uint8Array(46) }, s.signal)).toEqual({ error: code });
  expect(s.fetcher).toHaveBeenCalledTimes(1);
});
it('rejects a response for a different request and never submits its transcript to chat', async () => {
  const s = setup(); s.fetcher.mockResolvedValue(response({ version: 1, requestId: 'wrong', text: 'Wrong' }));
  expect(await s.speech.transcribe({ accountId: owner, requestId: owner, policyId: 'p', bytes: new Uint8Array(46) }, s.signal)).toEqual({ error: 'INVALID_RESPONSE' });
  expect(s.fetcher).toHaveBeenCalledTimes(1);
});
it('rejects unbounded nonstreaming JSON before materializing its body', async () => {
  const text = jest.fn(); const r = { status: 200, redirected: false, url: '', body: null, headers: new Headers({ 'Content-Type': 'application/json' }), text } as unknown as Response;
  await expect(boundedJsonText(r, 'https://fixture.supabase.co', new AbortController().signal)).rejects.toThrow(); expect(text).not.toHaveBeenCalled();
});
it('rejects excessive declared response length before reading body', async () => {
  const r = response({ text: 'small' }); r.headers.set('Content-Length', '20001');
  const read = jest.spyOn(r, 'text'); await expect(boundedJsonText(r, '', new AbortController().signal)).rejects.toThrow(); expect(read).not.toHaveBeenCalled();
});
it('unknown network outcome never retries a paid audio operation', async () => {
  const s = setup(); s.fetcher.mockRejectedValue(new TypeError('Unknown outcome'));
  expect(await s.speech.transcribe({ accountId: owner, requestId: owner, policyId: 'p', bytes: new Uint8Array(46) }, s.signal)).toEqual({ error: 'NETWORK' });
  expect(s.fetcher).toHaveBeenCalledTimes(1);
});
it('rejects text errors with provider details instead of accepting a noncontract response', async () => {
  const s = setup(); s.fetcher.mockResolvedValue(response({ version: 1, error: { code: 'UNAVAILABLE', detail: 'private' } }, 503));
  expect(await s.text.respond(request, s.signal)).toBeNull(); expect(s.fetcher).toHaveBeenCalledTimes(1);
});
it('accepts bounded UTF-8 German replies without relying on TextEncoder availability', async () => {
  const s = setup(); s.fetcher.mockResolvedValue(response({ version: 1, requestId: owner, text: 'Draußen üben 🐕' }));
  expect(await s.speech.transcribe({ accountId: owner, requestId: owner, policyId: 'p', bytes: new Uint8Array(46) }, s.signal)).toEqual({ text: 'Draußen üben 🐕' });
});

it('preserves text daily quota with429 without automatic retry or monthly-budget substitution', async () => {
  const s = setup(); s.fetcher.mockResolvedValue(response({ version: 1, error: { code: 'DAILY_LIMIT_REACHED' } }, 429));
  expect(await s.text.respond(request, s.signal)).toEqual({ version: 1, error: { code: 'DAILY_LIMIT_REACHED' } });
  expect(s.fetcher).toHaveBeenCalledTimes(1);
});
it('does not accept a daily quota code on the wrong HTTP status', async () => {
  const s = setup(); s.fetcher.mockResolvedValue(response({ version: 1, error: { code: 'DAILY_LIMIT_REACHED' } }, 503));
  expect(await s.text.respond(request, s.signal)).toBeNull();
  s.fetcher.mockResolvedValue(response({ version: 1, error: { code: 'DAILY_LIMIT_REACHED' } }, 503));
  expect(await s.speech.transcribe({ accountId: owner, requestId: owner, policyId: 'p', bytes: new Uint8Array(46) }, s.signal)).toEqual({ error: 'INVALID_RESPONSE' });
});
