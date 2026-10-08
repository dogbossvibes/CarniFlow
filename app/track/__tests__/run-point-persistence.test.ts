import { readFileSync } from 'fs';
const source = () => readFileSync('app/track/run.tsx', 'utf8');
it('requires durable points before normal search finalization and releases the UI for retry on failure', () => {
  const src = source().split('const handleFinish = async')[1];
  const gate = src.indexOf('if (!(await flushSearchPoints(');
  expect(gate).toBeGreaterThan(-1);
  expect(gate).toBeLessThan(src.indexOf('await finalizeLocalTrackRun('));
  expect(src.slice(gate, src.indexOf('// Punkt 10/13'))).toContain('finishRequestedRef.current = false');
  expect(src.slice(gate, src.indexOf('// Punkt 10/13'))).toContain('return;');
});
it('retains recovery state on a point-write or result-write failure', () => {
  const src = source().split('const endSearch = async')[1].split('// Verwerfen:')[0];
  expect(src.indexOf('await flushSearchPoints(sessId)')).toBeLessThan(src.indexOf('await loadSavedSearchPoints(pending)'));
  const resultGate = src.indexOf('if (!savedRun)');
  expect(resultGate).toBeGreaterThan(src.indexOf('await finalizeLocalTrackRun('));
  expect(resultGate).toBeLessThan(src.indexOf('setRecovery(null)'));
  expect(src.slice(resultGate, src.indexOf('// Remote-Transport'))).toContain('return;');
});
