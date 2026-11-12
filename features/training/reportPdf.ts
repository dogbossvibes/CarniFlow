import { PdfWriter, asciiToBase64, textWidth, type PdfColor, type PdfFont } from '@/features/training/pdfWriter';
import { toWinAnsi, type ReportModel } from '@/features/training/report';

// Zeichnet den Trainingsbericht als A4-PDF mit dem eigenen PDF-Schreiber
// (reines JavaScript, keine Abhängigkeit → per OTA auslieferbar). Alle Texte
// laufen durch toWinAnsi, damit nicht darstellbare Zeichen (Emojis) entfallen,
// statt die Erzeugung abzubrechen.

const M = 42;                                   // Seitenrand
const INK: PdfColor = [0.06, 0.09, 0.10];
const INK2: PdfColor = [0.33, 0.38, 0.41];
const RULE: PdfColor = [0.84, 0.86, 0.87];
const BAND: PdfColor = [0.945, 0.957, 0.961];
const TEAL: PdfColor = [0, 0.44, 0.365];

// Spalten: Datum · Sparte · Dauer · Note · Inhalt
const COL = { date: M, disc: M + 62, dur: M + 162, rate: M + 220, content: M + 262 };

export function wrapText(text: string, size: number, maxWidth: number, font: PdfFont = 'regular'): string[] {
  const words = text.split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const push = () => { if (line) { lines.push(line); line = ''; } };
  for (let word of words) {
    // Überlange Wörter hart umbrechen, statt über den Rand zu laufen.
    while (textWidth(word, size, font) > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && textWidth(word.slice(0, cut), size, font) > maxWidth) cut--;
      push();
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, font) <= maxWidth) line = candidate;
    else { push(); line = word; }
  }
  push();
  return lines;
}

export function renderReportPdf(model: ReportModel): PdfWriter {
  const pdf = new PdfWriter();
  const W = pdf.width;
  const H = pdf.height;
  const CONTENT_W = W - M - COL.content;
  const DISC_W = COL.dur - COL.disc - 8;
  const L = model.labels;
  let y = 0;

  const text = (s: string, x: number, yy: number, size: number, font: PdfFont = 'regular', color: PdfColor = INK) =>
    pdf.text(toWinAnsi(s), x, yy, size, font, color);
  const rule = (yy: number, color: PdfColor = RULE, thickness = 0.6) => pdf.line(M, yy, W - M, yy, thickness, color);

  const tableHead = () => {
    const heads: [string, number][] = [
      [L.colDate, COL.date], [L.colDiscipline, COL.disc], [L.colDuration, COL.dur], [L.colRating, COL.rate], [L.colContent, COL.content],
    ];
    for (const [label, x] of heads) text(label.toUpperCase(), x, y, 7, 'bold', INK2);
    y -= 6;
    rule(y, INK, 0.8);
    y -= 14;
  };

  const newPage = (first: boolean) => {
    pdf.addPage();
    y = H - M;
    if (first) {
      text('ANYVO', M, y - 8, 10, 'bold', TEAL);
      text(model.title, M, y - 30, 18, 'bold');
      if (model.range) {
        const range = toWinAnsi(model.range);
        text(range, W - M - textWidth(range, 9), y - 30, 9, 'regular', INK2);
      }
      y -= 40;
      rule(y, INK, 1.2);
      y -= 14;

      // Kennzahlen-Band
      const bandH = 42;
      pdf.rect(M, y - bandH, W - 2 * M, bandH, BAND);
      const cellW = (W - 2 * M) / Math.max(1, model.stats.length);
      model.stats.forEach((st, i) => {
        const cx = M + cellW * i + cellW / 2;
        const v = toWinAnsi(st.value);
        const l = toWinAnsi(st.label).toUpperCase();
        text(v, cx - textWidth(v, 14, 'bold') / 2, y - 19, 14, 'bold');
        text(l, cx - textWidth(l, 7) / 2, y - 33, 7, 'regular', INK2);
      });
      y -= bandH + 22;
    } else {
      text(model.title, M, y - 8, 9, 'bold', INK2);
      y -= 26;
    }
    tableHead();
  };

  newPage(true);

  const SIZE = 9;
  const LINE = 12;
  const NOTE_LINE = 10.5;
  for (const row of model.rows) {
    const discLines = wrapText(row.discipline, SIZE, DISC_W);
    const contentLines = row.content ? wrapText(row.content, SIZE, CONTENT_W) : [];
    let noteLines = row.note ? wrapText(row.note, 8, CONTENT_W) : [];
    const mainLines = Math.max(1, discLines.length, contentLines.length);

    // Eine Zeile, die höher ist als eine ganze Seite, würde nie Platz finden:
    // Notiz dann auf die Seitenhöhe kürzen, statt endlos neue Seiten anzulegen.
    const maxNote = Math.floor((H - 2 * M - 120 - mainLines * LINE) / NOTE_LINE);
    if (noteLines.length > maxNote) noteLines = [...noteLines.slice(0, Math.max(0, maxNote - 1)), '…'];

    const height = mainLines * LINE + noteLines.length * NOTE_LINE + 8;
    if (y - height < M + 24) newPage(false);

    text(row.date, COL.date, y, SIZE);
    discLines.forEach((l, i) => text(l, COL.disc, y - i * LINE, SIZE));
    text(row.duration, COL.dur, y, SIZE);
    text(row.rating, COL.rate, y, SIZE);
    contentLines.forEach((l, i) => text(l, COL.content, y - i * LINE, SIZE));
    let ny = y - Math.max(1, contentLines.length) * LINE;
    for (const l of noteLines) { text(l, COL.content, ny, 8, 'regular', INK2); ny -= NOTE_LINE; }

    y -= height;
    rule(y + 5);
    y -= 7;
  }

  // Fusszeile mit Seitenzahl erst jetzt — die Gesamtzahl steht erst am Ende fest.
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

export function renderReportPdfBase64(model: ReportModel): string {
  return asciiToBase64(renderReportPdf(model).build({ title: model.title }));
}
