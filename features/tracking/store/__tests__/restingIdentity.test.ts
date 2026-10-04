// Liegezeit-Identität (rein): fail closed, nie „jüngster Puffer eines anderen Hundes".
import { belongsToSession, matchesRestingIdentity, resolveRestingIdentity } from '@/features/tracking/store/restingIdentity';

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

describe('belongsToSession — Puffer/Store ohne eigene sessionId (Recorder hält currentSessionId=null)', () => {
  const t = { dogId: 'dog-A', sessionId: 's-A' };
  it('gleiche sessionId → ja; andere sessionId → nein (auch mit Registry-Beleg)', () => {
    expect(belongsToSession({ dogId: 'dog-A', sessionId: 's-A' }, t)).toBe(true);
    expect(belongsToSession({ dogId: 'dog-A', sessionId: 's-OLD' }, t, 's-A')).toBe(false);
  });
  it('sessionId fehlt → nur mit Registry-Beleg derselben Session und desselben Hundes', () => {
    expect(belongsToSession({ dogId: 'dog-A', sessionId: null }, t, 's-A')).toBe(true);
    expect(belongsToSession({ dogId: 'dog-A', sessionId: null }, t, 's-B')).toBe(false);
    expect(belongsToSession({ dogId: 'dog-A', sessionId: null }, t, null)).toBe(false);   // fail closed
    expect(belongsToSession({ dogId: 'dog-A', sessionId: null }, t)).toBe(false);
  });
  it('fremder Hund → nie, egal was die Registry sagt', () => {
    expect(belongsToSession({ dogId: 'dog-B', sessionId: null }, t, 's-A')).toBe(false);
    expect(belongsToSession({ dogId: 'dog-B', sessionId: 's-A' }, t, 's-A')).toBe(false);
    expect(belongsToSession(null, t, 's-A')).toBe(false);
  });
  it('matchesRestingIdentity nutzt denselben Registry-Beleg', () => {
    expect(matchesRestingIdentity({ sessionId: 's-A', dogId: 'dog-A' }, { dogId: 'dog-A', sessionId: null }, 's-A')).toBe(true);
    expect(matchesRestingIdentity({ sessionId: 's-A', dogId: 'dog-A' }, { dogId: 'dog-A', sessionId: null })).toBe(false);
  });
});
