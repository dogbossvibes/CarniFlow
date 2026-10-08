/** @jest-environment node */
import fs from 'fs';
import { PDFDocument, PDFDict, PDFName, PDFPage, type PDFPageDrawTextOptions } from 'pdf-lib';
import { buildTrackReportPdf, type ReportLabels } from '../trackReportPdf';
import { buildTrackUserExport } from '../trackUserExport';
import { deCH } from '@/i18n/de-CH';
const labels = Object.fromEntries(['title','reference','search','duration','objects','score','confidence','conditions','notes','map','source','unknown','date','glyphNotice'].map(k=>[k,deCH[('track.report.'+k) as keyof typeof deCH]])) as unknown as ReportLabels;
labels.noGeometry=deCH['track.export.unavailable'];
const font = fs.readFileSync('assets/fonts/NotoSans-Regular.ttf');
const logo = fs.readFileSync('assets/images/anyvologo.png');
// Real font/image encoding is exercised here; the timeout is not a mobile performance claim.
const PDF_TEST_TIMEOUT_MS = 30_000;
afterEach(() => jest.restoreAllMocks());
function assertTextBounds(calls: [string, PDFPageDrawTextOptions?][]) {
  for (const [text, options] of calls) {
    if (!options?.font || options.x == null || options.y == null || options.size == null) throw new Error('Missing PDF text geometry');
    expect(options.x).toBeGreaterThanOrEqual(35);
    expect(options.x + options.font.widthOfTextAtSize(text, options.size)).toBeLessThanOrEqual(559.01);
    expect(options.y).toBeGreaterThanOrEqual(18);
    expect(options.y).toBeLessThan(814);
    // Only the repeated footer may enter its reserved area.
    if (options.y < 46) expect(options.y).toBe(18);
  }
}
it('creates a readable offline report with a licensed embedded font and valid A4 pages',async()=>{
  const drawn=jest.spyOn(PDFPage.prototype,'drawText');
  const data=buildTrackUserExport({dog:{name:'Zoë & François'},points:[{latitude:47,longitude:8},{latitude:47.001,longitude:8.001}],notes:'Première ligne\nÄ ö ü – français'},'2026-10-08T12:00:00Z',true);
  const bytes=await buildTrackReportPdf(data,font,labels,logo);
  const document=await PDFDocument.load(bytes);
  expect(document.getPageCount()).toBe(1);
  expect(document.getTitle()).toBe('Fährtenbericht');
  expect(document.getPage(0).getSize()).toEqual({width:595,height:842});
  assertTextBounds(drawn.mock.calls);
  expect(document.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'),PDFDict).keys().length).toBeGreaterThan(0);
}, PDF_TEST_TIMEOUT_MS);
it('paginates long notes and accepts base64 font bytes on mobile',async()=>{
  const drawn=jest.spyOn(PDFPage.prototype,'drawText');
  const data=buildTrackUserExport({notes:('Eine längere Beobachtung zur Fährtenarbeit. '.repeat(150))+' ENDE'},'2026-10-08T12:00:00Z',true);
  const bytes=await buildTrackReportPdf(data,font.toString('base64'),labels,logo.toString('base64'));
  const document=await PDFDocument.load(bytes);
  expect(document.getPageCount()).toBeGreaterThan(1);
  expect(document.getPageCount()).toBeLessThan(10);
  assertTextBounds(drawn.mock.calls);
  expect(drawn.mock.calls.map(([text])=>text).join(' ')).toContain('ENDE');
  for (const page of document.getPages()) expect(page.node.Resources()?.lookup(PDFName.of('XObject'),PDFDict).keys().length).toBeGreaterThan(0);
}, PDF_TEST_TIMEOUT_MS);

it('keeps long names and missing values readable, preserves gaps, and reports unsupported glyphs',async()=>{
  const drawn=jest.spyOn(PDFPage.prototype,'drawText');
  const paths=jest.spyOn(PDFPage.prototype,'drawSvgPath');
  const name='Zoë'.repeat(100)+'TITLE_END';
  const data=buildTrackUserExport({dog:{name}, notes:'Beobachtung 🐕 NOTIZ_END'},'2026-10-08T12:00:00Z',true);
  data.reference=[[{lat:47,lng:8},{lat:47.001,lng:8}], [{lat:47.002,lng:8.002},{lat:47.003,lng:8.002}]];
  data.search=[[{lat:47,lng:8.0001}]];
  const bytes=await buildTrackReportPdf(data,font,labels,logo);
  const document=await PDFDocument.load(bytes);
  expect(document.getPageCount()).toBeGreaterThan(1);
  assertTextBounds(drawn.mock.calls);
  const text=drawn.mock.calls.map(([value])=>value).join('');
  expect(text).toContain(name);
  expect(text).toContain(labels.unknown);
  expect(text).toContain('NOTIZ_END');
  expect(text.replaceAll(' ','')).toContain(labels.glyphNotice.replaceAll(' ',''));
  expect(paths.mock.calls.filter(([,options])=>options?.borderWidth===4)).toHaveLength(2);
}, PDF_TEST_TIMEOUT_MS);
