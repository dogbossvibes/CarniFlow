import { buildMatrix, MATRIX_COLUMNS } from '../matrix';
import type { SummaryUnit } from '../summary';

const today = new Date(2026, 10, 10, 12, 0);
type Ex = NonNullable<SummaryUnit['exercises']>[number];
const ex = (patch: Partial<Ex>): Ex => ({ discipline: 'Unterordnung', exercise_name: 'Sitz', rating: null, notes: null, duration_sec: null, seq_index: 0, ...patch });
const unit = (id: string, date: string, exercises: Ex[], patch: Partial<SummaryUnit> = {}): SummaryUnit => ({
  id, owner_id: 'o', dog_id: 'd', session_date: date, created_at: `${date}T10:00:00Z`, status: 'completed', started_at: null, ended_at: null,
  duration_sec: 600, rating: null, score: null, notes: null, photos: [], videos: [], audio_files: [], motivation: null, konzentration: null,
  praezision: null, ausdauer: null, trieblage: null, impulskontrolle: null, shared_with_trainer: false, exercises, ...patch,
} as SummaryUnit);
const lvl = (rating: number, patch: Partial<Ex> = {}) => ex({ exercise_identity_id: 'sitz', rating, rating_scale: 'lernstufe', ...patch });

describe('Übungs-Matrix (T-184 Etappe 3)', () => {
  test('Spalten = letzte 6 Trainings der Sparte, alt → neu', () => {
    const units = Array.from({ length: 8 }, (_, i) => unit(`u${i}`, `2026-10-0${i + 1}`, [lvl(2)]));
    const m = buildMatrix(units, 'Unterordnung', today);
    expect(m.columns).toHaveLength(MATRIX_COLUMNS);
    expect(m.columns.map(c => c.unitId)).toEqual(['u2', 'u3', 'u4', 'u5', 'u6', 'u7']);
  });

  test('Rückschritt ↓, alte Sterne neutral, nicht trainiert leer', () => {
    const m = buildMatrix([
      unit('a', '2026-11-01', [lvl(4), ex({ exercise_name: 'Platz', rating: 4 })]),
      unit('b', '2026-11-05', [lvl(2)]),
    ], 'Unterordnung', today);
    const sitz = m.rows.find(r => r.name === 'Sitz')!;
    expect(sitz.cells).toEqual([{ kind: 'level', level: 'festigen', down: false }, { kind: 'level', level: 'lernen', down: true }]);
    const platz = m.rows.find(r => r.name === 'Platz')!;
    expect(platz.cells).toEqual([{ kind: 'legacy', stars: 4 }, { kind: 'none' }]);
  });

  test('Rückschritt gegenüber Training ausserhalb der sichtbaren Spalten', () => {
    const units = [unit('old', '2026-09-01', [lvl(5)]), ...Array.from({ length: 6 }, (_, i) => unit(`n${i}`, `2026-10-1${i}`, i === 0 ? [lvl(4)] : [ex({ exercise_name: 'Platz' })]))];
    const sitz = buildMatrix(units, null, today).rows.find(r => r.name === 'Sitz')!;
    expect(sitz.cells[0]).toEqual({ kind: 'level', level: 'festigen', down: true });
  });

  test('Rückfall-Hinweis nur bei ↓ und ≥ 7 Tagen Pause', () => {
    const ruht = buildMatrix([unit('a', '2026-10-20', [lvl(4)]), unit('b', '2026-11-01', [lvl(2)])], null, today);
    expect(ruht.fallback).toEqual({ name: 'Sitz', days: 9 });
    const frisch = buildMatrix([unit('a', '2026-11-01', [lvl(4)]), unit('b', '2026-11-08', [lvl(2)])], null, today);
    expect(frisch.fallback).toBeNull();
  });

  test('Einträge ohne Identität nie mit identitätsgebundenen Zeilen zusammengelegt', () => {
    const m = buildMatrix([unit('a', '2026-11-01', [lvl(2), ex({ exercise_name: 'Sitz', rating: 3 })])], null, today);
    expect(m.rows).toHaveLength(2);
  });

  test('Tab „Alle“: Sparten nach letzter Nutzung, Liste neu → alt; keine Trainings', () => {
    const units = [unit('a', '2026-11-01', [ex({ discipline: 'IGP', exercise_name: 'Revier' })]), unit('b', '2026-11-05', [lvl(4)])];
    const m = buildMatrix(units, null, today);
    expect(m.disciplines).toEqual(['Unterordnung', 'IGP']);
    expect(m.trainings.map(t => t.id)).toEqual(['b', 'a']);
    expect(m.columns).toHaveLength(2);
    expect(m.rows.map(r => r.name).sort()).toEqual(['Revier', 'Sitz']);
    expect(buildMatrix(units, 'Unterordnung', today).rows.map(r => r.name)).toEqual(['Sitz']);
    expect(buildMatrix([], null, today)).toMatchObject({ columns: [], rows: [], fallback: null, trainings: [] });
  });

  test('Trend nie über den Namen; doppelte Übung im Training = mehrdeutig (kein ↓)', () => {
    const byName = buildMatrix([
      unit('a', '2026-11-01', [ex({ exercise_name: 'Platz', rating: 4, rating_scale: 'lernstufe' })]),
      unit('b', '2026-11-02', [ex({ exercise_name: 'Platz', rating: 2, rating_scale: 'lernstufe' })]),
    ], null, today);
    expect(byName.rows[0].cells[1]).toEqual({ kind: 'level', level: 'lernen', down: false });
    expect(byName.fallback).toBeNull();
    const dup = buildMatrix([
      unit('a', '2026-10-01', [lvl(5)]),
      unit('b', '2026-10-02', [lvl(4), lvl(2, { seq_index: 1 })]),
      unit('c', '2026-10-03', [lvl(1)]),
    ], null, today);
    const sitz = dup.rows.find(r => r.name === 'Sitz')!;
    expect(sitz.cells.map(c => c.kind === 'level' && c.down)).toEqual([false, false, false]);
    expect(dup.fallback).toBeNull();
  });

  test('alte Einträge ohne Übungen bleiben in der Liste „Alle“, nicht als Matrix-Spalte', () => {
    const m = buildMatrix([unit('s', '2026-10-01', [], { source: 'session', status: 'x' as never }), unit('a', '2026-11-01', [lvl(2)])], null, today);
    expect(m.trainings.map(t => t.id)).toEqual(['a', 's']);
    expect(m.columns.map(c => c.unitId)).toEqual(['a']);
    expect(buildMatrix([unit('s', '2026-10-01', [], { source: 'session' })], 'Unterordnung', today).trainings).toEqual([]);
  });
});
