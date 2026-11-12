import { createLocalSearchPointsBatch, type NewTrackPoint } from '@/features/tracking/repositories/localTrackRepository';

const BATCH_SIZE = 25;
type SearchBuffer = {
  sessionId: string;
  points: NewTrackPoint[];
  inFlight: Promise<boolean> | null;
  error: string | null;
};
// A write and its retry always retain their original session, including after a
// dog change. Failed inactive buffers are retained until that session is resumed.
const buffers = new Map<string, SearchBuffer>();
let active: SearchBuffer | null = null;
let repositoryWrites: Promise<unknown> = Promise.resolve();

export function resetSearchBuffer(sessionId: string): void {
  const previous = active;
  active = buffers.get(sessionId) ?? { sessionId, points: [], inFlight: null, error: null };
  buffers.set(sessionId, active);
  if (previous && previous !== active) void flushBuffer(previous);
}

export function enqueueSearchPoint(point: NewTrackPoint): void {
  if (!active) return;
  active.points.push({ ...point, point_type: 'search' });
  if (active.points.length >= BATCH_SIZE) void flushBuffer(active);
}

async function flushBuffer(state: SearchBuffer): Promise<boolean> {
  if (state.inFlight) {
    if (!(await state.inFlight)) return false;
    return flushBuffer(state); // also drain a tail enqueued while the first batch ran
  }
  if (!state.points.length) return true;
  const run = (async () => {
    while (state.points.length) {
      const batch = state.points;
      state.points = [];
      try {
        // SQLite transactions must not overlap between different dog sessions.
        const write = repositoryWrites.then(() => createLocalSearchPointsBatch(state.sessionId, batch));
        repositoryWrites = write.catch(() => {});
        await write;
        state.error = null;
      } catch (error) {
        state.points = [...batch, ...state.points];
        state.error = error instanceof Error ? error.message : String(error);
        if (__DEV__) console.warn('[searchPersist] flush failed; original session retained:', state.error);
        return false;
      }
    }
    return true;
  })();
  state.inFlight = run.finally(() => {
    state.inFlight = null;
    if (active !== state && !state.points.length && buffers.get(state.sessionId) === state) buffers.delete(state.sessionId);
  });
  return state.inFlight;
}

/** A successful await includes any already-running write, never just its scheduling. */
export function flushSearchPoints(sessionId?: string): Promise<boolean> {
  const state = sessionId ? buffers.get(sessionId) : active;
  return state ? flushBuffer(state) : Promise.resolve(true);
}
/** Called only after an explicit discard, with the recorder stopped. */
export async function discardSearchBuffer(sessionId: string, assertScope?: () => void): Promise<void> {
  const state = buffers.get(sessionId);
  if (!state) return;
  if (state.inFlight) await state.inFlight;
  assertScope?.();
  state.points = [];
  buffers.delete(sessionId);
  if (active === state) active = null;
}
export function getSearchPersistError(): string | null { return active?.error ?? null; }
export function _peekSearchBuffer(): { sessionId: string | null; count: number } {
  return { sessionId: active?.sessionId ?? null, count: active?.points.length ?? 0 };
}
