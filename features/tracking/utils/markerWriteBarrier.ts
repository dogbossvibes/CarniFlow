/** Wartet beim Finish nur auf bereits gestartete lokale Marker-Inserts. */
export const MARKER_WRITE_TIMEOUT_MS = 30_000;

export function createMarkerWriteBarrier() {
  const pending = new Set<Promise<boolean>>();
  let failed = false;
  return {
    track(write: Promise<boolean>): Promise<boolean> {
      pending.add(write);
      void write.then(
        saved => { if (!saved) failed = true; pending.delete(write); },
        () => { failed = true; pending.delete(write); },
      );
      return write;
    },
    snapshot(timeoutMs = MARKER_WRITE_TIMEOUT_MS): Promise<boolean> {
      const writes = [...pending];
      if (!writes.length) return Promise.resolve(!failed);
      return new Promise(resolve => {
        const timer = setTimeout(() => { failed = true; resolve(false); }, timeoutMs);
        void Promise.allSettled(writes).then(results => {
          clearTimeout(timer);
          resolve(!failed && results.every(r => r.status === 'fulfilled' && r.value));
        });
      });
    },
  };
}
