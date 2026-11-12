import { StepCalibrationSession, usableCalibrationFix, type CalibrationFix } from '../stepCalibrationSession';

const fix = (x: number, t: number, accuracy: number | null = 2, y = 0): CalibrationFix => ({ lat: y / 111195, lng: x / 111195, accuracy, t });
function ready(accuracy = 2) {
  const session = new StepCalibrationSession(100000);
  for (let i = 0; i <= 2; i++) session.add(fix(0, 100000 + 1000 * i, accuracy), 100000 + 1000 * i);
  expect(session.state.phase).toBe('ready');
  expect(session.begin(102000)).toBe(true);
  return session;
}
function walk(session: StepCalibrationSession, length: number, accuracy = 2, y: (i: number) => number = () => 0) {
  for (let i = 1; i <= 50; i++) session.add(fix(length * i / 50, 102000 + 1000 * i, accuracy, y(i)), 102000 + 1000 * i);
  session.finish(152000);
  for (let i = 1; i <= 3; i++) session.add(fix(length, 152000 + 1000 * i, accuracy), 152000 + 1000 * i);
}
it('requires a stable start and explicit start; measures endpoint distance without rounding stored result', () => {
  const s = ready(); walk(s, 37.5);
  expect(s.state.phase).toBe('result'); expect(s.state.issue).toBeNull();
  expect(s.state.stepLengthM).toBeCloseTo(0.75, 4);
  expect(s.state.stepLengthM).toBe(s.state.distanceM / 50);
});
it('rejects stationary jitter even when accumulated movement would appear to be a walk', () => {
  const s = ready();
  for (let i = 1; i <= 50; i++) s.add(fix(i % 2 ? 1 : -1, 102000 + i * 1000), 102000 + i * 1000);
  s.finish(152000);
  for (let i = 1; i <= 3; i++) s.add(fix(0, 152000 + i * 1000), 152000 + i * 1000);
  expect(s.state.issue).toBe('implausible'); expect(s.state.stepLengthM).toBeNull();
});
it('rejects excessive reported uncertainty for the actual distance', () => {
  const s = ready(5); walk(s, 30, 5);
  expect(s.state.issue).toBe('uncertain'); expect(s.state.stepLengthM).toBeNull();
});
it('does not improve reported accuracy by repeatedly sampling correlated fixes', () => {
  const s = ready(5); walk(s, 30, 5);
  expect(s.state.issue).toBe('uncertain');
});
it.each([10, 70])('rejects implausible step length at %s metres', length => {
  const s = ready(); walk(s, length); expect(s.state.issue).toBe('implausible');
});
it('rejects a curved route instead of silently treating the shorter chord as walked distance', () => {
  const s = ready(); walk(s, 37.5, 2, i => 15 * Math.sin(Math.PI * i / 50));
  expect(s.state.issue).toBe('course');
});
it('cannot finish immediately or bridge a GPS outage', () => {
  const quick = ready(); quick.finish(103000); expect(quick.state.issue).toBe('implausible');
  const gap = ready(); gap.add(fix(30, 122000), 122000); expect(gap.state.issue).toBe('interrupted');
});
it('times out acquisition and does not start from an expired ready anchor', () => {
  const s = new StepCalibrationSession(100000);
  s.tick(131000); expect(s.state.issue).toBe('signal');
  const stale = new StepCalibrationSession(100000);
  for (let i = 0; i < 3; i++) stale.add(fix(0, 100000 + i * 1000), 100000 + i * 1000);
  expect(stale.begin(108000)).toBe(false);
});
it('ignores duplicate and late fixes and rejects an impossible jump', () => {
  const s = ready(); s.add(fix(20, 102000), 103000); expect(s.state.distanceM).toBe(0);
  s.add(fix(20, 101000), 103000); expect(s.state.distanceM).toBe(0);
  s.add(fix(100, 103000), 103000); expect(s.state.issue).toBe('signal');
});
it('requires new endpoint fixes after Done', () => {
  const s = ready();
  for (let i = 1; i <= 50; i++) s.add(fix(37.5 * i / 50, 102000 + i * 1000), 102000 + i * 1000);
  s.finish(152000); expect(s.state.phase).toBe('finishing'); expect(s.state.stepLengthM).toBeNull();
  s.add(fix(37.5, 151000), 152000); expect(s.state.phase).toBe('finishing');
  s.tick(183000); expect(s.state.issue).toBe('signal');
});
it.each([
  { accuracy: null }, { accuracy: -1 }, { accuracy: NaN }, { accuracy: 6 },
  { lat: NaN }, { lat: 91 }, { lng: 181 }, { t: NaN }, { t: 95000 }, { t: 102000 },
])('ignores malformed, poor or stale fixes: %j', patch => {
  const f = { ...fix(0, 100000), ...patch };
  expect(usableCalibrationFix(f, 100000)).toBe(false);
  const s = new StepCalibrationSession(100000); s.add(f, 100000);
  expect(s.state.phase).toBe('warming');
});

it('rejects a wall-clock rewind and a missing endpoint rather than silently changing duration or bridging the gap', () => {
  const clock = ready(); clock.tick(90000); expect(clock.state.issue).toBe('interrupted');
  const endpoint = ready();
  for (let i=1; i<=50; i++) endpoint.add(fix(i*.75, 102000+i*1000), 102000+i*1000);
  endpoint.finish(152000); endpoint.tick(163000);
  expect(endpoint.state.issue).toBe('interrupted'); expect(endpoint.state.stepLengthM).toBeNull();
});
