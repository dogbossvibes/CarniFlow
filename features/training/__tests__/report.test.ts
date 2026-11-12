import { readFileSync } from 'fs';
import type { FeedItem } from '@/services/trainingFeed';
import { averageRating, buildReportModel, itemContent, itemRating, toWinAnsi, type ReportLabels } from '@/features/training/report';
import { renderReportPdf, renderReportPdfBase64, wrapText } from '@/features/training/reportPdf';
import { asciiToBase64, textWidth } from '@/features/training/pdfWriter';

const labels: ReportLabels = {
  title: 'Trainingsbericht Yam',
  colDate: 'Datum', colDiscipline: 'Sparte', colDuration: 'Dauer', colRating: 'Note', colContent: 'Inhalt',
  statTrainings: 'Trainings', statTime: 'Trainingszeit', statDisciplines: 'Sparten', statAvgRating: 'Ø Note',
  minutes: (m) => `${m} Min.`,
  footerCreated: 'Erstellt mit ANYVO am 13.11.2026',
  page: (n, t) => `Seite ${n} von ${t}`,
};

const item = (o: Partial<FeedItem> & { id: string; session_date: string }): FeedItem => ({
  owner_id: 'u', dog_id: 'd1', started_at: null, ended_at: null, duration_sec: null, rating: null, score: null,
  notes: null, photos: [], videos: [], audio_files: [], motivation: null, konzentration: null, praezision: null,
  ausdauer: null, trieblage: null, impulskontrolle: null, shared_with_trainer: false, status: 'completed',
  created_at: o.session_date, exercises: [], source: 'unit', dog: { name: 'Yam' }, ...o,
} as unknown as FeedItem);

const sample: FeedItem[] = [
  item({ id: 'a', session_date: '2026-11-11', duration_sec: 1500, rating: 4, notes: 'Abrufen besser 🐕 → weiter so',
    exercises: [{ discipline: 'Unterordnung', exercise_name: 'Fuss' }, { discipline: 'Unterordnung', exercise_name: 'Abrufen' }] as never }),
  item({ id: 'b', session_date: '2026-11-13', duration_sec: 2700, source: 'track', distance_meters: 380.4,
    exercises: [{ discipline: 'Fährte', exercise_name: 'Fährte' }] as never }),
  item({ id: 'c', session_date: '2026-10-14', score: 8, exercises: [{ discipline: 'Obedience', exercise_name: 'Box' }] as never }),
];

describe('Trainingsbericht — Aufbereitung', () => {
  it('entfernt nicht darstellbare Zeichen, behält Umlaute und Akzente', () => {
    expect(toWinAnsi('Fährte — Größe «ça» è 🐕 → ok')).toBe('Fährte — Größe «ça» è -> ok');
    expect(toWinAnsi('Zeile1\nZeile2\tx')).toBe('Zeile1 Zeile2 x');
    expect(toWinAnsi(null)).toBe('');
  });

  it('Note: Sterne vor Score, sonst Strich', () => {
    expect(itemRating(sample[0])).toBe('4/5');
    expect(itemRating(sample[2])).toBe('8/10');
    expect(itemRating(sample[1])).toBe('–');
  });

  it('Inhalt: Übungen, Fährtenlänge und optional der Hundename', () => {
    expect(itemContent(sample[0], false)).toBe('Fuss, Abrufen');
    expect(itemContent(sample[1], false)).toBe('380 m');
    expect(itemContent(sample[1], true)).toBe('Yam · 380 m');
  });

  it('Durchschnitt nur aus Sternebewertungen', () => {
    expect(averageRating(sample)).toBe(4);
    expect(averageRating([sample[1]])).toBeNull();
  });

  it('Modell: neueste zuerst, Zeitraum aus den Einträgen, Kennzahlen stimmen', () => {
    const m = buildReportModel(sample, { includeNotes: true, withDogName: false, labels });
    expect(m.rows.map(r => r.date)).toEqual(['13.11.2026', '11.11.2026', '14.10.2026']);
    expect(m.range).toBe('14.10.2026 – 13.11.2026');
    expect(m.stats.map(s => s.value)).toEqual(['3', '1 h 10', '3', '4.0']);
    expect(m.rows[1].note).toBe('Abrufen besser -> weiter so');
    expect(m.rows[0].duration).toBe('45 Min.');
    expect(m.rows[2].duration).toBe('–');
  });

  it('ohne Notizen enthält keine Zeile eine Notiz', () => {
    const m = buildReportModel(sample, { includeNotes: false, withDogName: false, labels });
    expect(m.rows.every(r => r.note === null)).toBe(true);
  });

  it('verändert die übergebenen Einträge nicht', () => {
    const before = JSON.stringify(sample);
    buildReportModel(sample, { includeNotes: true, withDogName: true, labels });
    expect(JSON.stringify(sample)).toBe(before);
  });
});

// Prüft die Dateistruktur ohne PDF-Bibliothek: Kopf, Seitenzahl und dass jeder
// xref-Eintrag exakt auf den Anfang seines Objekts zeigt (sonst ist die Datei defekt).
function inspectPdf(pdf: string) {
  expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
  expect(pdf.endsWith('%%EOF\n')).toBe(true);
  expect(/^[\x00-\x7f]*$/.test(pdf)).toBe(true);
  const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)?.[1]);
  expect(pdf.slice(startxref, startxref + 5)).toBe('xref\n');
  const entries = pdf.slice(startxref).split('\n').filter(l => /^\d{10} 00000 n $/.test(l));
  entries.forEach((line, i) => {
    const offset = Number(line.slice(0, 10));
    expect(pdf.slice(offset, offset + `${i + 1} 0 obj\n`.length)).toBe(`${i + 1} 0 obj\n`);
  });
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = (m.index ?? 0) + m[0].length;
    expect(pdf.slice(start + Number(m[1]), start + Number(m[1]) + 11)).toBe('\nendstream\n');
  }
  return { pages: (pdf.match(/\/Type \/Page /g) ?? []).length, objects: entries.length };
}

describe('Trainingsbericht — PDF', () => {
  it('erzeugt eine strukturell gültige Datei, auch mit Emojis und Sonderzeichen in Notizen', () => {
    const m = buildReportModel(sample, { includeNotes: true, withDogName: true, labels });
    const pdf = renderReportPdf(m).build({ title: m.title });
    expect(inspectPdf(pdf).pages).toBe(1);
    expect(pdf).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
    // „Fährte" steht als WinAnsi-Hex im Inhalt (ä = e4), Emojis kommen nicht vor.
    expect(pdf).toContain('<46e468727465>');
    const base64 = renderReportPdfBase64(m);
    expect(Buffer.from(base64, 'base64').toString('latin1')).toBe(pdf);
  });

  it('bricht viele Einträge auf mehrere Seiten um und kommt mit überlangen Notizen zurecht', () => {
    const many = Array.from({ length: 120 }, (_, i) => item({
      id: `x${i}`, session_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      duration_sec: 1200, rating: (i % 5) + 1,
      notes: i === 3 ? 'Wort '.repeat(3000) : i % 7 === 0 ? 'x'.repeat(400) : 'Kurze Notiz zur Einheit.',
      exercises: [{ discipline: 'Unterordnung', exercise_name: `Übung ${i}` }] as never,
    }));
    const writer = renderReportPdf(buildReportModel(many, { includeNotes: true, withDogName: false, labels }));
    const info = inspectPdf(writer.build());
    expect(info.pages).toBeGreaterThan(2);
    expect(info.pages).toBeLessThan(20);
    expect(info.pages).toBe(writer.pageCount);
  });

  it('leerer Bericht erzeugt trotzdem eine gültige Datei mit einer Seite', () => {
    const writer = renderReportPdf(buildReportModel([], { includeNotes: true, withDogName: false, labels }));
    expect(inspectPdf(writer.build()).pages).toBe(1);
  });

  it('Textbreite und Umbruch nutzen die Schriftmetrik', () => {
    expect(textWidth('ANYVO', 10, 'bold')).toBeCloseTo(35.56, 2);
    expect(textWidth('🐕', 10)).toBe(0);
    const lines = wrapText('eins zwei drei vier fünf sechs sieben acht', 9, 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every(l => textWidth(l, 9) <= 60)).toBe(true);
    expect(lines.join(' ')).toBe('eins zwei drei vier fünf sechs sieben acht');
  });

  it('Base64 stimmt mit der Referenz überein (alle Restlängen)', () => {
    for (const s of ['', 'a', 'ab', 'abc', 'abcd', '%PDF-1.4\n']) {
      expect(asciiToBase64(s)).toBe(Buffer.from(s, 'latin1').toString('base64'));
    }
  });
});

describe('Trainingsbericht — Verdrahtung', () => {
  it('Tagebuch berichtet über den ganzen Filter und schreibt nichts', () => {
    const screen = readFileSync('app/training-journal.tsx', 'utf8');
    expect(screen).toContain('const model = buildReportModel(filtered, {');
    // Keine neue Abhängigkeit: sonst wertet die Release-Prüfung die Änderung als nativen Build.
    // pdf-lib ist auf der iOS-60-Linie bereits vorhanden (Fährtenbericht); der
    // Trainingsbericht nutzt es trotzdem nicht, sondern den eigenen Writer.
    for (const file of ['features/training/report.ts', 'features/training/reportPdf.ts', 'features/training/pdfWriter.ts', 'services/reportShare.ts']) {
      expect(readFileSync(file, 'utf8')).not.toContain('pdf-lib');
    }
    const share = readFileSync('services/reportShare.ts', 'utf8');
    expect(share).not.toMatch(/supabase|deleteAsync|upload/i);
    expect(share).toContain('FileSystem.cacheDirectory');
  });
});
