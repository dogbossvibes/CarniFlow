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

it('shows the partial notice and refuses a stale numeric overall score', async () => {
  const drawn = jest.spyOn(PDFPage.prototype, 'drawText');
  const data = buildTrackUserExport({ points: [{ latitude: 47, longitude: 8 }, { latitude: 47.001, longitude: 8.001, breakBefore: true }], notes: 'CURRENT_DRAFT' }, '2026-10-08T12:00:00Z', true);
  data.summary.analysisScore = 64;
  const partialLabels = { ...labels, partialNotice: deCH['track.report.partialNotice'] };
  const bytes = await buildTrackReportPdf(data, font, partialLabels, logo);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  assertTextBounds(drawn.mock.calls);
  const rendered = drawn.mock.calls.map(([text]) => text).join(' ');
  expect(rendered).toContain('Teilaufzeichnung:');
  expect(rendered).toContain('CURRENT_DRAFT');
  expect(rendered).not.toContain('64');
}, PDF_TEST_TIMEOUT_MS);

it('renders confirmed corrections and paginated audit without replacing the sensor score', async () => {
  const drawn = jest.spyOn(PDFPage.prototype, 'drawText');
  const data = buildTrackUserExport({ dog: { name: 'Quiron' }, points: [{ latitude: 47, longitude: 8 }, { latitude: 47.0006, longitude: 8 }, { latitude: 47.0006, longitude: 8.0005 }],
    track_data: { run: { analytics: { trackScore: 78, analysisConfidenceBand: 'good' } } } }, '2026-10-09T12:00:00Z');
  data.summary.found = 1; data.summary.total = 2;
  data.objectReview = { version: 1, revision: 51, totalScore: 84, auditTruncated: true,
    objects: [{ label: 'G1', recordedStatus: 'auto_dwell_found', effectiveStatus: 'not_found' }, { label: 'G2', recordedStatus: 'missed', effectiveStatus: 'found' }],
    audit: Array.from({ length: 50 }, (_, i) => ({ revision: i + 2, createdAt: '2026-10-09T12:00:00Z',
      changes: [{ label: 'G1', before: i % 2 ? 'found' : 'not_found', after: i % 2 ? 'not_found' : 'found' }] })),
  };
  const reviewedLabels = { ...labels, reviewLabels: { title: deCH['track.review.exportLabel'], history: deCH['track.review.history'],
    truncated: deCH['track.review.truncated'], score: deCH['track.review.score'], noScore: deCH['track.review.noScore'], original: 'Aufnahme',
    status: { found: deCH['track.review.found'], not_found: deCH['track.review.not_found'], unobserved: deCH['track.review.unobserved'], unknown: deCH['track.review.unknown'] } } };
  const result = await buildTrackReportPdf(data, font, reviewedLabels, logo);
  const document = await PDFDocument.load(result);
  expect(document.getPageCount()).toBeGreaterThan(1);
  assertTextBounds(drawn.mock.calls);
  const allText = drawn.mock.calls.map(([value]) => value).join(' ');
  expect(allText).toContain('Korrigierter Aufnahmescore: 84/100');
  expect(allText).toContain('Nicht gefunden'); expect(allText).toContain('#51'); expect(allText).toContain('50 Änderungen');
  expect(data.summary.analysisScore).toBe(78);
  if (process.env.ANYVO_REVIEW_PDF_OUT) fs.writeFileSync(process.env.ANYVO_REVIEW_PDF_OUT, Buffer.from(result, 'base64'));
}, PDF_TEST_TIMEOUT_MS);
