/** @jest-environment node */
import fs from 'node:fs';
import { PDFDocument, PDFPage } from 'pdf-lib';
import responses from './liveHttpResponses.json';
import { parseObjectReview, reviewCounts } from '../model';
import { buildTrackUserExport } from '../../../utils/trackUserExport';
import { buildTrackReportPdf, type ReportLabels } from '../../../utils/trackReportPdf';
import { deCH } from '@/i18n/de-CH';

// Captured ordinary two-account HTTP results, 2026-10-13T19:12:00Z.
// Only synthetic fixture data; no credentials, HTTP calls or native/device claims.
const labels = Object.fromEntries(['title', 'reference', 'search', 'duration', 'objects', 'score', 'confidence', 'conditions', 'notes', 'map', 'source', 'unknown', 'date', 'glyphNotice']
  .map(key => [key, deCH[('track.report.' + key) as keyof typeof deCH]])) as unknown as ReportLabels;
labels.noGeometry = deCH['track.export.unavailable'];
labels.reviewLabels = {
  title: deCH['track.review.exportLabel'], history: deCH['track.review.history'], truncated: deCH['track.review.truncated'],
  score: deCH['track.review.score'], noScore: deCH['track.review.noScore'], original: 'Aufnahme',
  status: { found: deCH['track.review.found'], not_found: deCH['track.review.not_found'], unobserved: deCH['track.review.unobserved'], unknown: deCH['track.review.unknown'] },
};
afterEach(() => jest.restoreAllMocks());

it.each(responses)('parses and exports actual $response.source HTTP results without changing originals or exposing IDs', async ({ key, response }) => {
  const review = parseObjectReview(response, key);
  expect(parseObjectReview(JSON.parse(JSON.stringify(review)), key)).toEqual(review);
  expect(reviewCounts(review).completeFound).toBe(2);
  expect(review.totalScore).toBe(response.source === 'recording_snapshot' ? 84 : null);
  expect(review.audit).toHaveLength(response.source === 'recording_snapshot' ? 2 : 1);
  for (const field of ['sessionId', 'runId', 'dogId'] as const) {
    expect(() => parseObjectReview(response, { ...key, [field]: 'unrelated' })).toThrow();
  }
  const data = { id: key.sessionId, owner_id: key.ownerId, dog_id: key.dogId, dog: { name: 'C1 Testhund' },
    runs: [{ id: key.runId, articles_found: 0 }], articles_total: 2,
    track_data: { run: { run_id: key.runId, analytics: { trackScore: 42 } } }, objectReview: review };
  const before = JSON.stringify(data);
  const exported = buildTrackUserExport(data, '2026-10-13T19:12:00Z');
  expect(exported.summary).toMatchObject({ found: 2, total: 2, analysisScore: 42 });
  expect(exported.objectReview?.totalScore).toBe(review.totalScore);
  expect(exported.objectReview?.audit).toHaveLength(review.audit.length);
  expect(exported.objectReview?.objects.map(o => o.recordedStatus)).toEqual(response.objects.map(o => o.recordedStatus));
  expect(JSON.stringify(exported)).not.toMatch(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  expect(JSON.stringify(data)).toBe(before);
  const drawn = jest.spyOn(PDFPage.prototype, 'drawText');
  const bytes = await buildTrackReportPdf(exported, fs.readFileSync('assets/fonts/NotoSans-Regular.ttf'), labels, fs.readFileSync('assets/images/anyvologo.png'));
  expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  const rendered = drawn.mock.calls.map(([text]) => text).join(' ');
  expect(rendered).toContain(labels.reviewLabels!.title);
  expect(rendered).toContain('#' + review.revision);
  if (review.totalScore === null) expect(rendered).toContain(labels.reviewLabels!.noScore);
  else expect(rendered).toContain('84/100');
  expect(JSON.stringify(data)).toBe(before);
}, 30_000);
