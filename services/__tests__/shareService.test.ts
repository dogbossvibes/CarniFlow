/* eslint-disable import/first */
jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), auth: { getUser: jest.fn() } },
}));

import { supabase } from '@/lib/supabase';
import { createShareLink, type ShareOptions } from '@/services/shareService';

const from = supabase.from as unknown as jest.Mock;
const getUser = supabase.auth.getUser as unknown as jest.Mock;

const OPTS: ShareOptions = {
  includeNotes: true, includeVideo: true, includeAudio: true, includeScore: true,
};

// delete().eq().eq()  +  insert().select().single()
function mockChain(insertResult: unknown) {
  const single = jest.fn().mockResolvedValue(insertResult);
  const select = jest.fn(() => ({ single }));
  const insert = jest.fn(() => ({ select }));
  const eq2 = jest.fn().mockResolvedValue({ error: null });
  const eq1 = jest.fn(() => ({ eq: eq2 }));
  const del = jest.fn(() => ({ eq: eq1 }));
  from.mockReturnValue({ delete: del, insert });
  return { insert, select, single };
}

describe('createShareLink', () => {
  afterEach(() => { from.mockReset(); getUser.mockReset(); });

  it('gibt eine gültige öffentliche URL zurück, wenn der Token erzeugt wurde', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockChain({ data: { token: 'abc123' }, error: null });

    await expect(createShareLink('sess-1', OPTS)).resolves.toBe('https://anyvo.app/share/abc123');
    expect(from).toHaveBeenCalledWith('shared_trainings');
  });

  it('propagiert den echten Supabase-Fehler (z. B. FK 23503) statt ihn zu verschlucken', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockChain({ data: null, error: { code: '23503', message: 'foreign key violation' } });

    await expect(createShareLink('sess-1', OPTS)).rejects.toMatchObject({ code: '23503' });
    err.mockRestore();
  });

  it('wirft bei leerem Token (kein falscher Erfolg)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockChain({ data: { token: null }, error: null });

    await expect(createShareLink('sess-1', OPTS)).rejects.toThrow('share_link_no_token');
    err.mockRestore();
  });

  it('wirft, wenn kein Nutzer eingeloggt ist', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(createShareLink('sess-1', OPTS)).rejects.toThrow('Nicht eingeloggt');
  });
});
