import { PdfWriter, asciiToBase64, textWidth, type PdfColor, type PdfFont } from '@/features/training/pdfWriter';
import { toWinAnsi } from '@/features/training/report';
import { wrapText } from '@/features/training/reportPdf';
import { examDisplayName } from './catalog';
import { examProgress, visibleExams, type ExamResult } from './model';

// Prüfungsbuch eines Hundes als A4-PDF (Spec 01-pruefungsbuch.md, PR C).
// Reines JavaScript über den bestehenden PDF-Schreiber (per OTA auslieferbar).
// Das PDF entsteht nur auf dem Gerät; es wird nichts hochgeladen.
// Entfernte Einträge (deleted_at) erscheinen nicht.

export interface ExamPdfLabels {
  title: string;              // «Prüfungsbuch»
  colDate: string; colExam: string; colPlace: string; colPoints: string; colResult: string;
  passed: string; failed: string;
  judge: string; placement: string;
  progressTitle: string;
  passedLevel: (level: string) => string;
  nextLevel: (level: string) => string;
  noPassYet: string;
  highestLevel: string;
  empty: string;
  footerCreated: string;
  page: (n: number, total: number) => string;
}

export interface ExamPdfRow {
  date: string; exam: string; place: string; points: string; result: string;
  sections: string; details: string; note: string;
}

export interface ExamPdfModel {
  title: string; dogName: string; generated: string;
  progress: string[];
  rows: ExamPdfRow[];
  labels: ExamPdfLabels;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Reines Modell (ohne PDF): Reihenfolge ältester zuerst, wie ein Leistungsheft. */
export function buildExamPdfModel(input: {
  exams: readonly ExamResult[]; dogName: string; generated: string;
  formatDate: (isoDate: string) => string; labels: ExamPdfLabels;
}): ExamPdfModel {
  const L = input.labels;
  const list = visibleExams(input.exams).reverse();
  const progress = examProgress(list).map(p => {
    const head = p.highestPassed ? L.passedLevel(p.highestPassed.levelLabel) : `${p.typeLabel}: ${L.noPassYet}`;
    return `${head} · ${p.next ? L.nextLevel(p.next.levelLabel) : L.highestLevel}`;
  });
  const rows = list.map((e): ExamPdfRow => ({
    date: input.formatDate(e.exam_date),
    exam: examDisplayName(e.exam_type, e.exam_level, e.exam_type_label),
    place: [e.club, e.location].filter(Boolean).join(', '),
    points: e.total_points != null ? `${fmt(e.total_points)}${e.max_points != null ? ` / ${fmt(e.max_points)}` : ''}` : '',
    result: [e.rating, e.passed === true ? L.passed : e.passed === false ? L.failed : null].filter(Boolean).join(' · '),
    sections: e.sections.filter(s => s.points != null || s.passed != null)
      .map(s => s.points != null
        ? `${s.key} ${s.label} ${fmt(s.points)}${s.maxPoints != null ? `/${fmt(s.maxPoints)}` : ''}`
        : `${s.key} ${s.label} ${s.passed ? L.passed : L.failed}`)
      .join(' · '),
    details: [e.judge ? `${L.judge}: ${e.judge}` : null, e.placement != null ? `${L.placement}: ${e.placement}` : null].filter(Boolean).join(' · '),
    note: e.notes ?? '',
  }));
  return { title: L.title, dogName: input.dogName, generated: input.generated, progress, rows, labels: L };
}

const M = 42;
const INK: PdfColor = [0.06, 0.09, 0.10];
const INK2: PdfColor = [0.33, 0.38, 0.41];
const RULE: PdfColor = [0.84, 0.86, 0.87];
const BAND: PdfColor = [0.945, 0.957, 0.961];
const TEAL: PdfColor = [0, 0.44, 0.365];
// Spalten: Datum · Prüfung · Ort/Verein · Punkte · Ergebnis
const COL = { date: M, exam: M + 64, place: M + 170, points: M + 330, result: M + 400 };

export function renderExamPdf(model: ExamPdfModel): PdfWriter {
  const pdf = new PdfWriter();
  const W = pdf.width; const H = pdf.height;
  const L = model.labels;
  let y = 0;
  const text = (s: string, x: number, yy: number, size: number, font: PdfFont = 'regular', color: PdfColor = INK) =>
    pdf.text(toWinAnsi(s), x, yy, size, font, color);
  const rule = (yy: number, color: PdfColor = RULE, thickness = 0.6) => pdf.line(M, yy, W - M, yy, thickness, color);
  const wrap = (s: string, size: number, width: number) => wrapText(toWinAnsi(s), size, width);

  const tableHead = () => {
    const heads: [string, number][] = [[L.colDate, COL.date], [L.colExam, COL.exam], [L.colPlace, COL.place], [L.colPoints, COL.points], [L.colResult, COL.result]];
    for (const [label, x] of heads) text(label.toUpperCase(), x, y, 7, 'bold', INK2);
    y -= 6; rule(y, INK, 0.8); y -= 14;
  };

  const newPage = (first: boolean) => {
    pdf.addPage();
    y = H - M;
    if (first) {
      text('ANYVO', M, y - 8, 10, 'bold', TEAL);
      text(`${model.title} · ${model.dogName}`, M, y - 30, 18, 'bold');
      const gen = toWinAnsi(model.generated);
      text(gen, W - M - textWidth(gen, 9), y - 30, 9, 'regular', INK2);
      y -= 40; rule(y, INK, 1.2); y -= 14;
      if (model.progress.length) {
        const bandH = 14 + model.progress.length * 12;
        pdf.rect(M, y - bandH, W - 2 * M, bandH, BAND);
        text(L.progressTitle.toUpperCase(), M + 10, y - 12, 7, 'bold', INK2);
        model.progress.forEach((p, i) => text(p, M + 10, y - 24 - i * 12, 9));
        y -= bandH + 20;
      }
    } else {
      text(`${model.title} · ${model.dogName}`, M, y - 8, 9, 'bold', INK2);
      y -= 26;
    }
    tableHead();
  };

  newPage(true);
  if (model.rows.length === 0) text(L.empty, M, y, 10, 'regular', INK2);

  const SIZE = 9; const LINE = 12; const SUB = 10.5;
  const subW = W - M - COL.exam;
  for (const row of model.rows) {
    const examLines = wrap(row.exam, SIZE, COL.place - COL.exam - 8);
    const placeLines = wrap(row.place, SIZE, COL.points - COL.place - 8);
    const resultLines = wrap(row.result, SIZE, W - M - COL.result);
    const subLines = [
      ...(row.sections ? wrap(row.sections, 8, subW) : []),
      ...(row.details ? wrap(row.details, 8, subW) : []),
    ];
    let noteLines = row.note ? wrap(row.note, 8, subW) : [];
    const mainLines = Math.max(1, examLines.length, placeLines.length, resultLines.length);
    // Sehr lange Notiz auf die Seitenhöhe kürzen, statt endlos Seiten anzulegen.
    const maxNote = Math.floor((H - 2 * M - 140 - mainLines * LINE - subLines.length * SUB) / SUB);
    if (noteLines.length > maxNote) noteLines = [...noteLines.slice(0, Math.max(0, maxNote - 1)), '…'];
    const height = mainLines * LINE + (subLines.length + noteLines.length) * SUB + 8;
    if (y - height < M + 24) newPage(false);

    text(row.date, COL.date, y, SIZE);
    examLines.forEach((l, i) => text(l, COL.exam, y - i * LINE, SIZE, 'bold'));
    placeLines.forEach((l, i) => text(l, COL.place, y - i * LINE, SIZE));
    text(row.points, COL.points, y, SIZE, 'bold');
    resultLines.forEach((l, i) => text(l, COL.result, y - i * LINE, SIZE));
    let sy = y - mainLines * LINE;
    for (const l of subLines) { text(l, COL.exam, sy, 8, 'regular', INK); sy -= SUB; }
    for (const l of noteLines) { text(l, COL.exam, sy, 8, 'regular', INK2); sy -= SUB; }
    y -= height; rule(y + 5); y -= 7;
  }

  const total = pdf.pageCount;
  for (let i = 0; i < total; i++) {
    pdf.selectPage(i);
    rule(M - 4);
    text(L.footerCreated, M, M - 16, 7.5, 'regular', INK2);
    const label = toWinAnsi(L.page(i + 1, total));
    text(label, W - M - textWidth(label, 7.5), M - 16, 7.5, 'regular', INK2);
  }
  return pdf;
}

export function renderExamPdfBase64(model: ExamPdfModel): string {
  return asciiToBase64(renderExamPdf(model).build({ title: `${model.title} ${model.dogName}` }));
}
