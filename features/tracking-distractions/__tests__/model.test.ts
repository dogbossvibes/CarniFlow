import { createDistractionSampler, distractionDistance, parseDistractionTrack } from '../model';
import { fixture } from './fixture';
it('keeps a new line independent of its parent and validates a finished line without inventing weather', () => {
 const track = fixture(); track.points = [{ lat: 47, lng: 8, t: 1000, accuracy: 3, breakBefore: false }, { lat: 47.0001, lng: 8, t: 2000, accuracy: 4, breakBefore: false }]; track.finishedAtMs = 3000;
 const before = JSON.stringify(track); const parsed = parseDistractionTrack(track);
 expect(parsed).toEqual(track); expect(JSON.stringify(track)).toBe(before); expect(parsed.weather).toBeNull();
});
it.each([NaN, Infinity, '47', 91])('rejects malformed coordinates %s', lat => {
 expect(() => parseDistractionTrack({ ...fixture(), points: [{ lat, lng: 8, t: 1000, accuracy: 3, breakBefore: false }] })).toThrow('INVALID');
});
it('rejects incomplete finishes and unrelated fields', () => {
 expect(() => parseDistractionTrack({ ...fixture(), finishedAtMs: 2000 })).toThrow('EMPTY');
 expect(() => parseDistractionTrack({ ...fixture(), score: 100 })).toThrow('INVALID');
});
it('does not count or draw the unknown path across a pause/restart', () => {
 const sampler = createDistractionSampler(); const first = sampler.accept({ lat: 47, lng: 8, accuracy: 3, t: 1000 }, 1000)!;
 sampler.interrupt(); const distant = sampler.accept({ lat: 48, lng: 9, accuracy: 3, t: 2000 }, 2000)!;
 expect(distant.breakBefore).toBe(true); expect(distractionDistance([first, distant])).toBe(0);
 expect(createDistractionSampler([first]).accept({ lat: 48, lng: 9, accuracy: 3, t: 2000 }, 2000)?.breakBefore).toBe(true);
});
it('keeps good stationary fixes continuous, but separates actual observation gaps', () => {
 const s = createDistractionSampler(); s.accept({ lat: 47, lng: 8, accuracy: 3, t: 1000 }, 1000);
 for (let t = 2000; t <= 10000; t += 1000) expect(s.accept({ lat: 47, lng: 8, accuracy: 3, t }, t)).toBeNull();
 expect(s.accept({ lat: 47.00002, lng: 8, accuracy: 3, t: 11000 }, 11000)?.breakBefore).toBe(false);
 expect(s.accept({ lat: 47.001, lng: 8, accuracy: 3, t: 18000 }, 18000)?.breakBefore).toBe(true);
});
it('rejects stale/future/duplicate/low-quality fixes and implausible jumps', () => {
 const s = createDistractionSampler();
 expect(s.accept({ lat: 47, lng: 8, t: 1000, accuracy: 70 }, 1000)).toBeNull();
 expect(s.accept({ lat: 47, lng: 8, t: 1000, accuracy: 3 }, 8000)).toBeNull();
 expect(s.accept({ lat: 47, lng: 8, t: 9000, accuracy: 3 }, 8000)).toBeNull();
 expect(s.accept({ lat: 47, lng: 8, t: 8000, accuracy: 3 }, 8000)).not.toBeNull();
 expect(s.accept({ lat: 48, lng: 8, t: 8000, accuracy: 3 }, 8000)).toBeNull();
 expect(s.accept({ lat: 48, lng: 8, t: 9000, accuracy: 3 }, 9000)).toBeNull();
});

it('accepts the existing prefixed local session identity without changing it', () => {
 const track = { ...fixture(), parentSessionId: `local_${fixture().parentSessionId}` };
 expect(parseDistractionTrack(track).parentSessionId).toBe(track.parentSessionId);
 expect(() => parseDistractionTrack({ ...track, parentSessionId: 'local_untrusted' })).toThrow('INVALID');
});

// CLLocation timestamps are Double milliseconds, not necessarily integers.
it('accepts fractional native fixes and stores canonical milliseconds without mutating the source', () => {
 const s = createDistractionSampler(), base = 1791980000000;
 const sample = { lat: 47, lng: 8, accuracy: 3, t: base + 0.375 };
 const first = s.accept(sample, base + 1)!;
 expect(first).not.toBeNull(); expect(first.t).toBe(base); expect(sample.t).toBe(base + 0.375);
 const second = s.accept({ ...sample, lat: 47.00002, t: base + 1000.625 }, base + 1001)!;
 expect(second).toMatchObject({ t: base + 1000, breakBefore: false });
 expect(distractionDistance([first, second])).toBeGreaterThan(2);
 expect(parseDistractionTrack({ ...fixture(), startedAtMs: base, finishedAtMs: base + 1001, points: [first, second] }).points).toHaveLength(2);
});
it('keeps fractional fixes subject to freshness, ordering, quality and gap checks', () => {
 const s = createDistractionSampler(), sample = { lat: 47, lng: 8, accuracy: 3, t: 1000.25 };
 expect(s.accept(sample, 1000)).toBeNull(); // raw future time must not be hidden by truncation
 expect(s.accept(sample, 6001)).toBeNull();
 expect(s.accept({ ...sample, accuracy: 41 }, 1001)).toBeNull();
 expect(s.accept(sample, 1001)).not.toBeNull();
 expect(s.accept({ ...sample, lat: 47.00002, t: 1000.75 }, 1001)).toBeNull(); // same stored millisecond
 expect(s.accept({ ...sample, t: 999.75 }, 1001)).toBeNull();
 expect(s.accept({ ...sample, lat: 48, t: 2000.25 }, 2001)).toBeNull();
 expect(s.accept({ ...sample, lat: 47.00002, t: 7000.5 }, 7001)?.breakBefore).toBe(true);
});
it.each([NaN, Infinity, -1, 0.5, 8640000000000001])('rejects invalid native time %s', t => {
 expect(createDistractionSampler().accept({ lat: 47, lng: 8, accuracy: 3, t }, 8640000000000001)).toBeNull();
});
