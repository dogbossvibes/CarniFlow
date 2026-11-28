import {
  isMissingDog, isMissingDogError, splitFailedItems, summarizePayload, syncErrorKind, shortTechnicalError,
} from '@/features/sync/services/missingDog';

const FK = 'insert or update on table "training_sessions" violates foreign key constraint "training_sessions_dog_id_fkey"';

describe('isMissingDogError', () => {
  it('erkennt den Production-Fehler 23503 auf dog_id (mit und ohne Constraint-Namen)', () => {
    expect(isMissingDogError(FK)).toBe(true);
    expect(isMissingDogError('23503: Key (dog_id)=(x) is not present in table "dogs".')).toBe(true);
    expect(isMissingDogError('violates foreign key constraint "fk_x" Key (dog_id)')).toBe(true);
    expect(isMissingDogError('null value in column "dog_id" of relation "training_sessions" violates not-null constraint')).toBe(true);
  });
  it('andere FK-/Serverfehler und Netzfehler sind nicht „Hund fehlt"', () => {
    expect(isMissingDogError('violates foreign key constraint "track_runs_session_id_fkey"')).toBe(false);
    expect(isMissingDogError('Network request failed')).toBe(false);
    expect(isMissingDogError(null)).toBe(false);
  });
});

describe('isMissingDog (Offline-Fall)', () => {
  const dogs = new Set(['oha', 'malu', 'yam']);
  it('offline: Netzfehler gilt nie als „Hund fehlt", auch wenn die Hundeliste fehlt oder die ID unbekannt ist', () => {
    expect(isMissingDog({ dogId: 'ghost', lastError: 'Network request failed' }, null)).toBe(false);
    expect(isMissingDog({ dogId: 'ghost', lastError: 'TypeError: Failed to fetch' }, dogs)).toBe(false);
    expect(isMissingDog({ dogId: 'ghost', lastError: null }, null)).toBe(false);
  });
  it('FK-Fehler zählt auch ohne geladene Hundeliste', () => {
    expect(isMissingDog({ dogId: 'ghost', lastError: FK }, null)).toBe(true);
  });
  it('unbekannte dog_id gegen frisch geladene, nicht leere Hundeliste', () => {
    expect(isMissingDog({ dogId: 'ghost', lastError: 'irgendwas' }, dogs)).toBe(true);
    expect(isMissingDog({ dogId: 'oha', lastError: 'irgendwas' }, dogs)).toBe(false);
    expect(isMissingDog({ dogId: 'ghost', lastError: 'irgendwas' }, new Set())).toBe(false);   // leere Liste = kein Beleg
  });
});

describe('splitFailedItems', () => {
  const item = (id: string, over: Record<string, unknown> = {}) => ({
    queueId: id, entityType: 'training_session', lastError: FK, session: { userId: 'u1', dogId: 'ghost' }, ...over,
  });
  it('trennt eigene Fährten mit fehlendem Hund von übrigen Fehlern', () => {
    const items = [
      item('a'), item('b', { lastError: 'Network request failed' }), item('c', { session: { userId: 'other', dogId: 'ghost' } }),
      item('d', { entityType: 'media_file', session: null }), item('e', { session: null }),
    ];
    const r = splitFailedItems(items, 'u1', null);
    expect(r.missingDog.map(i => i.queueId)).toEqual(['a']);
    expect(r.other.map(i => i.queueId)).toEqual(['b', 'c', 'd', 'e']);
  });
  it('ohne Login nichts als „Hund fehlt"', () => {
    expect(splitFailedItems([item('a')], null, null).missingDog).toEqual([]);
  });
});

describe('summarizePayload (Altformate)', () => {
  it('Länge und Stand', () => {
    expect(summarizePayload(JSON.stringify({ distanceMeters: 412, run: { run_id: 'r' } }))).toEqual({ distanceMeters: 412, searched: true });
    expect(summarizePayload(JSON.stringify({ distanceMeters: 200 }))).toEqual({ distanceMeters: 200, searched: false });
  });
  it('leer, ungültig oder ohne Felder → keine Länge, „gelegt"', () => {
    for (const p of [null, '', '{kaputt', '[]', '"x"', JSON.stringify({ distanceMeters: 'x', run: null })]) {
      expect(summarizePayload(p)).toEqual({ distanceMeters: null, searched: false });
    }
  });
});

describe('lesbarer Grund', () => {
  it('ordnet Fehler zu', () => {
    expect(syncErrorKind(FK)).toBe('missing_dog');
    expect(syncErrorKind('Network request failed')).toBe('network');
    expect(syncErrorKind('JWT expired')).toBe('auth');
    expect(syncErrorKind('new row violates row-level security policy')).toBe('auth');
    expect(syncErrorKind('markers: 1/3 abgelehnt (x)')).toBe('markers');
    expect(syncErrorKind('value too long')).toBe('server');
    expect(syncErrorKind(null)).toBe('unknown');
  });
  it('kürzt technische Details', () => {
    expect(shortTechnicalError('a'.repeat(300))).toHaveLength(140);
    expect(shortTechnicalError('zeile1\nzeile2')).toBe('zeile1');
    expect(shortTechnicalError(null)).toBeNull();
  });
});
