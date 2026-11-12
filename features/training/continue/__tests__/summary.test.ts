import { daysSince, summarizeTraining, type SummaryUnit } from '../summary';
import { lastTrainingText, relativeDays } from '../labels';
import type { ServerFocus } from '@/services/trainingDocumentService';

const today = new Date(2026, 10, 9, 15, 0); // 9. Nov. 2026, lokal
const unit = (id: string, date: string, exercises: Partial<SummaryUnit['exercises'] extends (infer E)[] | undefined ? E : never>[] = [], patch: Partial<SummaryUnit> = {}): SummaryUnit => ({
  id, owner_id: 'o', dog_id: 'd', session_date: date, created_at: `${date}T10:00:00Z`, status: 'completed',
  started_at: null, ended_at: null, duration_sec: null, rating: null, score: null, notes: null, photos: [], videos: [], audio_files: [],
  motivation: null, konzentration: null, praezision: null, ausdauer: null, trieblage: null, impulskontrolle: null, shared_with_trainer: false,
  exercises: exercises.map((e, i) => ({ discipline: 'Unterordnung', exercise_name: `Ü${i}`, rating: null, notes: null, duration_sec: null, seq_index: i, ...e })),
  ...patch,
} as SummaryUnit);
const focus = (text: string, date: string, status: ServerFocus['status'] = 'open'): ServerFocus => ({
  id: text, owner_id: 'o', dog_id: 'd', discipline_key: 'system:unterordnung', exercise_identity_id: null, source_unit_id: null,
  source_unit_snapshot_id: 'u', source_date_snapshot: date, exercise_name_snapshot: null, source_text_snapshot: text, text, status, revision: 1,
});

describe('Weitermachen – Zusammenfassung (T-184 Etappe 2)', () => {
  test('relative Tage: heute, gestern, vor 3 Tagen, nie negativ', () => {
    expect(daysSince('2026-11-09', today)).toBe(0);
    expect(daysSince('2026-11-08', today)).toBe(1);
    expect(daysSince('2026-11-06', today)).toBe(3);
    expect(daysSince('2026-11-12', today)).toBe(0);
  });

  test('letztes Training mit Sparte, Hinweis und 3 früheren', () => {
    const s = summarizeTraining([
      unit('a', '2026-11-01'), unit('b', '2026-11-06', [{}]), unit('c', '2026-11-03'), unit('d', '2026-11-02'), unit('e', '2026-10-30'),
    ], [focus('Ruhiger Abschluss', '2026-11-06'), focus('Erledigt', '2026-11-07', 'done')], today);
    expect(s.last).toMatchObject({ id: 'b', daysAgo: 3, disciplines: ['Unterordnung'] });
    expect(s.previous.map(p => p.id)).toEqual(['c', 'd', 'a']);
    expect(s.openHint).toEqual({ id: expect.any(String), text: 'Ruhiger Abschluss', date: '2026-11-06' });
  });

  test('kein Training → kein letztes Training, kein Absturz', () => {
    expect(summarizeTraining([], [], today)).toEqual({ last: null, previous: [], openHint: null });
  });

  test('ältere Legacy-Session zählt als letztes Training', () => {
    const s = summarizeTraining([unit('legacy', '2026-11-07', [{ discipline: 'IGP' }], { source: 'session', status: 'active' as never })], [], today);
    expect(s.last).toMatchObject({ id: 'legacy', source: 'session', disciplines: ['IGP'], daysAgo: 2 });
  });

  test('Lernstufe mit Trend nur über Identität; alte Sterne ohne Trend', () => {
    const s = summarizeTraining([
      unit('new', '2026-11-08', [
        { exercise_identity_id: 'sitz', rating: 4, rating_scale: 'lernstufe' },
        { exercise_identity_id: 'platz', rating: 4 },
        { exercise_name: 'gleicher Name', rating: 5, rating_scale: 'lernstufe' },
      ]),
      unit('old', '2026-11-01', [
        { exercise_identity_id: 'sitz', rating: 2, rating_scale: 'lernstufe' },
        { exercise_name: 'gleicher Name', rating: 1, rating_scale: 'lernstufe' },
      ]),
    ], [], today);
    expect(s.last!.exercises).toEqual([
      { name: 'Ü0', discipline: 'Unterordnung', level: 'festigen', legacyStars: null, trend: 'up' },
      { name: 'Ü1', discipline: 'Unterordnung', level: null, legacyStars: 4, trend: null },
      { name: 'gleicher Name', discipline: 'Unterordnung', level: 'sitzt', legacyStars: null, trend: null },
    ]);
  });
});

describe('Kartentexte (T-184 Etappe 2)', () => {
  const t = (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k);
  test('heute / gestern / vor X Tagen und Kartenzeile', () => {
    expect(relativeDays(t, 0)).toBe('continueTraining.today');
    expect(relativeDays(t, 1)).toBe('continueTraining.yesterday');
    expect(relativeDays(t, 3)).toBe('continueTraining.daysAgo:{"count":3}');
    expect(lastTrainingText(t, 3, ['Unterordnung'])).toBe('continueTraining.lastLine:{"when":"continueTraining.daysAgo:{\\"count\\":3}","discipline":"Unterordnung"}');
  });
});

describe('Randfälle aus dem Review (T-184 Etappe 2)', () => {
  test('ungültiges Datum ergibt keinen NaN-Wert', () => {
    expect(daysSince('kaputt', today)).toBeNull();
  });
  test('Session mit Zeitanteil wird nach Kalendertag einsortiert', () => {
    const s = summarizeTraining([
      unit('legacy', '2026-11-08T23:30:00Z', [], { source: 'session' }),
      unit('neu', '2026-11-08', [], { created_at: '2026-11-08T23:59:59Z' }),
    ], [], today);
    expect(s.last!.id).toBe('neu');
  });
  test('mehrdeutige Identität im Vorgänger ergibt keinen Trend', () => {
    const s = summarizeTraining([
      unit('new', '2026-11-08', [{ exercise_identity_id: 'sitz', rating: 4, rating_scale: 'lernstufe' }]),
      unit('mid', '2026-11-05', [{ exercise_identity_id: 'sitz', rating: 2, rating_scale: 'lernstufe' }, { exercise_identity_id: 'sitz', rating: 5, rating_scale: 'lernstufe' }]),
      unit('old', '2026-11-01', [{ exercise_identity_id: 'sitz', rating: 1, rating_scale: 'lernstufe' }]),
    ], [], today);
    expect(s.last!.exercises[0].trend).toBeNull();
  });
  test('nur offene/geübte Hinweise, gleicher Tag nach Revision', () => {
    const a = { ...focus('A', '2026-11-06'), revision: 1 };
    const b = { ...focus('B', '2026-11-06', 'practice'), revision: 3 };
    const other = { ...focus('C', '2026-11-07'), status: 'archived' as never };
    expect(summarizeTraining([], [a, b, other], today).openHint?.text).toBe('B');
  });
});

describe('Allgemeines Training als letztes Training (T-184)', () => {
  test('ein Training nur mit „Allgemeines Training“ erscheint als letztes Training mit Sparte', () => {
    const s = summarizeTraining([unit('alt', '2026-11-01', [{ exercise_name: 'Sitz' }]), unit('nur-allg', '2026-11-08', [{ exercise_name: 'Allgemeines Training' }])], [], today);
    expect(s.last).toMatchObject({ id: 'nur-allg', disciplines: ['Unterordnung'] });
    expect(s.last!.exercises.map(e => e.name)).toEqual(['Allgemeines Training']);
  });
});
