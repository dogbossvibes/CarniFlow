import { validSessionRating } from '@/features/tracking/utils/sessionRating';
import { evalSupplementFromPayload, overlayLocalEval } from '@/features/tracking/utils/localTrackDetail';
import { legsFromSession, overallScore } from '@/features/tracking/utils/trackEvaluation';

// ──────────────────────────────────────────────────────────────────────────
// PHASE C — Bewertung Save/Reload. Root Causes:
//  (1) 0–100-Score darf nicht in training_sessions.rating (1–5-Constraint) → Sync-Fail.
//  (2) Reload-Merge: eine NEUERE lokale Bewertung darf nicht durch stale/leere Remote
//      überschrieben werden (sonst Default/100 %).
// ──────────────────────────────────────────────────────────────────────────

const legs95 = [
  { name: 'Ausarbeitung Abschnitt 1', score: 10, max: 10 },
  { name: '1. Winkel', score: 9, max: 10 },
];
const legsMixed = [
  { name: 'Ausarbeitung Abschnitt 1', score: 5, max: 10 },
  { name: '1. Winkel', score: 5, max: 10 },
];

describe('validSessionRating — 0–100-Score nie in rating (1–5)', () => {
  it('Fährten-Scores → null', () => { for (const v of [83, 95, 100, 6]) expect(validSessionRating(v)).toBeNull(); });
  it('gültige 1–5 → durchgereicht', () => { for (const v of [1, 3, 5]) expect(validSessionRating(v)).toBe(v); });
  it('0/neg/NaN/null → null', () => { for (const v of [0, -1, NaN, null, undefined]) expect(validSessionRating(v as any)).toBeNull(); });
});

describe('evalSupplementFromPayload — lokale Bewertung aus payload_json', () => {
  it('mit legs+score+evaluated_at → Supplement', () => {
    const s = evalSupplementFromPayload(JSON.stringify({ score: 95, legs: legs95, evaluated_at: '2026-08-23T15:00:00Z' }), 95, 'note');
    expect(s).toEqual({ legs: legs95, score: 95, notes: 'note', evaluatedAt: '2026-08-23T15:00:00Z' });
  });
  it('ohne Bewertung → null (verdrängt Remote nicht)', () => {
    expect(evalSupplementFromPayload(JSON.stringify({ distanceMeters: 280 }), null, null)).toBeNull();
    expect(evalSupplementFromPayload(null, null, null)).toBeNull();
  });
});

describe('overlayLocalEval — local-first Priorität', () => {
  it('Remote ohne legs + lokale Bewertung → lokale legs/score übernommen', () => {
    const remote = { id: 's1', notes: null, score: null, track_data: {} };
    const local = { legs: legs95, score: 95, notes: 'x', evaluatedAt: '2026-08-23T15:00:00Z' };
    const merged = overlayLocalEval(remote, local);
    expect(merged.track_data.legs).toEqual(legs95);
    expect(merged.track_data.score).toBe(95);
    expect(legsFromSession(merged.track_data, 1, 0)).toEqual(legs95);   // Reload zeigt gespeicherte legs
  });

  it('lokale Bewertung NEUER als remote → überschreibt (kein Rückfall auf Default)', () => {
    const remote = { id: 's1', notes: null, score: 100, track_data: { legs: [{ name: 'x', score: 10, max: 10 }], score: 100, evaluated_at: '2026-08-23T14:00:00Z' } };
    const local = { legs: legsMixed, score: 50, notes: null, evaluatedAt: '2026-08-23T15:00:00Z' };
    const merged = overlayLocalEval(remote, local);
    expect(merged.track_data.legs).toEqual(legsMixed);
    expect(overallScore(legsFromSession(merged.track_data, 1, 0))).toBe(50);
  });

  it('remote NEUER als lokal → remote bleibt (kein Rückschritt)', () => {
    const remote = { id: 's1', notes: null, score: 90, track_data: { legs: legs95, score: 90, evaluated_at: '2026-08-23T16:00:00Z' } };
    const local = { legs: legsMixed, score: 50, notes: null, evaluatedAt: '2026-08-23T15:00:00Z' };
    const merged = overlayLocalEval(remote, local);
    expect(merged.track_data.legs).toEqual(legs95);
  });

  it('kein lokales Supplement → remote unverändert', () => {
    const remote = { id: 's1', track_data: { legs: legs95 } };
    expect(overlayLocalEval(remote, null)).toBe(remote);
  });

  it('Fall 1: 100 % → 95 %, reload behält 95 %', () => {
    const remote = { id: 's1', track_data: {} };   // remote noch ohne Bewertung
    const local = { legs: legs95, score: 95, notes: null, evaluatedAt: '2026-08-23T15:00:00Z' };
    const merged = overlayLocalEval(remote, local);
    expect(overallScore(legsFromSession(merged.track_data, 1, 0))).toBe(95);
  });
});
