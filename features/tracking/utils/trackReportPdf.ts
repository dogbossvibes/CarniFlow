import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { C } from '../../../constants/colors';
import type { ExportPoint, TrackUserExport } from './trackUserExport';

export interface ReportLabels {
  title: string; reference: string; search: string; duration: string; objects: string; score: string;
  confidence: string; conditions: string; notes: string; map: string; source: string; noGeometry: string;
  unknown: string; date: string; confidenceLabels?: Record<string, string>;
  materialLabels?: Record<string, string>; glyphNotice: string;
}
const color = (hex: string): RGB => rgb(
  parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255,
);

/** ANYVO "Freiraum": local assets, a diagram beside metrics, and a separate score band. */
export async function buildTrackReportPdf(
  data: TrackUserExport, fontBytes: Uint8Array | string, labels: ReportLabels, logoBytes: Uint8Array | string,
): Promise<string> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [font, numericFont, logo] = await Promise.all([
    pdf.embedFont(fontBytes, { subset: true }), pdf.embedFont(StandardFonts.HelveticaBold), pdf.embedPng(logoBytes),
  ]);
  pdf.setTitle(labels.title); pdf.setAuthor('ANYVO'); pdf.setProducer('ANYVO');
  pdf.setCreationDate(new Date(data.exportedAt)); pdf.setModificationDate(new Date(data.exportedAt));

  const ink = color('#141B1D'), muted = color('#536863'), paper = color('#F0F5F2');
  const mintPanel = color('#DCEEE3'), border = color('#CFDDD3'), scoreFill = color('#132C23');
  const printMint = color('#087E69'), scoreMint = color('#9EF2D3'), blue = color(C.trackBlue), white = rgb(1, 1, 1);
  const margin = 36, width = 523, bottomLimit = 46;
  let page!: PDFPage, y = 0, unsupportedGlyphs = false;
  const chars = new Set(font.getCharacterSet());
  const clean = (text: string) => Array.from(text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')).map(c =>
    c === '\n' || chars.has(c.codePointAt(0)!) ? c : (unsupportedGlyphs = true, '?'),
  ).join('');
  const measured = new Map<string, number>();
  const measure = (text: string, size: number, face: PDFFont = font) => {
    const key = `${face.name}:${size}:${text}`, cached = measured.get(key);
    if (cached != null) return cached;
    const value = face.widthOfTextAtSize(text, size);
    measured.set(key, value);
    return value;
  };
  function wrap(value: string, size: number, maxWidth = width): string[] {
    const lines: string[] = [];
    for (const paragraph of clean(value).split('\n')) {
      let current = '', currentWidth = 0;
      for (const token of paragraph.match(/\S+|\s+/g) ?? []) {
        const tokenWidth = measure(token, size);
        if (current && currentWidth + tokenWidth > maxWidth) {
          lines.push(current.trimEnd()); current = ''; currentWidth = 0;
        }
        if (!current && !token.trim()) continue;
        if (tokenWidth > maxWidth) {
          for (const char of Array.from(token)) {
            const charWidth = measure(char, size);
            if (current && currentWidth + charWidth > maxWidth) {
              lines.push(current); current = ''; currentWidth = 0;
            }
            current += char; currentWidth += charWidth;
          }
        } else { current += token; currentWidth += tokenWidth; }
      }
      lines.push(current);
    }
    return lines;
  }
  function text(value: string, x: number, baseline: number, size: number, fill = ink, face = font) {
    page.drawText(clean(value), { x, y: baseline, size, font: face, color: fill });
  }
  function card(x: number, top: number, w: number, h: number, fill: RGB, radius = 20) {
    const r = Math.min(radius, h / 2, w / 2);
    page.drawSvgPath(`M ${r} 0 H ${w-r} Q ${w} 0 ${w} ${r} V ${h-r} Q ${w} ${h} ${w-r} ${h} H ${r} Q 0 ${h} 0 ${h-r} V ${r} Q 0 0 ${r} 0 Z`, { x, y: top, color: fill });
  }
  function newPage(first = false) {
    page = pdf.addPage([595, 842]);
    page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: paper });
    card(margin, 813, 38, 38, color(C.trackSurface), 10);
    // Keep the user's original logo unchanged, including transparency and aspect ratio.
    page.drawImage(logo, { x: margin, y: 775, ...logo.scaleToFit(38, 38) });
    text('ANYVO', margin + 51, 791, 17, ink, numericFont);
    const titleRows = wrap(labels.title, 8, width - 51);
    titleRows.forEach((row, i) => text(row, margin + 51, 776 - i * 11, 8, muted));
    y = Math.min(first ? 743 : 738, 765 - titleRows.length * 11);
  }
  function ensure(height: number) { if (y - height < bottomLimit) newPage(); }
  function line(value: string, size = 9.5, fill = ink) {
    for (const row of wrap(value, size)) {
      ensure(size * 1.45);
      text(row, margin, y - size, size, fill);
      y -= size * 1.45;
    }
  }
  function heading(value: string, followingHeight = 28) {
    const rows = wrap(value, 9);
    ensure(rows.length * 13 + 7 + followingHeight);
    for (const row of rows) { text(row, margin, y - 9, 9, muted); y -= 13; }
    y -= 7;
  }
  const fmt = (value: number | null, suffix = '') => value == null ? labels.unknown : `${Math.round(value * 10) / 10}${suffix}`;
  const seconds = data.summary.durationS == null ? null : Math.round(data.summary.durationS);
  const duration = seconds == null ? labels.unknown : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} min`;

  newPage(true);
  line(`${labels.date}: ${data.date ?? labels.unknown}`, 8, muted);
  y -= 14;
  line(data.title, 32);
  y -= 35;

  const mapW = 342, gap = 12, metricW = width - mapW - gap, metricInner = metricW - 38;
  const metrics = [
    [labels.reference, fmt(data.summary.referenceM, ' m')],
    [labels.search, fmt(data.summary.searchM, ' m')],
    [labels.duration, duration],
    [labels.objects, `${fmt(data.summary.found)} / ${fmt(data.summary.total)}`],
  ].map(([label, value]) => {
    const numeric = /^[\d .:/min]+$/.test(value);
    const suffix = numeric ? value.match(/ (m|min)$/)?.[1] ?? '' : '';
    const displayValue = suffix ? value.slice(0, -suffix.length - 1) : value;
    const face = numeric ? numericFont : font;
    const valueWidth = metricInner - (suffix ? measure(suffix, 10) + 6 : 0);
    const size = numeric ? Math.min(26, 26 * valueWidth / Math.max(1, measure(displayValue, 26, face))) : 11;
    // Missing values stay explicit, including when only one of found/total is known.
    const valueRows = numeric ? [displayValue] : wrap(value, size, metricInner);
    const labelRows = wrap(label, 8, metricInner);
    return { face, size, suffix, valueRows, labelRows, h: Math.max(74, valueRows.length * (size + 3) + labelRows.length * 11 + 24) };
  });
  const blockH = Math.max(320, 24 + metrics.reduce((sum, cell) => sum + cell.h, 0));
  const confidence = `${labels.confidence}: ${labels.confidenceLabels?.[data.summary.confidence ?? ''] ?? labels.unknown}`;
  const scoreRows = wrap(labels.score, 11, width - 145);
  const confidenceRows = wrap(confidence, 9, width - 145);
  const scoreH = Math.max(73, 28 + scoreRows.length * 15 + confidenceRows.length * 13);
  ensure(blockH + 18 + scoreH);
  const top = y, bottom = top - blockH, metricX = margin + mapW + gap;
  card(margin, top, mapW, blockH, white);
  card(metricX, top, metricW, blockH, mintPanel);
  let metricY = top - 22;
  for (const [i, cell] of metrics.entries()) {
    if (i) page.drawLine({ start: { x: metricX + 19, y: metricY + 13 }, end: { x: metricX + metricW - 19, y: metricY + 13 }, color: color('#BED9CA'), thickness: .6 });
    let cy = metricY;
    for (const row of cell.valueRows) { text(row, metricX + 19, cy - cell.size, cell.size, ink, cell.face); cy -= cell.size + 3; }
    if (cell.suffix) text(cell.suffix, metricX + 25 + measure(cell.valueRows[0], cell.size, cell.face), metricY - cell.size, 10, muted);
    cy -= 9;
    for (const row of cell.labelRows) { text(row, metricX + 19, cy - 8, 8, muted); cy -= 11; }
    metricY -= cell.h;
  }

  const mapRows = wrap(labels.map, 10, mapW - 40);
  mapRows.forEach((row, i) => text(row, margin + 20, top - 27 - i * 14, 10));
  const legend = [[labels.reference, printMint], [labels.search, blue]] as const;
  const legendRows = legend.map(([label, fill]) => ({ rows: wrap(label, 8, mapW - 66), fill }));
  const legendH = legendRows.reduce((sum, item) => sum + item.rows.length * 12 + 6, 0);
  let legendY = bottom + legendH + 15;
  for (const { rows, fill } of legendRows) {
    page.drawLine({ start: { x: margin + 20, y: legendY - 4 }, end: { x: margin + 37, y: legendY - 4 }, thickness: fill === printMint ? 3 : 1.6, color: fill });
    for (const row of rows) { text(row, margin + 45, legendY - 8, 8, muted); legendY -= 12; }
    legendY -= 6;
  }
  const plotTop = top - 35 - mapRows.length * 14, plotBottom = bottom + legendH + 44;
  const points = [...data.reference.flat(), ...data.search.flat(), ...data.markers];
  if (points.length) {
    const lat0 = points[0].lat, lng0 = points[0].lng, cosLat = Math.max(.000001, Math.cos(lat0 * Math.PI / 180));
    const local = (p: ExportPoint) => ({ x: ((((p.lng - lng0) + 540) % 360) - 180) * 111195 * cosLat, y: (p.lat - lat0) * 111195 });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const point of points) {
      const p = local(point);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const plotH = plotTop - plotBottom, factor = Math.min((mapW - 100) / Math.max(1, maxX - minX), (plotH - 24) / Math.max(1, maxY - minY));
    const project = (p: ExportPoint) => { const v = local(p); return { x: margin + mapW / 2 + (v.x - (minX + maxX) / 2) * factor, y: plotBottom + plotH / 2 + (v.y - (minY + maxY) / 2) * factor }; };
    for (const [parts, fill, thickness] of [[data.reference, printMint, 4], [data.search, blue, 1.6]] as const) {
      // Each stored segment has its own path. Never join across a recorded gap.
      for (const part of parts) {
        const path = part.map((p, i) => { const v = project(p); return `${i ? 'L' : 'M'}${v.x.toFixed(2)} ${(-v.y).toFixed(2)}`; }).join(' ');
        if (part.length > 1) page.drawSvgPath(path, { x: 0, y: 0, borderColor: fill, borderWidth: thickness });
        else if (part.length === 1) page.drawCircle({ ...project(part[0]), size: thickness, color: fill });
      }
    }
    for (const marker of data.markers) {
      const p = project(marker);
      page.drawCircle({ x: p.x, y: p.y, size: 3.5, color: white, borderColor: printMint, borderWidth: 1 });
      if (/^G\d+$/.test(marker.label)) {
        const labelW = measure(marker.label, 7) + 10;
        const labelX = Math.min(p.x + 6, margin + mapW - labelW - 10);
        card(labelX, p.y + 18, labelW, 14, mintPanel, 5);
        text(marker.label, labelX + 5, p.y + 8, 7);
      }
    }
    text('N', margin + mapW - 29, plotTop - 8, 7, muted);
    page.drawLine({ start: { x: margin + mapW - 26, y: plotTop - 35 }, end: { x: margin + mapW - 26, y: plotTop - 17 }, thickness: .8, color: muted });
    page.drawSvgPath('M 0 0 L -3 7 L 3 7 Z', { x: margin + mapW - 26, y: plotTop - 14, color: muted });
  } else {
    wrap(labels.noGeometry, 10, mapW - 48).forEach((row, i) => text(row, margin + 24, plotTop - 40 - i * 14, 10, muted));
  }

  y = bottom - 18;
  card(margin, y, width, scoreH, scoreFill, 18);
  const score = fmt(data.summary.analysisScore), hasScore = data.summary.analysisScore != null;
  const scoreSize = hasScore ? Math.min(40, 40 * 91 / Math.max(1, measure(score, 40, numericFont))) : 11;
  const scoreValueRows = hasScore ? [score] : wrap(score, scoreSize, 101);
  scoreValueRows.forEach((row, i) => text(row, margin + 20, y - 17 - scoreSize - i * 15, scoreSize, scoreMint, hasScore ? numericFont : font));
  let scoreY = y - 24;
  for (const row of scoreRows) { text(row, margin + 145, scoreY, 11, white); scoreY -= 15; }
  scoreY -= 6;
  for (const row of confidenceRows) { text(row, margin + 145, scoreY, 9, color('#BED6CB')); scoreY -= 13; }
  y -= scoreH + 20;

  const conditions = `${fmt(data.conditions.temperatureC, ' °C')} · ${data.conditions.weather ?? labels.unknown}\n${fmt(data.conditions.humidityPercent, ' %')} · ${fmt(data.conditions.windSpeed, ' km/h')}`;
  const objects = data.markers.map(m => `${m.label} · ${labels.materialLabels?.[m.material ?? m.kind] ?? m.material ?? m.kind}`).join('   /   ');
  const colW = (width - 36) / 2;
  const sections = [{ title: labels.conditions, body: conditions }, ...(objects ? [{ title: labels.objects, body: objects }] : [])];
  const columns = sections.map(s => ({ title: wrap(s.title, 9, colW), body: wrap(s.body, 9, colW) }));
  const columnH = Math.max(...columns.map(col => col.title.length * 13 + 8 + col.body.length * 13));
  if (columnH <= 76) {
    ensure(columnH);
    columns.forEach((col, i) => {
      const x = margin + i * (colW + 36);
      let cy = y;
      for (const row of col.title) { text(row, x, cy - 9, 9, muted); cy -= 13; }
      cy -= 8;
      for (const row of col.body) { text(row, x, cy - 9, 9); cy -= 13; }
    });
    if (columns.length > 1) page.drawLine({ start: { x: margin + colW + 18, y }, end: { x: margin + colW + 18, y: y - columnH }, thickness: .7, color: border });
    y -= columnH + 17;
  } else {
    // Long weather descriptions or marker lists use the paginating text flow.
    for (const section of sections) { heading(section.title); line(section.body); y -= 14; }
  }
  if (data.notes) { heading(labels.notes); line(data.notes); y -= 12; }
  // Keep the measurement explanation together when possible, without a fixed-height box.
  ensure(Math.min(60, wrap(labels.source, 7.5).length * 7.5 * 1.45));
  line(labels.source, 7.5, muted);
  if (unsupportedGlyphs) { y -= 8; line(labels.glyphNotice, 8, muted); }

  for (const [i, p] of pdf.getPages().entries()) {
    p.drawLine({ start: { x: margin, y: 32 }, end: { x: margin + width, y: 32 }, color: border, thickness: .6 });
    p.drawText('ANYVO', { x: margin, y: 18, size: 7.5, font: numericFont, color: printMint });
    const pagination = `${i + 1} / ${pdf.getPageCount()}`;
    p.drawText(pagination, { x: margin + width - measure(pagination, 7.5), y: 18, size: 7.5, font, color: muted });
  }
  return pdf.saveAsBase64();
}
