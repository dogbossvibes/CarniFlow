/* eslint-disable import/first */
jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

import { supabase } from '@/lib/supabase';
import {
  RESERVED_USERNAMES,
  checkUsernameAvailable,
  mapUsernameCheckResult,
  normalizeUsername,
  updateUsername,
  validateUsername,
} from '@/services/profileService';

const from = supabase.from as unknown as jest.Mock;
const rpc = supabase.rpc as unknown as jest.Mock;

// from('profiles').update(patch).eq('id', userId)
function mockUpdate(result: unknown) {
  const eq = jest.fn().mockResolvedValue(result);
  const update = jest.fn(() => ({ eq }));
  from.mockReturnValue({ update });
  return { update, eq };
}

afterEach(() => { from.mockReset(); rpc.mockReset(); });

describe('normalizeUsername', () => {
  it('trimmert führende und abschliessende Leerzeichen', () => {
    expect(normalizeUsername('  Max  ')).toBe('max');
  });

  it('wandelt in Kleinbuchstaben um', () => {
    expect(normalizeUsername('MAX.MUSTER')).toBe('max.muster');
  });

  it('entfernt ein führendes @', () => {
    expect(normalizeUsername('@max')).toBe('max');
  });

  it('entfernt mehrere führende @', () => {
    expect(normalizeUsername('@@max')).toBe('max');
  });

  it('behält Punkte und Unterstriche', () => {
    expect(normalizeUsername('max.muster_2')).toBe('max.muster_2');
  });
});

describe('validateUsername', () => {
  it('akzeptiert einen einfachen gültigen Namen', () => {
    expect(validateUsername('max')).toEqual({ ok: true, username: 'max' });
  });

  it('akzeptiert Punkte zwischen Segmenten', () => {
    expect(validateUsername('max.muster')).toEqual({ ok: true, username: 'max.muster' });
  });

  it('akzeptiert dog.boss.vibes (Punkte zwischen drei Segmenten)', () => {
    expect(validateUsername('dog.boss.vibes')).toEqual({ ok: true, username: 'dog.boss.vibes' });
    expect(validateUsername('Dog.Boss.Vibes')).toEqual({ ok: true, username: 'dog.boss.vibes' });
    expect(validateUsername('@Dog.Boss.Vibes ')).toEqual({ ok: true, username: 'dog.boss.vibes' });
  });

  it('akzeptiert Unterstriche', () => {
    expect(validateUsername('max_muster')).toEqual({ ok: true, username: 'max_muster' });
  });

  it('akzeptiert Ziffern', () => {
    expect(validateUsername('max123')).toEqual({ ok: true, username: 'max123' });
  });

  it('akzeptiert die untere Längengrenze (3)', () => {
    expect(validateUsername('abc')).toEqual({ ok: true, username: 'abc' });
  });

  it('akzeptiert die obere Längengrenze (24)', () => {
    const name = 'a'.repeat(24);
    expect(validateUsername(name)).toEqual({ ok: true, username: name });
  });

  it('leerer String entfernt den Benutzernamen (null, kein Fehler)', () => {
    expect(validateUsername('')).toEqual({ ok: true, username: null });
  });

  it('nur Leerzeichen entfernt den Benutzernamen (null, kein Fehler)', () => {
    expect(validateUsername('   ')).toEqual({ ok: true, username: null });
  });

  it('lehnt zu kurze Namen (< 3) ab', () => {
    expect(validateUsername('ab')).toEqual({ ok: false, error: 'too_short' });
  });

  it('lehnt zu lange Namen (> 24) ab', () => {
    expect(validateUsername('a'.repeat(25))).toEqual({ ok: false, error: 'too_long' });
  });

  it('lehnt Leerzeichen im Namen ab', () => {
    expect(validateUsername('max must')).toEqual({ ok: false, error: 'invalid' });
  });

  it('lehnt Umlaute/Sonderzeichen ab', () => {
    expect(validateUsername('mäx')).toEqual({ ok: false, error: 'invalid' });
  });

  it('lehnt führende Punkte ab', () => {
    expect(validateUsername('.max')).toEqual({ ok: false, error: 'invalid' });
  });

  it('lehnt abschliessende Punkte ab', () => {
    expect(validateUsername('max.')).toEqual({ ok: false, error: 'invalid' });
  });

  it('lehnt aufeinanderfolgende Punkte ab', () => {
    expect(validateUsername('ma..x')).toEqual({ ok: false, error: 'invalid' });
  });

  it('lehnt reservierte Namen ab', () => {
    expect(validateUsername('admin')).toEqual({ ok: false, error: 'reserved' });
    expect(validateUsername('anyvo')).toEqual({ ok: false, error: 'reserved' });
    expect(validateUsername('trainer')).toEqual({ ok: false, error: 'reserved' });
    expect(validateUsername('null')).toEqual({ ok: false, error: 'reserved' });
  });

  it('reservierte Namen sind case-insensitive (Normalisierung vor Check)', () => {
    expect(validateUsername('ADMIN')).toEqual({ ok: false, error: 'reserved' });
  });

  it('normalisiert vor der Validierung (leading @, Gross/Klein)', () => {
    expect(validateUsername('@Max.Muster')).toEqual({ ok: true, username: 'max.muster' });
  });

  it('listet die mit der RPC-Liste identischen reservierten Namen', () => {
    expect(RESERVED_USERNAMES).toContain('admin');
    expect(RESERVED_USERNAMES).toContain('administrator');
    expect(RESERVED_USERNAMES).toContain('support');
    expect(RESERVED_USERNAMES).toContain('help');
    expect(RESERVED_USERNAMES).toContain('anyvo');
    expect(RESERVED_USERNAMES).toContain('official');
    expect(RESERVED_USERNAMES).toContain('moderator');
    expect(RESERVED_USERNAMES).toContain('system');
    expect(RESERVED_USERNAMES).toContain('root');
    expect(RESERVED_USERNAMES).toContain('staff');
    expect(RESERVED_USERNAMES).toContain('trainer');
    expect(RESERVED_USERNAMES).toContain('null');
    expect(RESERVED_USERNAMES).toContain('undefined');
  });
});

describe('checkUsernameAvailable', () => {
  it('ruft die RPC mit dem normalisierten Namen auf und liefert das Ergebnis', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const res = await checkUsernameAvailable(' @Max ');
    expect(rpc).toHaveBeenCalledWith('check_username_available', { p_username: 'max' });
    expect(res.data).toBe(true);
  });

  it('propagiert den RPC-Fehler', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc down' } });
    const res = await checkUsernameAvailable('max');
    expect(res.error?.message).toBe('rpc down');
  });
});

describe('mapUsernameCheckResult', () => {
  it('boolean true → verfügbar', () => {
    expect(mapUsernameCheckResult(true, null)).toBe('available');
  });

  it('boolean false → vergeben', () => {
    expect(mapUsernameCheckResult(false, null)).toBe('taken');
  });

  it('PGRST202 (RPC nicht im Schema-Cache) → check_failed, nie verfügbar/vergeben', () => {
    const err = {
      code: 'PGRST202',
      message: 'Could not find the function public.check_username_available(p_username) in the schema cache',
      details: 'no matches in schema cache',
      hint: null,
    };
    expect(mapUsernameCheckResult(null, err)).toBe('check_failed');
  });

  it('42501 (permission denied) → check_failed', () => {
    const err = { code: '42501', message: 'permission denied for function check_username_available', details: null, hint: null };
    expect(mapUsernameCheckResult(null, err)).toBe('check_failed');
  });

  it('Netzwerkfehler (kein code) → check_failed', () => {
    const err = new TypeError('Network request failed');
    expect(mapUsernameCheckResult(null, err)).toBe('check_failed');
  });

  it('keine Auth-Session (401) → check_failed', () => {
    const err = { code: '401', message: 'Invalid API key', details: null, hint: null };
    expect(mapUsernameCheckResult(null, err)).toBe('check_failed');
  });

  it('data=null ohne Fehler → vergeben (konservativ, kein falsches verfügbar)', () => {
    expect(mapUsernameCheckResult(null, null)).toBe('taken');
  });

  it('strikte boolean-Auswertung (kein truthy-Trick)', () => {
    expect(mapUsernameCheckResult(1 as unknown as boolean, null)).toBe('taken');
    expect(mapUsernameCheckResult(undefined, null)).toBe('taken');
  });
});

describe('updateUsername', () => {
  it('schreibt den normalisierten Namen in profiles (eq id)', async () => {
    mockUpdate({ error: null });
    const res = await updateUsername('u1', '@Max.Muster');
    expect(from).toHaveBeenCalledWith('profiles');
    expect(res).toEqual({ error: null, taken: false });
    const updateFn = from.mock.results[0].value.update;
    expect(updateFn).toHaveBeenCalledWith({ username: 'max.muster' });
  });

  it('leert den Benutzernamen mit null', async () => {
    mockUpdate({ error: null });
    await updateUsername('u1', null);
    const updateFn = from.mock.results[0].value.update;
    expect(updateFn).toHaveBeenCalledWith({ username: null });
  });

  it('meldet taken bei Unique-Verletzung (23505)', async () => {
    mockUpdate({ error: { code: '23505', message: 'duplicate' } });
    const res = await updateUsername('u1', 'max');
    expect(res.taken).toBe(true);
    expect(res.error).toBe('duplicate');
  });

  it('lehnt ungültige Namen ab, ohne die DB zu kontaktieren', async () => {
    const res = await updateUsername('u1', 'mäx');
    expect(res.error).toBe('Ungültiger Benutzername.');
    expect(from).not.toHaveBeenCalled();
  });
});
