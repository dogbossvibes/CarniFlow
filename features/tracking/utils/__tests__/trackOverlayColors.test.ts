// Fährtenfarbe je Hund: Auflösung ausschliesslich über die dogId des Overlays, stabiler
// Fallback ohne Zufall, Palette ohne Mint/Rot, Migrations-Contract (SQL-Keys = Tokens).
import fs from 'fs';
import { C, FT, TRACK_OVERLAY_COLORS } from '@/constants/colors';
import {
  TRACK_OVERLAY_AUTO_KEYS, TRACK_OVERLAY_COLOR_KEYS, autoTrackOverlayColorKey, isTrackOverlayColorKey,
  resolveTrackOverlayColorKey, trackOverlayColor,
} from '@/features/tracking/utils/trackOverlayColors';
import { type ActiveFaehrtenMap, upsertEntry } from '@/features/tracking/store/activeFaehrtenModel';
import {
  referenceCandidatesKey, resolveReferenceOverlay, selectReferenceCandidates, type TrackReferenceCandidate,
} from '@/features/tracking/store/trackReferenceOverlays';

const USER = 'user-1';
const reg = (...entries: [string, string][]): ActiveFaehrtenMap =>
  entries.reduce<ActiveFaehrtenMap>((m, [dogId, sessionId]) =>
    upsertEntry(m, dogId, { status: 'resting', sessionId, startedAt: 1, layStartedAt: 2 }), {});
const dogs = (...d: { id: string; name: string; track_overlay_color_key?: string | null }[]) =>
  d.map(x => ({ ...x, owner_id: USER }));

describe('Farbauflösung', () => {
  it('A. colorKey=orange → orange', () => {
    expect(resolveTrackOverlayColorKey('dog-malu', 'orange')).toBe('orange');
    expect(trackOverlayColor('orange')).toBe(TRACK_OVERLAY_COLORS.orange);
  });
  it('B. colorKey=violet → violet', () => {
    expect(resolveTrackOverlayColorKey('dog-skadi', 'violet')).toBe('violet');
  });
  it('C. kein/ungültiger colorKey → deterministischer Fallback aus dem Auto-Pool', () => {
    for (const stored of [null, undefined, '', 'red', '#FF9838', 'mint', 42]) {
      const k = resolveTrackOverlayColorKey('dog-yam', stored);
      expect(k).toBe(autoTrackOverlayColorKey('dog-yam'));
      expect(TRACK_OVERLAY_AUTO_KEYS).toContain(k);
    }
  });
  it('D. gleiche dogId nach „Neustart" (frische Module) → gleiche Fallbackfarbe; kein Math.random', () => {
    const ids = ['3f1c…a', 'b7e2-dog', 'dog-1', 'dog-2', 'c0ffee00-0000-4000-8000-000000000001'];
    const first = ids.map(autoTrackOverlayColorKey);
    let fresh!: typeof import('@/features/tracking/utils/trackOverlayColors');
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      fresh = require('@/features/tracking/utils/trackOverlayColors');
    });
    const rnd = jest.spyOn(Math, 'random');
    expect(ids.map(fresh.autoTrackOverlayColorKey)).toEqual(first);
    expect(rnd).not.toHaveBeenCalled();
    rnd.mockRestore();
    expect(fs.readFileSync('features/tracking/utils/trackOverlayColors.ts', 'utf8')).not.toMatch(/Math\.random|Date\.now/);
  });
  it('Fallback verteilt verschiedene dogIds auf mehrere Farben (Kollisionen möglich, aber selten)', () => {
    const keys = new Set(Array.from({ length: 50 }, (_, i) => autoTrackOverlayColorKey(`dog-${i}`)));
    expect(keys.size).toBe(TRACK_OVERLAY_AUTO_KEYS.length);
  });
  it('isTrackOverlayColorKey kennt nur Palette-Keys (kein Prototyp-Key)', () => {
    expect(TRACK_OVERLAY_COLOR_KEYS.every(isTrackOverlayColorKey)).toBe(true);
    for (const v of ['toString', 'constructor', 'Orange', 'red', null]) expect(isTrackOverlayColorKey(v)).toBe(false);
  });
});

describe('Palette', () => {
  it('6–8 Farben, keine Mint (aktuelle Fährte), kein Rot (destruktiv), nicht die blaue Suchspur', () => {
    const values = Object.values(TRACK_OVERLAY_COLORS).map(v => v.toLowerCase());
    expect(values.length).toBeGreaterThanOrEqual(6);
    expect(values.length).toBeLessThanOrEqual(8);
    for (const forbidden of [C.trackPrimary, FT.acc, FT.bad, C.trackDanger, C.trackBlue]) expect(values).not.toContain(forbidden.toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('Referenz-Kandidaten: Farbe nur aus der dogId des jeweiligen Hundes', () => {
  const D = dogs({ id: 'malu', name: 'Malu', track_overlay_color_key: 'orange' }, { id: 'skadi', name: 'Skadi', track_overlay_color_key: 'violet' },
    { id: 'yam', name: 'Yam', track_overlay_color_key: 'pink' }, { id: 'ohne', name: 'Ohne' });
  const R = reg(['malu', 's-malu'], ['skadi', 's-skadi'], ['yam', 's-yam'], ['ohne', 's-ohne']);
  const colorsOf = (current: string) => Object.fromEntries(
    selectReferenceCandidates(R, { currentUserDogs: D, ownerUserId: USER, currentDogId: current }).map(c => [c.dogId, c.colorKey]));
  it('E. zwei/mehrere Hunde → Farben nicht vertauscht; ohne Key → Fallback dieses Hundes', () => {
    expect(colorsOf('yam')).toEqual({ malu: 'orange', skadi: 'violet', ohne: autoTrackOverlayColorKey('ohne') });
  });
  it('F. aktueller Hund überschreibt keine Referenzfarbe (Wechsel des aktuellen Hundes ändert nichts)', () => {
    const a = colorsOf('yam');
    const b = colorsOf('malu');
    expect(b.skadi).toBe(a.skadi);
    expect(b.ohne).toBe(a.ohne);
    expect(b.yam).toBe('pink');            // Yams eigene Farbe, nicht Malus
    expect(b).not.toHaveProperty('malu');  // aktueller Hund nie als Referenz
  });
  it('G. mehrere Sessions desselben Hundes → dieselbe Hundefarbe, Session bleibt getrennt', () => {
    const base: Omit<TrackReferenceCandidate, 'sessionId'> = { dogId: 'malu', dogName: 'Malu', colorKey: 'orange', status: 'resting', order: 1 };
    const src = (sessionId: string) => ({ pending: { sessionId, dogId: 'malu', trackPoints: [{ lat: 47, lng: 8, t: 1 }, { lat: 47.001, lng: 8, t: 2 }, { lat: 47.002, lng: 8, t: 3 }], markers: [], runPoints: [], distanceMeters: 20, durationSeconds: 60, layFinishedAt: 1, layStartedAt: 1, startAnchor: null, savedAt: 1, status: 'resting' } as never, session: null, layPoints: null });
    const o1 = resolveReferenceOverlay({ ...base, sessionId: 's1' }, src('s1'), USER);
    const o2 = resolveReferenceOverlay({ ...base, sessionId: 's2' }, src('s2'), USER);
    expect([o1?.sessionId, o2?.sessionId]).toEqual(['s1', 's2']);
    expect([o1?.colorKey, o2?.colorKey]).toEqual(['orange', 'orange']);
  });
  it('Farbänderung im Profil ändert den Lade-Schlüssel (Overlay übernimmt neue Farbe)', () => {
    const k1 = referenceCandidatesKey(selectReferenceCandidates(R, { currentUserDogs: D, ownerUserId: USER, currentDogId: 'yam' }));
    const D2 = D.map(d => (d.id === 'malu' ? { ...d, track_overlay_color_key: 'blue' } : d));
    const k2 = referenceCandidatesKey(selectReferenceCandidates(R, { currentUserDogs: D2, ownerUserId: USER, currentDogId: 'yam' }));
    expect(k1).not.toBe(k2);
    expect(k2).toContain('malu:s-malu:resting:Malu:blue');
  });
  it('fremde Hunde (andere owner_id) liefern weder Kandidat noch Farbe', () => {
    const foreign = [...D, { id: 'x', name: 'X', owner_id: 'other', track_overlay_color_key: 'lime' }];
    const c = selectReferenceCandidates(reg(['x', 's-x']), { currentUserDogs: foreign, ownerUserId: USER, currentDogId: 'yam' });
    expect(c).toEqual([]);
  });
});

describe('Migrations-Contract', () => {
  const sql = fs.readFileSync('supabase/migrations/20261005120000_dogs_track_overlay_color_key.sql', 'utf8');
  it('SQL-CHECK-Werte = Client-Palette (keine erfundenen, keine fehlenden Keys)', () => {
    const m = sql.match(/track_overlay_color_key in \(([\s\S]*?)\)/);
    const values = Array.from(m![1].matchAll(/'([a-z]+)'/g)).map(x => x[1]).sort();
    expect(values).toEqual([...TRACK_OVERLAY_COLOR_KEYS].sort());
  });
  it('additiv, nullable, ohne Default/Backfill, keine neue Policy, kein ENUM', () => {
    expect(sql).toMatch(/add column if not exists track_overlay_color_key text;/);
    expect(sql).toMatch(/track_overlay_color_key is null/);
    const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');   // ohne Kommentare
    expect(code).not.toMatch(/\bdefault\b|update public\.dogs|create policy|create type|drop column/i);
  });
});
