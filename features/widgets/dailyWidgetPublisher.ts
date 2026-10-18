import type { DailyWidgetTransport } from '@/modules/anyvo-daily-widget';
import { buildDailyWidgetSnapshot, type WidgetOwnedDog, type WidgetCalendarSource } from './dailyWidgetSnapshot';

export type WidgetRead = { dogs: WidgetOwnedDog[]; events: WidgetCalendarSource[]; truncated?: boolean };
type Context = { ownerId: string; token: string; sequence: number; busy: boolean; dirty: boolean };

// One publisher, with independent per-login identity even for A → B → A.
// Native beginSession is synchronous: logout invalidates native writes before
// any in-flight app fetch/bridge call can complete.
export function createDailyWidgetPublisher(deps: {
  transport: DailyWidgetTransport;
  read: (ownerId: string) => Promise<WidgetRead>;
  online: () => Promise<boolean>;
  now?: () => number;
  timeZone?: () => string;
}) {
  let identity: string | null | undefined;
  let context: Context | null = null;
  const current = (c: Context) => context === c;
  const refresh = async (): Promise<void> => {
    const c = context;
    if (!c) return;
    if (c.busy) { c.dirty = true; return; }
    c.busy = true;
    try {
      if (!(await deps.online())) {
        if (current(c)) await deps.transport.updateAvailability(c.token, ++c.sequence, 'offline');
        return;
      }
      if (!current(c)) return;
      const data = await deps.read(c.ownerId);
      if (!current(c)) return;
      const snapshot = buildDailyWidgetSnapshot({
        ...data, ownerId: c.ownerId, nowMs: (deps.now ?? Date.now)(),
        timeZone: (deps.timeZone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone))(),
      });
      const written = await deps.transport.updateSnapshot(c.token, ++c.sequence, JSON.stringify(snapshot));
      if (!written && current(c)) {
        // Do not treat native validation/storage rejection as a fresh empty day.
        // An invalidated token cannot affect the new owner through this call.
        await deps.transport.updateAvailability(c.token, ++c.sequence, 'error').catch(() => {});
      }
    } catch {
      // Preserve an existing same-account snapshot and its original timestamps.
      if (current(c)) await deps.transport.updateAvailability(c.token, ++c.sequence, 'error').catch(() => {});
    } finally {
      c.busy = false;
      if (current(c) && c.dirty) { c.dirty = false; void refresh(); }
    }
  };
  return {
    setIdentity(ownerId: string | null): void {
      if (identity === ownerId) return;
      identity = ownerId;
      context = null;
      try {
        const token = deps.transport.beginSession(ownerId);
        if (ownerId && token) context = { ownerId, token, sequence: 0, busy: false, dirty: false };
      } catch { /* fail closed; no fetch/update without a valid native generation */ }
      if (context) void refresh();
    },
    refresh,
    invalidate(): void {
      const owner = identity;
      context = null;
      if (!owner) return;
      // Source deletions/permission changes must not display the old dog/event
      // while a refresh is pending, offline, or fails.
      try { deps.transport.beginSession(null); } catch { return; }
      identity = undefined;
      this.setIdentity(owner);
    },
    dispose(): void { context = null; },
  };
}
