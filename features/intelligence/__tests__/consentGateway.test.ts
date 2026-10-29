import { consentGrantRequest, createConsentGateway } from '../consentGateway';
import type { ConsentIntent } from '../consent';
const intent: ConsentIntent = { accountId: '11111111-1111-4111-8111-111111111111', policyId: 'policy', text: true, audio: true, expectedRevision: 0, actionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
const ack = { version: 1, accountId: intent.accountId, policyId: intent.policyId, text: true, audio: true, revision: 1, grantedAt: '2026-10-23T06:00:00Z' };
it('sends expectedRevision/actionId with exact wire fields and keeps accountId outside JSON', async () => {
  const transport = jest.fn(async () => ({ status: 200, bodyText: JSON.stringify(ack) }));
  const reader = jest.fn(); const gateway = createConsentGateway(transport, reader); const signal = new AbortController().signal;
  expect(await gateway.grant(intent, signal)).toEqual(ack);
  expect(transport).toHaveBeenCalledWith({ operation: 'intelligence-consent-v1', method: 'POST', accountId: intent.accountId,
    body: { version: 1, policyId: 'policy', text: true, audio: true, expectedRevision: 0, actionId: intent.actionId } }, signal);
  expect(reader).not.toHaveBeenCalled();
});
it.each([{ actionId: 'bad' }, { accountId: 'wrong' }, { expectedRevision: -1 }, { expectedRevision: 1.5 },
  { expectedRevision: Number.MAX_SAFE_INTEGER }, { expectedRevision: '0' }, { text: false }, { audio: 'true' }, { policyId: '' }])('fails closed before transport on invalid grant metadata (%#)', async patch => {
  const transport = jest.fn(); const invalid = { ...intent, ...patch } as ConsentIntent;
  expect(consentGrantRequest(invalid)).toBeNull(); expect(await createConsentGateway(transport, jest.fn()).grant(invalid, new AbortController().signal)).toBeNull();
  expect(transport).not.toHaveBeenCalled();
});
it('serializes repeated explicit retries identically without reading a new revision', async () => {
  const transport = jest.fn(async () => ({ status: 200, bodyText: JSON.stringify(ack) })); const reader = jest.fn(); const g = createConsentGateway(transport, reader);
  const signal = new AbortController().signal; await g.grant(intent, signal); await g.grant(intent, signal);
  expect(transport.mock.calls[0]).toEqual(transport.mock.calls[1]); expect(reader).not.toHaveBeenCalled();
});
it('uses exact DELETE body without replaying grant metadata', async () => {
  const transport = jest.fn(async () => ({ status: 200, bodyText: '{}' })); const g = createConsentGateway(transport, jest.fn()); const signal = new AbortController().signal;
  await g.revoke({ accountId: intent.accountId, policyId: intent.policyId }, signal);
  expect(transport).toHaveBeenCalledWith({ operation: 'intelligence-consent-v1', method: 'DELETE', accountId: intent.accountId, body: { version: 1, policyId: intent.policyId } }, signal);
});
it.each([{ status: 409, bodyText: 'private' }, { status: 302, bodyText: '{}' }, { status: 200, bodyText: 'invalid' },
  { status: 200, bodyText: 'x'.repeat(20001) }])('does not pass errors/redirects/invalid bodies as consent ACK (%#)', async reply => {
  const g = createConsentGateway(async () => reply, jest.fn()); expect(await g.grant(intent, new AbortController().signal)).toBeNull();
});
it('does not dispatch an aborted grant or read and drops a late aborted revision', async () => {
  const abort = new AbortController(); const transport = jest.fn(); const reader = jest.fn(async () => { abort.abort(); return { revision: 0 }; });
  const g = createConsentGateway(transport, reader);
  expect(await g.readRevision({ accountId: intent.accountId, policyId: intent.policyId }, abort.signal)).toBeNull();
  expect(await g.grant(intent, abort.signal)).toBeNull(); expect(await g.readRevision({ accountId: intent.accountId, policyId: intent.policyId }, abort.signal)).toBeNull();
  expect(reader).toHaveBeenCalledTimes(1); expect(transport).not.toHaveBeenCalled();
});
