import { mergeTrackHistory } from '@/features/tracking/utils/trackHistoryMerge';
import { trackScore } from '@/features/tracking/utils/trackScore';

// Read-Seite nach dem rating-Fix: der 0–100-Score muss aus track_data.score kommen,
// nicht mehr aus training_sessions.rating (das jetzt null/1–5 ist).
describe('mergeTrackHistory — Score aus track_data.score (nach rating-Fix)', () => {
  it('synced Fährte: rating null, track_data.score=95 → Zeile.score=95, trackScore=95', () => {
    const remote = [{ id: 's1', rating: null, track_data: { score: 95, legs: [] } }];
    const [row] = mergeTrackHistory(remote, []);
    expect(row.score).toBe(95);
    expect(trackScore(row)).toBe(95);
  });

  it('Altdaten: rating 88 (0–100) ohne track_data.score → Fallback via trackScore(rating)', () => {
    const remote = [{ id: 's2', rating: 88, track_data: null }];
    const [row] = mergeTrackHistory(remote, []);
    expect(row.score).toBeNull();          // kein track_data.score
    expect(trackScore(row)).toBe(88);      // trackScore fällt auf rating zurück (0–100 durchgereicht)
  });

  it('kein Score irgendwo → trackScore null (Anzeige „—")', () => {
    const remote = [{ id: 's3', rating: null, track_data: null }];
    const [row] = mergeTrackHistory(remote, []);
    expect(trackScore(row)).toBeNull();
  });
});
