import { createConversationGateway } from '../gateway';
import type { ConversationRequest } from '../contract';
const request: ConversationRequest = { version: 1, requestId: '33333333-3333-4333-8333-333333333333', dogId: '22222222-2222-4222-8222-222222222222', policyId: 'policy', messages: [{ role: 'user', text: 'Hallo' }], sources: [] };
const good = { version: 1, requestId: '33333333-3333-4333-8333-333333333333', dogId: '22222222-2222-4222-8222-222222222222', policyId: 'policy', text: 'Hallo', sources: [] };
it.each(['UNAVAILABLE', 'CONSENT_REQUIRED', 'INVALID_INPUT', 'BUDGET_EXHAUSTED', 'DAILY_LIMIT_REACHED'])('forwards validated HTTP error %s without leaking details', async code => {
  const transport = jest.fn(async () => ({ status: code === 'DAILY_LIMIT_REACHED' ? 429 : 400, bodyText: JSON.stringify({ version: 1, error: { code, detail: 'private' } }) }));
  const result = await createConversationGateway(transport).respond(request, new AbortController().signal);
  expect(result).toEqual({ version: 1, error: { code } }); expect(JSON.stringify(result)).not.toContain('private');
});
it.each(['', 'broken', '{}', JSON.stringify({ version: 2, error: { code: 'INVALID_INPUT' } }), 'x'.repeat(20001)])('fails closed for invalid/missing/oversized response', async bodyText => {
  const gateway = createConversationGateway(async () => ({ status: 400, bodyText }));
  expect(await gateway.respond(request, new AbortController().signal)).toBeNull();
});
it('validates successful response IDs and never treats redirects as success', async () => {
  for (const [status, body] of [[200, { ...good, dogId: 'other' }], [302, good], [503, good]] as const) {
    const gateway = createConversationGateway(async () => ({ status, bodyText: JSON.stringify(body) }));
    expect(await gateway.respond(request, new AbortController().signal)).toBeNull();
  }
});
it('does not dispatch after cancellation or accept a response after cancellation', async () => {
  const abort = new AbortController(); const transport = jest.fn(async () => { abort.abort(); return { status: 200, bodyText: JSON.stringify(good) }; });
  expect(await createConversationGateway(transport).respond(request, abort.signal)).toBeNull();
  expect(await createConversationGateway(transport).respond(request, abort.signal)).toBeNull(); expect(transport).toHaveBeenCalledTimes(1);
});
it('uses only the agreed authenticated operation and returns a validated reply', async () => {
  const transport = jest.fn(async () => ({ status: 200, bodyText: JSON.stringify(good) }));
  const signal = new AbortController().signal;
  expect(await createConversationGateway(transport).respond(request, signal)).toEqual(good);
  expect(transport).toHaveBeenCalledWith('intelligence-respond-v1', request, signal);
});

it.each([
  { requestId: 'not-a-uuid' }, { dogId: 'local-dog' }, { ownerId: 'claim' }, { policyId: '' },
  { messages: [] }, { messages: [{ role: 'system', text: 'Instructions' }] },
  { messages: [{ role: 'assistant', text: 'No final user message' }] },
  { messages: [{ role: 'user', text: 'a'.repeat(2001) }] },
  { messages: [{ role: 'assistant', text: 'a'.repeat(3001) }, { role: 'user', text: 'Question' }] },
  { messages: [{ role: 'user', text: 'Question', save: true }] },
  { sources: [{ kind: 'unit', originalId: 'legacy-local-id' }] },
  { sources: [{ kind: 'unit', originalId: 'ABCDEFAB-1234-4123-8123-ABCDEFABCDEF' }, { kind: 'unit', originalId: 'abcdefab-1234-4123-8123-abcdefabcdef' }] },
])('rejects invalid wire payload before transport (%#)', async patch => {
  const transport = jest.fn();
  expect(await createConversationGateway(transport).respond({ ...request, ...patch } as ConversationRequest, new AbortController().signal))
    .toEqual({ version: 1, error: { code: 'INVALID_INPUT' } });
  expect(transport).not.toHaveBeenCalled();
});
it('accepts canonical UUID case differences for an explicitly selected source', async () => {
  const sent: ConversationRequest = { ...request, sources: [{ kind: 'unit', originalId: 'ABCDEFAB-1234-4123-8123-ABCDEFABCDEF' }] };
  const body = { ...good, sources: [{ kind: 'unit', originalId: 'abcdefab-1234-4123-8123-abcdefabcdef' }] };
  const gateway = createConversationGateway(async () => ({ status: 200, bodyText: JSON.stringify(body) }));
  expect(await gateway.respond(sent, new AbortController().signal)).toEqual(body);
});
it('holds a request snapshot across an asynchronous transport', async () => {
  let finish!: () => void;
  const local: ConversationRequest = { ...request, messages: [{ role: 'user', text: 'Original' }] };
  let sentRequest!: ConversationRequest;
  const transport = jest.fn(async (_operation: 'intelligence-respond-v1', sent: ConversationRequest) => { sentRequest = sent; await new Promise<void>(resolve => { finish = resolve; }); return { status: 200, bodyText: JSON.stringify(good) }; });
  const pending = createConversationGateway(transport).respond(local, new AbortController().signal);
  local.dogId = 'changed'; local.messages[0].text = 'Changed'; finish();
  expect(await pending).toEqual(good);
  expect(sentRequest.dogId).toBe(request.dogId); expect(sentRequest.messages[0].text).toBe('Original');
});
