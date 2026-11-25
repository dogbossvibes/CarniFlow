import { EXAM_TYPES, examDisplayName, examTypeByKey, fci100Rating } from '../catalog';
import {
  buildExam, examProgress, normalizeSections, parseExam, sectionSeries, sectionsFromTemplate, suggestFromSections,
  sumSections, validateExam, visibleExams, type ExamInput, type ExamResult,
} from '../model';

const input = (over: Partial<ExamInput> = {}): ExamInput => ({
  dog_id: 'dog-1', exam_date: '2027-04-12', location: ' Hinterberg ', club: null, judge: 'Richter A',
  exam_type: 'igp', exam_type_label: null, exam_level: '2',
  sections: [
    { key: 'A', label: 'Fährte', points: 92, maxPoints: 100 },
    { key: 'B', label: 'Unterordnung', points: 85, maxPoints: 100 },
    { key: 'C', label: 'Schutzdienst', points: 88, maxPoints: 100 },
  ],
  total_points: null, max_points: null, rating: 'SG', passed: true, placement: null, notes: '  ', ...over,
});
const exam = (id: string, over: Partial<ExamInput> = {}, deleted = false): ExamResult => ({
  ...buildExam(input(over), { id, ownerId: 'owner' }, `${over.exam_date ?? '2027-04-12'}T10:00:00.000Z`),
  deleted_at: deleted ? '2027-05-01T00:00:00.000Z' : null,
});

describe('Katalog', () => {
  it('hat eindeutige, DB-taugliche Schlüssel', () => {
    const keys = EXAM_TYPES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z0-9_]{1,30}$/);
  });
  it('IGP hat die Abteilungen A/B/C mit je 100 Punkten', () => {
    expect(examTypeByKey('igp')!.sections.map(s => `${s.key}${s.maxPoints}`)).toEqual(['A100', 'B100', 'C100']);
  });
  it('FCI-Skala für 100 Punkte', () => {
    expect([100, 96, 95, 90, 89, 80, 79, 70, 69, 36, 35, 0].map(fci100Rating))
      .toEqual(['V', 'V', 'SG', 'SG', 'G', 'G', 'B', 'B', 'M', 'M', 'U', 'U']);
  });
  it('Anzeigename auch für unbekannte und freie Arten', () => {
    expect(examDisplayName('igp', '2')).toBe('IGP 2');
    expect(examDisplayName('other', null, 'Rettungshund')).toBe('Rettungshund');
    expect(examDisplayName('zukunft', 'x')).toBe('zukunft x');
  });
});

describe('Abteilungen und Summen', () => {
  it('Vorlage liefert leere Abteilungen', () => {
    expect(sectionsFromTemplate('igp').every(s => s.points === null)).toBe(true);
    expect(sectionsFromTemplate('gibtsnicht')).toHaveLength(1);
  });
  it('liest fremde/kaputte Formate robust', () => {
    expect(normalizeSections(null)).toEqual([]);
    expect(normalizeSections([{ key: 'A', points: -5, maxPoints: 'x' }, 3, { label: 'ohne key' }]))
      .toEqual([{ key: 'A', label: 'A', points: null, maxPoints: null, passed: null }]);
  });
  it('summiert und kennt das Maximum nur, wenn alle Abteilungen eines haben', () => {
    expect(sumSections(input().sections)).toEqual({ total: 265, max: 300 });
    expect(sumSections([{ key: 'T', label: 'G', points: 12.5, maxPoints: null }])).toEqual({ total: 12.5, max: null });
    expect(sumSections([])).toEqual({ total: null, max: null });
  });
  it('schlägt bestanden vor, wenn jede Abteilung ≥ 70 hat', () => {
    expect(suggestFromSections('igp', input().sections).passed).toBe(true);
    const failed = input().sections.map(s => s.key === 'B' ? { ...s, points: 69 } : s);
    expect(suggestFromSections('igp', failed).passed).toBe(false);
    expect(suggestFromSections('ifh', [{ key: 'A', label: 'Fährte', points: 97, maxPoints: 100 }]).rating).toBe('V');
  });
  it('BH: bestanden aus den Teilen', () => {
    const parts = [{ key: 'A', label: 'UO', points: null, maxPoints: null, passed: true }, { key: 'B', label: 'VT', points: null, maxPoints: null, passed: false }];
    expect(suggestFromSections('bh', parts).passed).toBe(false);
  });
});

describe('Plausibilität', () => {
  it('meldet fehlenden Hund, falsches Datum, Punkte über Max', () => {
    expect(validateExam(input())).toEqual([]);
    expect(validateExam(input({ dog_id: '' }))).toContain('dog');
    expect(validateExam(input({ exam_date: '2027-02-30' }))).toContain('date');
    expect(validateExam(input({ exam_type: 'IGP!' }))).toContain('type');
    expect(validateExam(input({ sections: [{ key: 'A', label: 'A', points: 101, maxPoints: 100 }] }))).toContain('points_over_max');
  });
});

describe('Eintrag bauen und lesen', () => {
  it('bereinigt Texte, summiert Gesamt, behält Erstellzeit beim Bearbeiten', () => {
    const first = buildExam(input(), { id: 'e1', ownerId: 'owner' }, '2027-04-12T10:00:00.000Z');
    expect(first).toMatchObject({ location: 'Hinterberg', notes: null, total_points: 265, max_points: 300, client_local_id: 'e1' });
    const edited = buildExam(input({ total_points: 260 }), { id: 'e1', ownerId: 'owner' }, '2027-04-13T10:00:00.000Z', first);
    expect(edited.created_at).toBe(first.created_at);
    expect(edited.total_points).toBe(260);
  });
  it('liest Server- und Lokalformat, verwirft Unbrauchbares', () => {
    const e = exam('e1');
    expect(parseExam(JSON.parse(JSON.stringify(e)))).toEqual(e);
    expect(parseExam({ ...e, sections: JSON.stringify(e.sections), total_points: '265.00' })!.total_points).toBe(265);
    expect(parseExam({ id: 'x' })).toBeNull();
  });
});

describe('Übersicht', () => {
  const list = [
    exam('bh', { exam_type: 'bh', exam_level: 'bh', exam_date: '2026-05-20', sections: [] }),
    exam('igp1', { exam_level: '1', exam_date: '2026-10-03' }),
    exam('igp2', { exam_level: '2', exam_date: '2027-04-12' }),
    exam('igp3-fail', { exam_level: '3', exam_date: '2027-06-01', passed: false }),
    exam('weg', { exam_level: '3', exam_date: '2027-07-01' }, true),
  ];
  it('blendet entfernte Einträge aus, neueste zuerst', () => {
    expect(visibleExams(list).map(e => e.id)).toEqual(['igp3-fail', 'igp2', 'igp1', 'bh']);
  });
  it('höchste bestandene Stufe und nächste Stufe', () => {
    const igp = examProgress(list).find(p => p.typeKey === 'igp')!;
    expect(igp.highestPassed).toMatchObject({ levelKey: '2', date: '2027-04-12' });
    expect(igp.next).toEqual({ levelKey: '3', levelLabel: 'IGP 3' });
    expect(examProgress(list).find(p => p.typeKey === 'bh')!.next).toBeNull();
  });
  it('Punkteverlauf je Abteilung, ältester zuerst', () => {
    const series = sectionSeries(list, 'igp');
    expect(Object.keys(series).sort()).toEqual(['A', 'B', 'C']);
    expect(series.A.map(p => p.examId)).toEqual(['igp1', 'igp2', 'igp3-fail']);
  });
});
