// Liegezeit-Identität (rein): fail closed, nie „jüngster Puffer eines anderen Hundes".
import { matchesRestingIdentity, resolveRestingIdentity } from '@/features/tracking/store/restingIdentity';

describe('resolveRestingIdentity', () => {
  it('1. sessionId + dogId → genau diese (auch ohne lokale Zeile)', () => {
    expect(resolveRestingIdentity({ routeSessionId: 's-A', routeDogId: 'dog-A', sessionDogId: 'dog-A' })).toEqual({ ok: true, sessionId: 's-A', dogId: 'dog-A', source: 'route' });
    expect(resolveRestingIdentity({ routeSessionId: 's-A', routeDogId: 'dog-A', sessionDogId: null })).toMatchObject({ ok: true, dogId: 'dog-A' });
  });
  it('1b. Session gehört laut lokaler Zeile einem anderen Hund → dog_mismatch (keine Anzeige)', () => {
    expect(resolveRestingIdentity({ routeSessionId: 's-A', routeDogId: 'dog-B', sessionDogId: 'dog-A' })).toEqual({ ok: false, reason: 'dog_mismatch' });
  });
  it('2. nur sessionId → Hund aus genau dieser Session; unbekannt → fail closed', () => {
    expect(resolveRestingIdentity({ routeSessionId: 's-A', routeDogId: undefined, sessionDogId: 'dog-A' })).toEqual({ ok: true, sessionId: 's-A', dogId: 'dog-A', source: 'session' });
    expect(resolveRestingIdentity({ routeSessionId: 's-X', routeDogId: undefined, sessionDogId: null })).toEqual({ ok: false, reason: 'unknown_session' });
  });
  it('3. nur dogId → eigener Slot; 4. nichts → fail closed', () => {
    expect(resolveRestingIdentity({ routeSessionId: undefined, routeDogId: 'dog-A', sessionDogId: undefined })).toEqual({ ok: true, sessionId: null, dogId: 'dog-A', source: 'dog' });
    expect(resolveRestingIdentity({ routeSessionId: '', routeDogId: '', sessionDogId: undefined })).toEqual({ ok: false, reason: 'no_identity' });
  });
});

describe('matchesRestingIdentity', () => {
  it('nur derselbe Hund und — falls vorgegeben — dieselbe Session', () => {
    const id = { sessionId: 's-A', dogId: 'dog-A' };
    expect(matchesRestingIdentity(id, { dogId: 'dog-A', sessionId: 's-A' })).toBe(true);
    expect(matchesRestingIdentity(id, { dogId: 'dog-A', sessionId: 's-A-alt' })).toBe(false);
    expect(matchesRestingIdentity(id, { dogId: 'dog-B', sessionId: 's-A' })).toBe(false);
    expect(matchesRestingIdentity(id, null)).toBe(false);
    expect(matchesRestingIdentity({ sessionId: null, dogId: 'dog-A' }, { dogId: 'dog-A', sessionId: 'beliebig' })).toBe(true);
  });
});
