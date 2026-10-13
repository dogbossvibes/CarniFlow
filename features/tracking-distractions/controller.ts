import { createDistractionSampler, DISTRACTION_LIMITS, DistractionError, type DistractionPoint, type DistractionTrack, type DistractionWeather } from './model';
import type { StoredDistraction } from './repository';

export interface DistractionRecorderDeps {
 now(): number;
 check(): void;
 permit(): Promise<boolean>;
 start(emit: (sample: { lat: number; lng: number; t: number; accuracy?: number | null }) => void): Promise<{ stop(): void }>;
 save(track: DistractionTrack, revision: number): Promise<StoredDistraction>;
 change(state: { stored: StoredDistraction; recording: boolean; error: unknown | null }): void;
}
/** Serial durable checkpoints, session-bound callbacks and a fresh section on every resume. */
export function createDistractionRecorder(initial: StoredDistraction, deps: DistractionRecorderDeps) {
 let stored = initial, recording = false, generation = 0, handle: { stop(): void } | null = null;
 let sampler = createDistractionSampler(stored.track.points), queue = Promise.resolve(), pending = 0;
 let disposed = false, closing = false, finishing = false, starting = false, error: unknown | null = null;
 const emit = () => { if (!disposed) deps.change({ stored, recording, error }); };
 const stop = () => { generation++; recording = false; starting = false; handle?.stop(); handle = null; sampler.interrupt(); emit(); };
 function append(point: DistractionPoint) {
  if (pending >= 32) { error = new DistractionError('STORAGE'); stop(); return; }
  pending++;
  queue = queue.then(async () => {
   deps.check();
   // Pausing stops new fixes; already admitted points are committed before finish.
   if (disposed || stored.track.finishedAtMs !== null || error) return;
   if (stored.track.points.length >= DISTRACTION_LIMITS.points) throw new DistractionError('LIMIT');
   stored = await deps.save({ ...stored.track, points: [...stored.track.points, point] }, stored.revision); emit();
  }).catch(e => { error = e; stop(); }).finally(() => { pending--; });
 }
 return {
  get snapshot() { return { stored, recording, error }; },
  async start() {
   deps.check(); if (disposed || closing || finishing || starting || recording || stored.track.finishedAtMs !== null) throw new DistractionError('BUSY');
   if (stored.track.points.length >= DISTRACTION_LIMITS.points) throw new DistractionError('LIMIT');
   starting = true; error = null; const token = ++generation;
   try {
    await queue; deps.check(); if (disposed || token !== generation) return;
    if (!await deps.permit()) throw new DistractionError('PERMISSION');
    deps.check(); if (disposed || token !== generation) return;
    if (!stored.track.points.length) stored = await deps.save({ ...stored.track, startedAtMs: deps.now() }, stored.revision);
    deps.check(); if (disposed || token !== generation) return;
    sampler = createDistractionSampler(stored.track.points); recording = true; emit();
    const next = await deps.start(sample => {
     if (!recording || disposed || token !== generation) return;
     try { deps.check(); if (sample.t < stored.track.startedAtMs) return; const point = sampler.accept(sample, deps.now()); if (point) append(point); }
     catch (e) { error = e; stop(); }
    });
    if (disposed || token !== generation) next.stop(); else handle = next;
   } catch (e) { if (token === generation && !disposed) { error = e; stop(); } throw e; }
   finally { if (token === generation) starting = false; }
  },
  pause: stop,
  async finish() {
   if (finishing || closing || disposed) throw new DistractionError('BUSY');
   deps.check(); if (stored.track.finishedAtMs !== null) return stored;
   finishing = true; stop();
   try {
    await queue; deps.check();
    // Capacity stops admission, but the already durable line can still be finished.
    if (error && !(error instanceof DistractionError && error.code === 'LIMIT')) throw error;
    if (!stored.track.points.some((point, i) => i > 0 && !point.breakBefore)) throw new DistractionError('EMPTY');
    stored = await deps.save({ ...stored.track, finishedAtMs: Math.max(deps.now(), stored.track.points.at(-1)!.t) }, stored.revision); error = null; emit(); return stored;
   } finally { finishing = false; }
  },
  async weather(weather: DistractionWeather) {
   const operation = queue.then(async () => {
    deps.check(); if (disposed || closing || stored.track.weather || stored.track.finishedAtMs !== null) return;
    stored = await deps.save({ ...stored.track, weather }, stored.revision); emit();
   });
   queue = operation.catch(e => { error = e; stop(); });
   await operation;
  },
  async dispose() { closing = true; stop(); await queue; disposed = true; },
 };
}
