import { readFileSync } from 'fs';

// The evaluation screen uses the repository's existing source-contract harness.
it('places export after the note and passes the visible draft without saving or replacing analytics', () => {
  const source = readFileSync('app/track/[id].tsx', 'utf8');
  const input = source.indexOf('value={notes}');
  const exportCard = source.indexOf('<TrackExportActions data={{ ...data, notes, objectReview: reviewed }} />');
  expect(input).toBeGreaterThan(-1);
  expect(exportCard).toBeGreaterThan(input);
  expect(exportCard).toBeLessThan(source.indexOf('<SmartFeedbackSection'));
  expect(source).not.toContain('trackScore: score');
});
