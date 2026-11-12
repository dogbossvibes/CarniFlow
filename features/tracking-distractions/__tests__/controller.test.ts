import { createDistractionRecorder, type DistractionRecorderDeps } from '../controller';
import { DISTRACTION_LIMITS, parseDistractionTrack } from '../model';
import { fixture } from './fixture';
function setup() {
 let emit!: Parameters<DistractionRecorderDeps['start']>[0], now = 1000, valid = true;
 const stop = jest.fn(); const save = jest.fn(async (track, revision) => ({ track, revision: revision + 1 }));
 const deps: DistractionRecorderDeps = { now: () => now, check: () => { if (!valid) throw new Error('ACCOUNT_CHANGED'); },
  permit: async () => true, start: async cb => { emit = cb; return { stop }; }, save, change: jest.fn() };
 const controller = createDistractionRecorder({ track: fixture(), revision: 1 }, deps);
 return { controller, deps, save, stop, changeAccount: () => { valid = false; },
  fix: (lat = 47) => { now += 1000; emit({ lat, lng: 8, accuracy: 3, t: now }); }, drain: async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); } };
}
it('checkpoints fixes in order and finishes only after persistence; repeated finish does not rewrite', async () => {
 const h = setup(); await h.controller.start(); h.fix(); h.fix(47.00002); const stored = await h.controller.finish();
 expect(stored.track.points).toHaveLength(2); expect(stored.track.finishedAtMs).toBe(3000); expect(h.stop).toHaveBeenCalledTimes(1);
 const writes = h.save.mock.calls.length; expect(await h.controller.finish()).toEqual(stored); expect(h.save).toHaveBeenCalledTimes(writes);
});
it('pauses in the background without accepting late callbacks; resumes in a new section', async () => {
 const h = setup(); await h.controller.start(); h.fix(); h.controller.pause(); h.fix(48); await h.drain();
 expect(h.controller.snapshot.stored.track.points).toHaveLength(1); await h.controller.start(); h.fix(48); await h.drain();
 expect(h.controller.snapshot.stored.track.points[1].breakBefore).toBe(true); await h.controller.dispose();
});
it('stops a location subscription that resolves after pause', async () => {
 const h = setup(); let resolve!: (v: { stop(): void }) => void;
 h.deps.start = () => new Promise(r => { resolve = r; }); const pending = h.controller.start(); await h.drain(); h.controller.pause();
 resolve({ stop: h.stop }); await pending; expect(h.stop).toHaveBeenCalledTimes(1); expect(h.controller.snapshot.recording).toBe(false);
});
it('fails closed on account change and never saves another fix', async () => {
 const h = setup(); await h.controller.start(); h.save.mockClear(); h.changeAccount(); h.fix(); await h.drain(); expect(h.save).not.toHaveBeenCalled(); expect(h.controller.snapshot.recording).toBe(false);
});
it('retains the last durable draft and visibly pauses on disk error', async () => {
 const h = setup(); await h.controller.start(); h.fix(); await h.drain(); h.save.mockRejectedValueOnce(new Error('disk full'));
 h.fix(47.00002); await h.drain(); expect(h.controller.snapshot.stored.track.points).toHaveLength(1); expect(h.controller.snapshot.recording).toBe(false);
 await expect(h.controller.finish()).rejects.toThrow('disk full');
});
it('denied permissions do not open GPS or change records', async () => {
 const h = setup(); h.deps.permit = async () => false; h.deps.start = jest.fn(); await expect(h.controller.start()).rejects.toThrow('PERMISSION');
 expect(h.deps.start).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
});
it('weather checkpoints serialize with queued geometry and never overwrite points', async () => {
 const h = setup(); await h.controller.start(); h.fix(); const weather = h.controller.weather({ recordedAtMs: 2000, temperature: 12, windSpeed: null, humidity: null, weatherCode: null }); h.fix(47.00002);
 await weather; const result = await h.controller.finish(); expect(result.track.points).toHaveLength(2); expect(result.track.weather?.temperature).toBe(12);
});

it('ignores cached positions from before the actual recording start', async () => {
 const h = setup(); let emit!: Parameters<DistractionRecorderDeps['start']>[0];
 h.deps.start = async cb => { emit = cb; return { stop: h.stop }; };
 h.deps.now = () => 5000; await h.controller.start();
 emit({ lat: 47, lng: 8, accuracy: 3, t: 4000 });
 emit({ lat: 47, lng: 8, accuracy: 3, t: 5000 }); await h.drain();
 expect(h.controller.snapshot.stored.track.points.map(p => p.t)).toEqual([5000]);
 expect(h.controller.snapshot.error).toBeNull(); await h.controller.dispose();
});

it('finishes the durable line at capacity and refuses another recording start', async () => {
 const h = setup(); const track = fixture();
 track.points = Array.from({ length: DISTRACTION_LIMITS.points - 1 }, (_, i) => ({ lat: 47, lng: 8, t: 1000 + i, accuracy: 3, breakBefore: false }));
 let emit!: Parameters<DistractionRecorderDeps['start']>[0]; let now = 30000;
 h.deps.now = () => now; h.deps.start = async cb => { emit = cb; return { stop: h.stop }; };
 const c = createDistractionRecorder({ track, revision: 1 }, h.deps); await c.start();
 emit({ lat: 47.00002, lng: 8, accuracy: 3, t: now }); await h.drain();
 now += 1000; emit({ lat: 47.00004, lng: 8, accuracy: 3, t: now }); await h.drain();
 expect(c.snapshot.recording).toBe(false); expect(c.snapshot.error).toMatchObject({ code: 'LIMIT' });
 await expect(c.start()).rejects.toThrow('LIMIT');
 const result = await c.finish(); expect(result.track.points).toHaveLength(DISTRACTION_LIMITS.points);
 expect(result.track.finishedAtMs).toBe(now); expect(c.snapshot.error).toBeNull(); await c.dispose();
});

it('persists native fractional fixes through finish and reload as a drawable continuous line', async () => {
 const h = setup(); let emit!: Parameters<DistractionRecorderDeps['start']>[0]; let now = 1791980000000;
 h.deps.now = () => now; h.deps.start = async cb => { emit = cb; return { stop: h.stop }; };
 h.deps.save = async (track, revision) => ({ track: parseDistractionTrack(JSON.parse(JSON.stringify(track))), revision: revision + 1 });
 await h.controller.start();
 now += 1001; emit({ lat: 47, lng: 8, accuracy: 3, t: now - 0.625 });
 now += 1000; emit({ lat: 47.00002, lng: 8, accuracy: 3, t: now - 0.375 });
 const stored = await h.controller.finish();
 const reloaded = parseDistractionTrack(JSON.parse(JSON.stringify(stored.track)));
 expect(reloaded.points).toHaveLength(2);
 expect(reloaded.points.every(p => Number.isSafeInteger(p.t) && !p.breakBefore)).toBe(true);
 expect(reloaded.finishedAtMs).toBe(now); expect(reloaded.parentSessionId).toBe(fixture().parentSessionId);
 await h.controller.dispose();
});
