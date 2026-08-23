import { stepTrackEnd, trackEndReason, DEFAULT_TRACK_END_OPTIONS, type TrackEndInput } from '@/features/tracking/utils/guidanceEngine';

// ──────────────────────────────────────────────────────────────────────────
// PHASE B — Fährtenende-Diagnose. `reason` ist additiv und benennt den Blocker.
// Der Trigger verlangt gleichzeitig: ratio≥0.97 UND geom≤3 UND openObjects≤0.
// ──────────────────────────────────────────────────────────────────────────

const base: TrackEndInput = { dogProgressM: 57, trackLengthM: 57, geomDistanceM: 0, openMandatoryObjects: 0 };

describe('trackEndReason — benennt den Blocker', () => {
  it('alle Kriterien erfüllt → triggered', () => {
    expect(trackEndReason(base, 'approaching')).toBe('triggered');
    expect(stepTrackEnd(base, 'approaching').justReached).toBe(true);
  });

  it('Fortschritt < 0.97 → progress_below_ratio (kein Trigger)', () => {
    const i = { ...base, dogProgressM: 54 };   // 54/57 = 0.947
    expect(trackEndReason(i, 'approaching')).toBe('progress_below_ratio');
    expect(stepTrackEnd(i, 'approaching').justReached).toBe(false);
  });

  it('geom > 3 m → geom_too_far (räumlich noch nicht am Endpunkt)', () => {
    const i = { ...base, geomDistanceM: 5 };
    expect(trackEndReason(i, 'approaching')).toBe('geom_too_far');
  });

  it('offener Pflicht-Gegenstand blockiert Ende NICHT (Default) → triggered_open_objects', () => {
    const i = { ...base, openMandatoryObjects: 1 };
    expect(trackEndReason(i, 'approaching')).toBe('triggered_open_objects');
    expect(stepTrackEnd(i, 'approaching').justReached).toBe(true);
  });

  it('opt-in openObjectsBlockEnd=true → open_objects blockiert', () => {
    const i = { ...base, openMandatoryObjects: 1 };
    const opts = { ...DEFAULT_TRACK_END_OPTIONS, openObjectsBlockEnd: true };
    expect(trackEndReason(i, 'approaching', opts)).toBe('open_objects');
    expect(stepTrackEnd(i, 'approaching', opts).justReached).toBe(false);
  });

  it('bereits completed → already_completed (once-only)', () => {
    expect(trackEndReason(base, 'completed')).toBe('already_completed');
    expect(stepTrackEnd(base, 'completed')).toEqual({ state: 'completed', justReached: false, reason: 'already_completed' });
  });

  it('keine Fährte → no_track', () => {
    expect(trackEndReason({ ...base, trackLengthM: 0 }, 'unseen')).toBe('no_track');
  });
});

describe('Field-typische Ende-Fälle', () => {
  it('Hund erreicht exakt Ende → trigger', () => {
    expect(stepTrackEnd(base, 'approaching').justReached).toBe(true);
  });

  it('Handler 8 m hinter Hund, Hund am Ende (clamp) → trigger', () => {
    // dogProgress clamped auf trackLength → geom 0, ratio 1.0
    expect(stepTrackEnd({ dogProgressM: 57, trackLengthM: 57, geomDistanceM: 0, openMandatoryObjects: 0 }, 'approaching').justReached).toBe(true);
  });

  it('10 m vorher → kein trigger', () => {
    const i = { dogProgressM: 47, trackLengthM: 57, geomDistanceM: 10, openMandatoryObjects: 0 };
    expect(stepTrackEnd(i, 'approaching').justReached).toBe(false);
  });

  it('frühere räumliche Nähe zum Ende (Strecke lief vorbei), aber order-aware progress niedrig → kein trigger', () => {
    // geom klein (räumlich nah), aber Hund erst bei 60 % → order-aware blockiert.
    const i = { dogProgressM: 34, trackLengthM: 57, geomDistanceM: 1.5, openMandatoryObjects: 0 };
    expect(trackEndReason(i, 'approaching')).toBe('progress_below_ratio');
    expect(stepTrackEnd(i, 'approaching').justReached).toBe(false);
  });

  it('offener Gegenstand am Ende blockiert nicht; verpasstes Objekt separat im Score (nicht hier)', () => {
    const open = { ...base, openMandatoryObjects: 1 };
    const r = stepTrackEnd(open, 'approaching');
    expect(r.justReached).toBe(true);
    expect(r.reason).toBe('triggered_open_objects');
  });

  it('premature-Schutz bleibt: offenes Objekt + Hund noch NICHT am Ende → kein Trigger (progress/geom)', () => {
    // Objekt offen, aber progress zu niedrig → weiterhin progress_below_ratio (geblockt).
    const i = { dogProgressM: 30, trackLengthM: 57, geomDistanceM: 8, openMandatoryObjects: 1 };
    expect(stepTrackEnd(i, 'approaching').justReached).toBe(false);
    expect(trackEndReason(i, 'approaching')).toBe('progress_below_ratio');
  });

  it('once-only: nach reached bleibt completed, justReached nur einmal', () => {
    const first = stepTrackEnd(base, 'approaching');
    expect(first).toMatchObject({ state: 'reached', justReached: true });
    const again = stepTrackEnd(base, first.state);
    expect(again).toMatchObject({ state: 'completed', justReached: false });
  });
});
