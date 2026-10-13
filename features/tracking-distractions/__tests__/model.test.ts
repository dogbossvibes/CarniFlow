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
