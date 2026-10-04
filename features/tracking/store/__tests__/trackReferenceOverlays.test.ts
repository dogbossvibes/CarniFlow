// Referenz-Fährten beim Legen — reine Logik (Kandidaten, Nutzerisolation, Geometrie).
// Beispiel Mehrhundehalter: Amoun, Baily, Clay, Doran.
import type { PendingTrack } from '@/features/tracking/store/trackPersist';
import { type ActiveFaehrtenMap, upsertEntry } from '@/features/tracking/store/activeFaehrtenModel';
import {
  filterVisibleReferenceOverlays, referenceCandidatesKey, referenceOverlayCount, resolveReferenceOverlay, selectReferenceCandidates,
  type TrackReferenceCandidate, type TrackReferenceSources,
} from '@/features/tracking/store/trackReferenceOverlays';
import type { SessionStatus } from '@/features/tracking/store/trackingStore';

const DOGS = [
  { id: 'amoun', name: 'Amoun', owner_id: 'user-1' }, { id: 'baily', name: 'Baily', owner_id: 'user-1' },
  { id: 'clay', name: 'Clay', owner_id: 'user-1' }, { id: 'doran', name: 'Doran', owner_id: 'user-1' },
];
// Legereihenfolge: Amoun (t=1000) → Doran (2000) → Clay (3000) → Baily (4000).
const START: Record<string, number> = { amoun: 1000, doran: 2000, clay: 3000, baily: 4000 };

function registry(entries: [dogId: string, status: SessionStatus][]): ActiveFaehrtenMap {
  let m: ActiveFaehrtenMap = {};
  for (const [dogId, status] of entries) {
    m = upsertEntry(m, dogId, { status, sessionId: `sess-${dogId}`, startedAt: START[dogId] ?? 0, updatedAt: 1 });
  }
  return m;
}
const names = (cands: TrackReferenceCandidate[]) => cands.map(c => c.dogName);
const scope = (currentDogId: string | null, currentSessionId: string | null = null) =>
  ({ currentUserDogs: DOGS, ownerUserId: 'user-1', currentDogId, currentSessionId });

const pts = (n = 3) => Array.from({ length: n }, (_, i) => ({ lat: 47 + i * 1e-4, lng: 8 + i * 1e-4, accuracy: 4, t: 1000 + i }));
const pending = (dogId: string, over: Partial<PendingTrack> = {}): PendingTrack => ({
  sessionId: `sess-${dogId}`, dogId, trackPoints: pts(), markers: [], runPoints: [], distanceMeters: 50,
  durationSeconds: 60, layFinishedAt: 5000, startAnchor: null, savedAt: 5000, status: 'resting', ...over,
});
const sessionRow = (dogId: string, over: Partial<NonNullable<TrackReferenceSources['session']>> = {}): NonNullable<TrackReferenceSources['session']> => ({
  local_id: `sess-${dogId}`, user_id: 'user-1', dog_id: dogId, type: 'track', deleted_at: null, status: 'completed',
  payload_json: JSON.stringify({ distanceMeters: 50 }), ...over,
});
const layRows = (n = 3) => Array.from({ length: n }, (_, i) => ({ latitude: 47.1 + i * 1e-4, longitude: 8.1 + i * 1e-4 }));
const cand = (dogId: string, status: TrackReferenceCandidate['status'] = 'resting'): TrackReferenceCandidate =>
  ({ dogId, sessionId: `sess-${dogId}`, dogName: dogId, status, order: START[dogId] ?? 0 });

describe('selectReferenceCandidates — Amoun/Doran/Clay/Baily', () => {
  it('1. current Amoun, Doran resting → Doran', () => {
    expect(names(selectReferenceCandidates(registry([['doran', 'resting']]), scope('amoun')))).toEqual(['Doran']);
  });
  it('2. current Doran, Amoun resting → Amoun', () => {
    expect(names(selectReferenceCandidates(registry([['amoun', 'resting']]), scope('doran')))).toEqual(['Amoun']);
  });
  it('3. current Clay, Amoun + Doran resting → beide', () => {
    expect(names(selectReferenceCandidates(registry([['amoun', 'resting'], ['doran', 'resting']]), scope('clay')))).toEqual(['Amoun', 'Doran']);
  });
  it('4. current Baily, Amoun + Doran + Clay resting → drei', () => {
    const r = registry([['amoun', 'resting'], ['doran', 'resting'], ['clay', 'resting']]);
    expect(names(selectReferenceCandidates(r, scope('baily')))).toEqual(['Amoun', 'Doran', 'Clay']);
  });
  it('5. aktueller Hund (auch laying) und aktuelle Session werden nie geliefert', () => {
    const r = registry([['amoun', 'resting'], ['baily', 'laying'], ['doran', 'resting']]);
    expect(names(selectReferenceCandidates(r, scope('baily')))).toEqual(['Amoun', 'Doran']);
    // Aktuelle Session liegt (defensiv) unter einem anderen Registry-Hund → ebenfalls ausgeschlossen.
    expect(names(selectReferenceCandidates(r, scope('baily', 'sess-doran')))).toEqual(['Amoun']);
    for (const dogId of ['amoun', 'doran', 'clay', 'baily']) {
      const all = registry([['amoun', 'resting'], ['doran', 'resting'], ['clay', 'resting'], ['baily', 'resting']]);
      expect(selectReferenceCandidates(all, scope(dogId)).map(c => c.dogId)).not.toContain(dogId);
    }
  });
  it('laying eines ANDEREN Hundes wird nicht angezeigt; laid/searching schon', () => {
    const r = registry([['amoun', 'laying'], ['doran', 'laid'], ['clay', 'searching']]);
    expect(selectReferenceCandidates(r, scope('baily')).map(c => [c.dogName, c.status])).toEqual([['Doran', 'laid'], ['Clay', 'searching']]);
  });
  it('6./7. cancelled / completed sind nie in der Registry → keine Kandidaten', () => {
    let r = registry([['amoun', 'resting'], ['doran', 'resting']]);
    r = upsertEntry(r, 'amoun', { status: 'cancelled' });
    r = upsertEntry(r, 'doran', { status: 'completed' });
    expect(selectReferenceCandidates(r, scope('baily'))).toEqual([]);
    // Roh-Eintrag mit geschlossenem Status (manipuliert/Legacy) wird ebenfalls ignoriert.
    const raw = { amoun: { ...registry([['amoun', 'resting']]).amoun, status: 'cancelled' as SessionStatus } };
    expect(selectReferenceCandidates(raw, scope('baily'))).toEqual([]);
  });
  it('10. fremder Hund (anderer Account / Trainer) → ausgeschlossen', () => {
    const r = registry([['amoun', 'resting'], ['fremd', 'resting']]);
    expect(selectReferenceCandidates(r, scope('baily')).map(c => c.dogId)).toEqual(['amoun']);
    expect(selectReferenceCandidates(r, { currentUserDogs: [], ownerUserId: 'user-1', currentDogId: 'baily' })).toEqual([]);
  });
  it('Owner-Isolation fail-closed: geteilter Trainer-Hund (fremde owner_id), fehlende owner_id oder fehlender Nutzer → ausgeschlossen', () => {
    const r = registry([['amoun', 'resting'], ['shared', 'resting'], ['legacy', 'resting']]);
    const dogs = [...DOGS, { id: 'shared', name: 'Trainerhund', owner_id: 'trainer-9' }, { id: 'legacy', name: 'Ohne Owner' }];
    expect(selectReferenceCandidates(r, { currentUserDogs: dogs, ownerUserId: 'user-1', currentDogId: 'baily' }).map(c => c.dogId)).toEqual(['amoun']);
    expect(selectReferenceCandidates(r, { currentUserDogs: dogs, ownerUserId: null, currentDogId: 'baily' })).toEqual([]);
    expect(selectReferenceCandidates(r, { currentUserDogs: dogs, ownerUserId: 'trainer-9', currentDogId: 'baily' }).map(c => c.dogId)).toEqual(['shared']);
  });
  it('Eintrag ohne sessionId → kein Kandidat (keine Zuordnung möglich)', () => {
    const r = upsertEntry({}, 'amoun', { status: 'resting', sessionId: null });
    expect(selectReferenceCandidates(r, scope('baily'))).toEqual([]);
  });
  it('14. Reihenfolge stabil: Legebeginn, unabhängig von Objekt-Reihenfolge/updatedAt', () => {
    const a = registry([['clay', 'resting'], ['amoun', 'resting'], ['doran', 'resting']]);
    const b = registry([['doran', 'resting'], ['clay', 'resting'], ['amoun', 'resting']]);
    const bumped = upsertEntry(b, 'amoun', { updatedAt: 999999, distanceMeters: 321 });
    for (const r of [a, b, bumped]) expect(names(selectReferenceCandidates(r, scope('baily')))).toEqual(['Amoun', 'Doran', 'Clay']);
  });
  it('15. keine aktiven Fährten → leeres Array', () => {
    expect(selectReferenceCandidates({}, scope('baily'))).toEqual([]);
  });
  it('Schlüssel ändert sich NICHT bei Kennzahl-Updates, aber bei Statuswechsel', () => {
    const r = registry([['amoun', 'resting'], ['baily', 'laying']]);
    const k = referenceCandidatesKey(selectReferenceCandidates(r, scope('baily')));
    const metrics = upsertEntry(upsertEntry(r, 'baily', { distanceMeters: 99, gpsAccuracy: 3 }), 'amoun', { updatedAt: 42 });
    expect(referenceCandidatesKey(selectReferenceCandidates(metrics, scope('baily')))).toBe(k);
    const searching = upsertEntry(r, 'amoun', { status: 'searching' });
    expect(referenceCandidatesKey(selectReferenceCandidates(searching, scope('baily')))).not.toBe(k);
  });
});

describe('resolveReferenceOverlay — Geometrie & Sperren', () => {
  it('12. Pending vorhanden → Geometrie 1:1 aus dem Pending (SQLite nicht nötig)', () => {
    const o = resolveReferenceOverlay(cand('amoun'), { pending: pending('amoun'), session: null, layPoints: null }, 'user-1');
    expect(o).toEqual({ dogId: 'amoun', sessionId: 'sess-amoun', dogName: 'amoun', status: 'resting', points: pts().map(p => ({ lat: p.lat, lng: p.lng })) });
  });
  it('13. Pending fehlt + SQLite vorhanden → Geometrie aus SQLite-Lay-Punkten', () => {
    const o = resolveReferenceOverlay(cand('amoun'), { pending: null, session: sessionRow('amoun'), layPoints: layRows(4) }, 'user-1');
    expect(o?.points).toEqual(layRows(4).map(p => ({ lat: p.latitude, lng: p.longitude })));
  });
  it('Pending einer ANDEREN Session → SQLite-Fallback, nie fremde Geometrie', () => {
    const other = pending('amoun', { sessionId: 'sess-alt', trackPoints: pts(5) });
    expect(resolveReferenceOverlay(cand('amoun'), { pending: other, session: null, layPoints: null }, 'user-1')).toBeNull();
    const o = resolveReferenceOverlay(cand('amoun'), { pending: other, session: sessionRow('amoun'), layPoints: layRows() }, 'user-1');
    expect(o?.points[0]).toEqual({ lat: 47.1, lng: 8.1 });
  });
  it('6. cancelled (Lifecycle-Marker oder Status) → ausgeschlossen, auch mit gültigem Pending', () => {
    const lc = sessionRow('amoun', { payload_json: JSON.stringify({ trackLifecycleStatus: 'cancelled' }) });
    expect(resolveReferenceOverlay(cand('amoun'), { pending: pending('amoun'), session: lc, layPoints: layRows() }, 'user-1')).toBeNull();
    const st = sessionRow('amoun', { status: 'cancelled' });
    expect(resolveReferenceOverlay(cand('amoun'), { pending: pending('amoun'), session: st, layPoints: layRows() }, 'user-1')).toBeNull();
    expect(resolveReferenceOverlay(cand('amoun'), { pending: pending('amoun', { status: 'cancelled' }), session: null, layPoints: null }, 'user-1')).toBeNull();
  });
  it('7. completed_without_app → ausgeschlossen', () => {
    const s = sessionRow('amoun', { payload_json: JSON.stringify({ trackLifecycleStatus: 'completed_without_app' }) });
    expect(resolveReferenceOverlay(cand('amoun'), { pending: pending('amoun'), session: s, layPoints: layRows() }, 'user-1')).toBeNull();
  });
  it('8. finaler Suchlauf (payload_json.run) → ausgeschlossen', () => {
    const s = sessionRow('amoun', { payload_json: JSON.stringify({ run: { score: 90 } }) });
    expect(resolveReferenceOverlay(cand('amoun', 'searching'), { pending: pending('amoun', { status: 'searching' }), session: s, layPoints: layRows() }, 'user-1')).toBeNull();
  });
  it('9. historische abgeschlossene Fährte (Pending completed, kein offener Puffer) → ausgeschlossen', () => {
    expect(resolveReferenceOverlay(cand('amoun'), { pending: pending('amoun', { status: 'completed' }), session: null, layPoints: null }, 'user-1')).toBeNull();
    const deleted = sessionRow('amoun', { deleted_at: '2026-10-01T00:00:00Z' });
    expect(resolveReferenceOverlay(cand('amoun'), { pending: null, session: deleted, layPoints: layRows() }, 'user-1')).toBeNull();
  });
  it('10. falscher User / falscher Hund in der Session-Zeile → ausgeschlossen', () => {
    expect(resolveReferenceOverlay(cand('amoun'), { pending: pending('amoun'), session: sessionRow('amoun', { user_id: 'user-2' }), layPoints: null }, 'user-1')).toBeNull();
    expect(resolveReferenceOverlay(cand('amoun'), { pending: null, session: sessionRow('amoun', { dog_id: 'doran' }), layPoints: layRows() }, 'user-1')).toBeNull();
    expect(resolveReferenceOverlay(cand('amoun'), { pending: pending('amoun', { dogId: 'doran' }), session: null, layPoints: null }, 'user-1')).toBeNull();
  });
  it('11. Registry-Eintrag ohne Geometrie → null, kein Crash, keine Fake-Linie', () => {
    expect(resolveReferenceOverlay(cand('amoun'), { pending: null, session: null, layPoints: null }, 'user-1')).toBeNull();
    expect(resolveReferenceOverlay(cand('amoun'), { pending: null, session: sessionRow('amoun'), layPoints: [] }, 'user-1')).toBeNull();
    expect(resolveReferenceOverlay(cand('amoun'), { pending: null, session: sessionRow('amoun'), layPoints: layRows(1) }, 'user-1')).toBeNull();
    const broken = [{ latitude: Number.NaN, longitude: 8 }, { latitude: 47, longitude: 8 }];
    expect(resolveReferenceOverlay(cand('amoun'), { pending: null, session: sessionRow('amoun'), layPoints: broken }, 'user-1')).toBeNull();
    expect(resolveReferenceOverlay(cand('amoun'), { pending: pending('amoun', { trackPoints: [] }), session: null, layPoints: null }, 'user-1')).toBeNull();
  });
  it('searching: gelegte Referenzlinie aus dem offenen Puffer lesbar', () => {
    const o = resolveReferenceOverlay(cand('clay', 'searching'), { pending: pending('clay', { status: 'searching', runPoints: pts(9) }), session: sessionRow('clay'), layPoints: null }, 'user-1');
    expect(o?.status).toBe('searching');
    expect(o?.points).toHaveLength(3);   // nur Lay-Punkte, keine Such-/Run-Punkte
  });
  it('Overlay enthält ausschliesslich Anzeige-Felder (keine Marker/Run/Analyse)', () => {
    const o = resolveReferenceOverlay(cand('amoun'), { pending: pending('amoun', { markers: [{ id: 'm', type: 'winkel' } as never] }), session: null, layPoints: null }, 'user-1');
    expect(Object.keys(o!).sort()).toEqual(['dogId', 'dogName', 'points', 'sessionId', 'status']);
    expect(referenceOverlayCount([o!])).toBe(1);
    expect(referenceOverlayCount(undefined)).toBe(0);
  });
});

describe('Härtung — Pending defekt / Anzeige-Filter', () => {
  it('Pending defekt (trackPoints kein Array / kaputte Punkte) → kein Throw, SQLite-Fallback', () => {
    const broken = { ...pending('amoun'), trackPoints: { length: 5 } as never };
    expect(() => resolveReferenceOverlay(cand('amoun'), { pending: broken, session: sessionRow('amoun'), layPoints: layRows() }, 'user-1')).not.toThrow();
    expect(resolveReferenceOverlay(cand('amoun'), { pending: broken, session: sessionRow('amoun'), layPoints: layRows() }, 'user-1')?.points[0]).toEqual({ lat: 47.1, lng: 8.1 });
    const nanPts = pending('amoun', { trackPoints: [{ lat: Number.NaN, lng: 8, t: 1 }, { lat: 47, lng: 8, t: 2 }] as never });
    expect(resolveReferenceOverlay(cand('amoun'), { pending: nanPts, session: sessionRow('amoun'), layPoints: layRows() }, 'user-1')?.points[0]).toEqual({ lat: 47.1, lng: 8.1 });
  });
  it('Pending + SQLite defekt → nur dieses Overlay null', () => {
    const broken = { ...pending('amoun'), trackPoints: 'x' as never };
    expect(resolveReferenceOverlay(cand('amoun'), { pending: broken, session: sessionRow('amoun'), layPoints: [{ latitude: Number.NaN, longitude: 8 }, { latitude: 47, longitude: 8 }] }, 'user-1')).toBeNull();
  });
  it('filterVisibleReferenceOverlays: nie aktueller Hund/aktuelle Session, nur eigene Hunde', () => {
    const o = (dogId: string) => ({ dogId, sessionId: `sess-${dogId}`, dogName: dogId, status: 'resting' as const, points: [] });
    const all = [o('amoun'), o('doran'), o('fremd')];
    expect(filterVisibleReferenceOverlays(all, scope('doran')).map(x => x.dogId)).toEqual(['amoun']);
    expect(filterVisibleReferenceOverlays(all, scope('baily', 'sess-amoun')).map(x => x.dogId)).toEqual(['doran']);
    expect(filterVisibleReferenceOverlays(all, { ...scope('baily'), ownerUserId: null })).toEqual([]);
  });
});
