import { HELVETICA_BOLD_WIDTHS, HELVETICA_WIDTHS, WIDTHS_FIRST_CODE } from '@/features/training/pdfMetrics';

// ──────────────────────────────────────────────────────────────────────────
// Minimaler PDF-Schreiber (PDF 1.4) für Text, Linien und Flächen auf A4.
// Bewusst OHNE Abhängigkeit: Eine neue Bibliothek würde die Release-Prüfung
// als nativen Build werten und die Auslieferung per OTA verhindern.
// Nur die Standardschriften Helvetica / Helvetica-Bold (WinAnsi), keine
// Kompression — die Datei besteht ausschliesslich aus ASCII-Zeichen.
// ──────────────────────────────────────────────────────────────────────────

export type PdfFont = 'regular' | 'bold';
export type PdfColor = readonly [number, number, number];   // RGB 0..1

// WinAnsi (CP1252): Zeichen oberhalb von Latin-1, die die Standardschrift kennt.
const CP1252_EXTRA: Record<string, number> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

// WinAnsi-Code eines Zeichens oder null, wenn die Schrift es nicht darstellen kann.
export function winAnsiCode(ch: string): number | null {
  const extra = CP1252_EXTRA[ch];
  if (extra !== undefined) return extra;
  const code = ch.codePointAt(0) ?? 0;
  if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) return code;
  return null;
}

// Textbreite in Punkt. Nicht darstellbare Zeichen zählen 0 (sie werden nicht gezeichnet).
export function textWidth(text: string, size: number, font: PdfFont = 'regular'): number {
  const table = font === 'bold' ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  let units = 0;
  for (const ch of text) {
    const code = winAnsiCode(ch);
    if (code !== null) units += table[code - WIDTHS_FIRST_CODE] ?? 0;
  }
  return (units * size) / 1000;
}

const hexString = (text: string): string => {
  let hex = '';
  for (const ch of text) {
    const code = winAnsiCode(ch);
    if (code !== null) hex += code.toString(16).padStart(2, '0');
  }
  return `<${hex}>`;
};

const num = (n: number): string => (Math.round(n * 100) / 100).toString();
const rgb = (c: PdfColor): string => `${num(c[0])} ${num(c[1])} ${num(c[2])}`;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// Base64 für reine ASCII-Zeichenketten (ein Zeichen = ein Byte).
export function asciiToBase64(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i) & 0xff;
    const b = i + 1 < input.length ? input.charCodeAt(i + 1) & 0xff : NaN;
    const c = i + 2 < input.length ? input.charCodeAt(i + 2) & 0xff : NaN;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (Number.isNaN(b) ? 0 : (b as number) >> 4)];
    out += Number.isNaN(b) ? '=' : B64[(((b as number) & 15) << 2) | (Number.isNaN(c) ? 0 : (c as number) >> 6)];
    out += Number.isNaN(c) ? '=' : B64[(c as number) & 63];
  }
  return out;
}

export class PdfWriter {
  readonly width: number;
  readonly height: number;
  private readonly pages: string[][] = [];
  private current = -1;

  constructor(width = 595.28, height = 841.89) {
    this.width = width;
    this.height = height;
  }

  get pageCount(): number { return this.pages.length; }

  addPage(): number {
    this.pages.push([]);
    this.current = this.pages.length - 1;
    return this.current;
  }

  // Auf eine bereits angelegte Seite zurückwechseln (z. B. für Fusszeilen am Ende).
  selectPage(index: number): void {
    if (index < 0 || index >= this.pages.length) throw new Error('PDF: Seite existiert nicht.');
    this.current = index;
  }

  private ops(): string[] {
    if (this.current < 0) this.addPage();
    return this.pages[this.current];
  }

  text(text: string, x: number, y: number, size: number, font: PdfFont = 'regular', color: PdfColor = [0, 0, 0]): void {
    if (!text) return;
    this.ops().push(`BT /${font === 'bold' ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(y)} Td ${hexString(text)} Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number, thickness = 0.6, color: PdfColor = [0, 0, 0]): void {
    this.ops().push(`${num(thickness)} w ${rgb(color)} RG ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }

  rect(x: number, y: number, w: number, h: number, color: PdfColor): void {
    this.ops().push(`${rgb(color)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
  }

  // Vollständige PDF-Datei als ASCII-Zeichenkette (Offsets = Zeichenpositionen).
  build(meta: { title?: string } = {}): string {
    if (this.pages.length === 0) this.addPage();
    const n = this.pages.length;
    // Objekte: 1 Katalog · 2 Seitenbaum · 3/4 Schriften · 5 Info · dann je Seite Inhalt + Seite
    const pageObj = (i: number) => 6 + i * 2 + 1;
    const contentObj = (i: number) => 6 + i * 2;
    const objects: string[] = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Count ${n} /Kids [${this.pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objects[5] = `<< /Producer ${hexString('ANYVO')} /Creator ${hexString('ANYVO')}${meta.title ? ` /Title ${hexString(meta.title)}` : ''} >>`;
    this.pages.forEach((ops, i) => {
      const stream = ops.join('\n');
      objects[contentObj(i)] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
      objects[pageObj(i)] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] `
        + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObj(i)} 0 R >>`;
    });

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = out.length;
      out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return out;
  }
}
