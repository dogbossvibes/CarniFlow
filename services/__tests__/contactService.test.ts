const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('@/services/connectionService', () => ({ listConnections: jest.fn() }));

import { listConnections } from '@/services/connectionService';
import {
  contactLink, createContactCode, listContactRequests, listContacts, normalizeUsername,
  parseContactCode, removeContact, respondToContactRequest, sendContactRequest,
} from '@/services/contactService';

beforeEach(() => { mockRpc.mockReset(); (listConnections as jest.Mock).mockReset(); });

describe('contact code parsing', () => {
  it('normalises typed codes', () => {
    expect(parseContactCode(' k7m4-x2p9 q1ab ')).toBe('K7M4X2P9Q1AB');
  });
  it('extracts the code from a contact link', () => {
    expect(parseContactCode('anyvo://contacts/add?code=k7m4x2p9q1ab')).toBe('K7M4X2P9Q1AB');
    expect(parseContactCode(contactLink('K7M4X2P9Q1AB'))).toBe('K7M4X2P9Q1AB');
  });
  it('never passes link syntax to the server', () => {
    expect(parseContactCode('https://example.test/?x=1&code=AB%20CD&y=2')).toBe('ABCD');
  });
});

describe('usernames', () => {
  it('strips @ and lowercases', () => {
    expect(normalizeUsername('  @@Sandra.M ')).toBe('sandra.m');
  });
});

describe('sendContactRequest', () => {
  it('sends the cleaned code', async () => {
    mockRpc.mockResolvedValue({ data: 'sent', error: null });
    await expect(sendContactRequest('code', 'anyvo://contacts/add?code=abc123def456')).resolves.toBe('sent');
    expect(mockRpc).toHaveBeenCalledWith('contact_request_send', { p_via: 'code', p_value: 'ABC123DEF456' });
  });
  it('does not call the server for empty input', async () => {
    await expect(sendContactRequest('code', ' - ')).resolves.toBe('invalid_code');
    await expect(sendContactRequest('username', ' @ ')).resolves.toBe('not_found');
    expect(mockRpc).not.toHaveBeenCalled();
  });
  it('maps known server answers and treats everything else as failed', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'rate_limited', error: null });
    await expect(sendContactRequest('username', 'sandra')).resolves.toBe('rate_limited');
    mockRpc.mockResolvedValueOnce({ data: 'something_new', error: null });
    await expect(sendContactRequest('username', 'sandra')).resolves.toBe('failed');
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(sendContactRequest('username', 'sandra')).resolves.toBe('failed');
  });
});

describe('respondToContactRequest', () => {
  it('only reports success when the server confirms the action', async () => {
    mockRpc.mockResolvedValueOnce({ data: 'accepted', error: null });
    await expect(respondToContactRequest('r1', 'accept')).resolves.toBe(true);
    mockRpc.mockResolvedValueOnce({ data: 'not_found', error: null });
    await expect(respondToContactRequest('r1', 'accept')).resolves.toBe(false);
    mockRpc.mockResolvedValueOnce({ data: 'blocked', error: null });
    await expect(respondToContactRequest('r1', 'block')).resolves.toBe(true);
  });
});

describe('lists', () => {
  it('reads a code from either row shape', async () => {
    mockRpc.mockResolvedValueOnce({ data: [{ code: 'ABC', expires_at: '2026-11-12T10:00:00Z' }], error: null });
    await expect(createContactCode('qr')).resolves.toEqual({ code: 'ABC', expiresAt: '2026-11-12T10:00:00Z' });
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    await expect(createContactCode('qr')).resolves.toBeNull();
  });
  it('keeps only pending requests', async () => {
    mockRpc.mockResolvedValue({ error: null, data: [
      { id: '1', direction: 'incoming', other_user_id: 'u1', other_name: 'Lea', other_username: 'lea', via: 'code', status: 'pending', created_at: 't' },
      { id: '2', direction: 'outgoing', other_user_id: 'u2', other_name: null, other_username: null, via: 'username', status: 'accepted', created_at: 't' },
    ] });
    const result = await listContactRequests();
    expect(result.error).toBe(false);
    expect(result.data.map(row => row.id)).toEqual(['1']);
  });
  it('lists only the direction in which I am the one sharing', async () => {
    (listConnections as jest.Mock).mockResolvedValue([
      { id: 'a', myRole: 'owner', status: 'accepted' }, { id: 'b', myRole: 'connected', status: 'accepted' },
      { id: 'c', myRole: 'owner', status: 'blocked' },
    ]);
    const contacts = await listContacts('me');
    expect(listConnections).toHaveBeenCalledWith('me', 'contact');
    expect(contacts.map(row => row.id)).toEqual(['a']);
  });
  it('removes a contact through the server function', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await expect(removeContact('u1')).resolves.toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('contact_remove', { p_user_id: 'u1' });
  });
});
