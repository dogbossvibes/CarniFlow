import { validSessionRating } from '@/features/tracking/utils/sessionRating';

describe('validSessionRating — nur gültiges 1–5 durchlassen (training_sessions_rating_check)', () => {
  it('Fährten-Prozentscores (0–100) → null (kein Constraint-Verstoß)', () => {
    for (const v of [83, 95, 100, 6, 7, 42]) expect(validSessionRating(v)).toBeNull();
  });
  it('gültige 1–5-Ratings → durchgereicht', () => {
    for (const v of [1, 2, 3, 4, 5]) expect(validSessionRating(v)).toBe(v);
  });
  it('0 / negativ / NaN / null / undefined → null', () => {
    expect(validSessionRating(0)).toBeNull();
    expect(validSessionRating(-1)).toBeNull();
    expect(validSessionRating(NaN)).toBeNull();
    expect(validSessionRating(null)).toBeNull();
    expect(validSessionRating(undefined)).toBeNull();
  });
});
