// One native location task exists process-wide. Finish an older native start/stop
// before the next recorder takes over, including across hook unmount/remount.
let pending: Promise<unknown> = Promise.resolve();
export function serializeBackgroundTransition(action: () => Promise<void>): Promise<void> {
  const next = pending.then(action);
  pending = next.catch(() => {});
  return next;
}
