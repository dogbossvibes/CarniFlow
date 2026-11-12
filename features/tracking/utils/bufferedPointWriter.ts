/** Serial, retryable persistence. Every caller waits for the same complete drain. */
export function createBufferedPointWriter<T>(buffer: { current: T[] }, write: (batch: T[]) => Promise<void>) {
  let inFlight: Promise<boolean> | null = null;
  const flush = (): Promise<boolean> => {
    // A tail may arrive after an empty drain resolved, before its finally ran.
    // Every later waiter rechecks the buffer once the shared write is complete.
    if (inFlight) return inFlight.then(saved => saved ? flush() : false);
    if (!buffer.current.length) return Promise.resolve(true);
    inFlight = (async () => {
      while (buffer.current.length) {
        const batch = buffer.current;
        buffer.current = [];
        try { await write(batch); }
        catch { buffer.current.unshift(...batch); return false; }
      }
      return true;
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
  return { flush };
}
