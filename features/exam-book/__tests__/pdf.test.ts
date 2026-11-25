import { buildExam, type ExamInput, type ExamResult } from '../model';
import { buildExamPdfModel, renderExamPdf, renderExamPdfBase64, truncateNoteLines, wrapNote, type ExamPdfLabels } from '../pdf';
import { safePdfFileName } from '../pdfShare';

jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-sharing', () => ({}));

const labels: ExamPdfLabels = {
  title: 'Prüfungsbuch', colDate: 'Datum', colExam: 'Prüfung', colPlace: 'Verein / Ort', colPoints: 'Punkte', colResult: 'Ergebnis',
  passed: 'bestanden', failed: 'nicht bestanden', judge: 'Richter', placement: 'Platz', progressTitle: 'Stand',
  passedLevel: l => `${l} bestanden`, nextLevel: l => `Nächste Stufe: ${l}`, noPassYet: 'Noch nicht bestanden',
  highestLevel: 'Höchste Stufe erreicht', empty: 'Noch keine Prüfungen erfasst.', footerCreated: 'Erstellt mit ANYVO',
  page: (n, total) => `Seite ${n} von ${total}`,
};
const input = (over: Partial<ExamInput>): ExamInput => ({
  dog_id: 'dog-1', exam_date: '2027-04-12', location: 'Hinterberg', club: 'SC Muster', judge: 'R. Richter',
  exam_type: 'igp', exam_type_label: null, exam_level: '2',
  sections: [{ key: 'A', label: 'Fährte', points: 92, maxPoints: 100 }, { key: 'B', label: 'Unterordnung', points: 85.5, maxPoints: 100 }],
  total_points: null, max_points: null, rating: 'SG', passed: true, placement: 3, notes: 'Wind 🌬️ stark', ...over,
});
const exam = (id: string, over: Partial<ExamInput> = {}, deleted = false): ExamResult => ({
  ...buildExam(input(over), { id, ownerId: 'owner' }, '2027-04-12T10:00:00.000Z'), deleted_at: deleted ? '2027-05-01T00:00:00.000Z' : null,
});
const model = (exams: ExamResult[]) => buildExamPdfModel({ exams, dogName: 'Luna', generated: 'Stand 25.11.2026', formatDate: d => d, labels });

describe('PDF-Modell', () => {
  it('ältester Eintrag zuerst, entfernte fehlen', () => {
    const m = model([exam('neu', { exam_date: '2027-04-12' }), exam('alt', { exam_date: '2026-10-03', exam_level: '1' }), exam('weg', {}, true)]);
    expect(m.rows.map(r => r.date)).toEqual(['2026-10-03', '2027-04-12']);
    expect(m.rows[0].exam).toBe('IGP 1');
  });
  it('Punkte, Abteilungen, Ergebnis, Richter, Platz', () => {
    const [row] = model([exam('e1')]).rows;
    expect(row).toMatchObject({
      place: 'SC Muster, Hinterberg', points: '177.5 / 200', result: 'SG · bestanden',
      sections: 'A Fährte 92/100 · B Unterordnung 85.5/100', details: 'Richter: R. Richter · Platz: 3',
    });
  });
  it('BH-Teile mit bestanden/nicht bestanden', () => {
    const [row] = model([exam('bh', { exam_type: 'bh', exam_level: 'bh', sections: [
      { key: 'A', label: 'Unterordnung', points: null, maxPoints: null, passed: true },
      { key: 'B', label: 'Verkehrsteil', points: null, maxPoints: null, passed: false },
    ], passed: false, rating: null })]).rows;
    expect(row.sections).toBe('A Unterordnung bestanden · B Verkehrsteil nicht bestanden');
    expect(row.result).toBe('nicht bestanden');
  });
  it('Fortschritt im Kopf', () => {
    expect(model([exam('e1')]).progress).toEqual(['IGP 2 bestanden · Nächste Stufe: IGP 3']);
  });
});

describe('PDF-Datei', () => {
  it('ist ein gültiges PDF, auch mit Emojis und Umlauten', () => {
    const raw = renderExamPdf(model([exam('e1')])).build({ title: 'x' });
    expect(raw.startsWith('%PDF-1.4')).toBe(true);
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(renderExamPdfBase64(model([exam('e1')]))).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
  it('bricht auf mehrere Seiten um und hält auch sehr lange Notizen aus', () => {
    const many = Array.from({ length: 40 }, (_, i) => exam(`e${i}`, { exam_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-10`, notes: 'lang '.repeat(i === 0 ? 3000 : 20) }));
    const pdf = renderExamPdf(model(many));
    expect(pdf.pageCount).toBeGreaterThan(1);
    expect(pdf.pageCount).toBeLessThan(40);
  });
  it('leeres Prüfungsbuch ergibt eine Seite mit Hinweis', () => {
    const pdf = renderExamPdf(model([]));
    expect(pdf.pageCount).toBe(1);
    expect(pdf.build()).toContain('%PDF');
  });
});

describe('Notiz mit Absätzen', () => {
  it('behält Zeilenumbrüche als eigene Zeilen, Leerzeile als Absatz', () => {
    expect(wrapNote('Wind stark\nBoden nass\n\n\nZweiter Absatz', 8, 400)).toEqual(['Wind stark', 'Boden nass', '', 'Zweiter Absatz']);
    expect(wrapNote('a\r\nb\rc', 8, 400)).toEqual(['a', 'b', 'c']);
    expect(wrapNote('\n\nnur Text\n\n', 8, 400)).toEqual(['nur Text']);
  });
  it('bricht jeden Absatz einzeln um', () => {
    const lines = wrapNote(`${'wort '.repeat(40)}\nkurz`, 8, 120);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines[lines.length - 1]).toBe('kurz');
  });
  it('Emojis fallen weg, Absatz bleibt', () => {
    expect(wrapNote('Super 🐕\nWeiter', 8, 400)).toEqual(['Super', 'Weiter']);
  });
  it('Kürzen behält Absätze und endet mit «…», ohne leere Zeile davor', () => {
    expect(truncateNoteLines(['a', 'b', '', 'c', 'd'], 4)).toEqual(['a', 'b', '…']);
    expect(truncateNoteLines(['a', 'b', 'c'], 3)).toEqual(['a', 'b', 'c']);
    expect(truncateNoteLines(['a', '', 'b', 'c'], 4)).toEqual(['a', '', 'b', 'c']);
  });
  it('PDF enthält die Absätze als getrennte Textzeilen', () => {
    const raw = renderExamPdf(model([exam('e1', { notes: 'Erste Zeile\nZweite Zeile' })])).build();
    const hex = (t: string) => `<${Array.from(t).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase()}>`;
    const hasHex = (t: string) => raw.toUpperCase().includes(hex(t).toUpperCase());
    expect(hasHex('Erste Zeile')).toBe(true);
    expect(hasHex('Zweite Zeile')).toBe(true);
    expect(hasHex('Erste Zeile Zweite Zeile')).toBe(false);
  });
});

describe('Dateiname', () => {
  it.each([
    ['ANYVO-Pruefungsbuch-Jäger', 'ANYVO-Pruefungsbuch-Jaeger'],
    ['Öli Über Groß', 'Oeli-Ueber-Gross'],
    ['Chérie à l\'île', 'Cherie-a-l-ile'],
    ['Jäger'.normalize('NFD'), 'Jaeger'],
    ['🐕', 'ANYVO-Pruefungsbuch'],
  ])('%s → %s', (input, out) => {
    expect(safePdfFileName(input)).toBe(out);
  });
});
