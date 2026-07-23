// ANYVO CONNECT — Tests für Entitlement- und Privacy-Services (reine Funktionen).
import {
  connectEntitlements, effectiveConnectEntitlements, CONNECT_NEWBIE_MAX_FRIENDS,
} from '@/features/connect/services/connect-entitlements';
import {
  canSeePost, sanitizeTrainingForShare, hasSensitiveTrainingKeys, roundApproxCoord,
} from '@/features/connect/services/connect-privacy';

describe('connectEntitlements — Tier-Logik', () => {
  const newbie = { isPro: false, isTrainerModule: false };
  const active   = { isPro: true,  isTrainerModule: false };
  const trainer  = { isPro: true,  isTrainerModule: true };

  it('Newbie: Feed lesen ja, Posten/Events/Suche nein, Freunde begrenzt', () => {
    const e = connectEntitlements(newbie);
    expect(e.canViewFeed).toBe(true);
    expect(e.canCreatePost).toBe(false);
    expect(e.canCreateEvent).toBe(false);
    expect(e.canSearchTrainingPartners).toBe(false);
    expect(e.canCreateGroup).toBe(false);
    expect(e.maxFriends).toBe(CONNECT_NEWBIE_MAX_FRIENDS);
  });

  it('Active/Founder: Posten/Events/Suche ja, unbegrenzte Freunde, keine Gruppen', () => {
    const e = connectEntitlements(active);
    expect(e.canCreatePost).toBe(true);
    expect(e.canCreateEvent).toBe(true);
    expect(e.canSearchTrainingPartners).toBe(true);
    expect(e.maxFriends).toBeNull();
    expect(e.canCreateGroup).toBe(false);
  });

  it('Trainer: zusätzlich Gruppen + Trainerprofil', () => {
    const e = connectEntitlements(trainer);
    expect(e.canCreateGroup).toBe(true);
    expect(e.canManageTrainerProfile).toBe(true);
  });

  it('MVP (enforce=false): voller Zugriff für alle', () => {
    const e = effectiveConnectEntitlements(newbie, false);
    expect(e.canCreatePost).toBe(true);
    expect(e.canCreateEvent).toBe(true);
    expect(e.maxFriends).toBeNull();
  });

  it('enforce=true: echte Tier-Logik', () => {
    expect(effectiveConnectEntitlements({ isPro: false, isTrainerModule: false }, true).canCreatePost).toBe(false);
  });
});

describe('canSeePost — spiegelt die RLS', () => {
  const base = { authorUserId: 'A', deletedAt: null, viewerId: 'V', areFriends: false, isBlocked: false };

  it('eigener Beitrag immer sichtbar', () => {
    expect(canSeePost({ ...base, authorUserId: 'V', visibility: 'private' })).toBe(true);
  });
  it('public: für jeden (nicht blockiert)', () => {
    expect(canSeePost({ ...base, visibility: 'public' })).toBe(true);
  });
  it('friends: nur für bestätigte Freunde', () => {
    expect(canSeePost({ ...base, visibility: 'friends', areFriends: false })).toBe(false);
    expect(canSeePost({ ...base, visibility: 'friends', areFriends: true })).toBe(true);
  });
  it('private: nie für Fremde', () => {
    expect(canSeePost({ ...base, visibility: 'private', areFriends: true })).toBe(false);
  });
  it('Block verhindert Sichtbarkeit auch bei public', () => {
    expect(canSeePost({ ...base, visibility: 'public', isBlocked: true })).toBe(false);
  });
  it('gelöschter Beitrag: für Fremde unsichtbar', () => {
    expect(canSeePost({ ...base, visibility: 'public', deletedAt: '2026-01-01' })).toBe(false);
  });
});

describe('sanitizeTrainingForShare — entfernt sensible Werte', () => {
  const src = { discipline: 'IGP', duration_sec: 3600, distance_m: 500, object_count: 4, difficulty: 'hard', rating: 5 };

  it('volle Auswahl übernimmt nur die Whitelist-Werte', () => {
    const out = sanitizeTrainingForShare(src);
    expect(out).toEqual({ discipline: 'IGP', duration_sec: 3600, distance_m: 500, object_count: 4, difficulty: 'hard', rating: 5 });
  });

  it('abgewählte Werte werden auf null gesetzt', () => {
    const out = sanitizeTrainingForShare(src, { discipline: true, duration: true });
    expect(out.discipline).toBe('IGP');
    expect(out.duration_sec).toBe(3600);
    expect(out.distance_m).toBeNull();
    expect(out.rating).toBeNull();
  });

  it('sensible Felder im Quellobjekt landen NIE in der Ausgabe', () => {
    const dirty = { ...src, gps_track: [[1, 2]], notes: 'privat', trainer_comment: 'x', health: {}, client: {} };
    const out = sanitizeTrainingForShare(dirty as never);
    expect(hasSensitiveTrainingKeys(out as unknown as Record<string, unknown>)).toBe(false);
    expect(Object.keys(out)).toEqual(['discipline', 'duration_sec', 'distance_m', 'object_count', 'difficulty', 'rating']);
  });

  it('hasSensitiveTrainingKeys erkennt sensible Schlüssel', () => {
    expect(hasSensitiveTrainingKeys({ notes: 'x' })).toBe(true);
    expect(hasSensitiveTrainingKeys({ discipline: 'IGP' })).toBe(false);
  });
});

describe('roundApproxCoord — Standort-Anonymisierung', () => {
  it('rundet grob (≈1 km) und behält null', () => {
    expect(roundApproxCoord(47.376887)).toBe(47.38);
    expect(roundApproxCoord(8.541694)).toBe(8.54);
    expect(roundApproxCoord(null)).toBeNull();
    expect(roundApproxCoord(undefined)).toBeNull();
  });
});
