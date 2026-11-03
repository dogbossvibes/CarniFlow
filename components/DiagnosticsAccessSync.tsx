import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { hasDiagnosticsAccess, getDiagnosticsAccessSnapshot, revokeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
import { refreshDiagnosticsAccess, type DiagnosticsAccessResult } from '@/services/diagnosticsAccessService';
import { hydrateQaModes } from '@/features/tracking/utils/qaModeBootstrap';

export function DiagnosticsAccessSync() {
  const { user } = useSession();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let inFlight = false;
    let resumedWhilePending = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Preserve the reviewed Build-55 backoff; retryability is independent of grant.
    const retryDelays = [30_000, 60_000, 120_000, 240_000, 300_000];
    const refresh = async () => {
      if (!active || AppState.currentState !== 'active') return;
      if (inFlight) { resumedWhilePending = true; return; }
      clearTimeout(timer);
      inFlight = true;
      let result: DiagnosticsAccessResult;
      try {
        result = await refreshDiagnosticsAccess();
      } catch {
        result = 'unavailable';
        if (active && getDiagnosticsAccessSnapshot().userId === userId) {
          // The store clears authority before notifying listeners. A failing
          // listener must not leave the foreground retry loop locked forever.
          try { revokeDiagnosticsAccess(); } catch { /* authority is already revoked */ }
        }
      } finally { inFlight = false; }
      if (!active || getDiagnosticsAccessSnapshot().userId !== userId) return;
      // A denied account never gains authority from a retry or a cached grant.
      // Transient failures must not disable their own recovery mechanism.
      const retry = result === 'unavailable' || result === 'stale';
      const delay = retry ? retryDelays[Math.min(failures++, retryDelays.length - 1)] : 30_000;
      if (!retry) failures = 0;
      if (AppState.currentState === 'active' && (result === 'allowed' || retry || resumedWhilePending)) {
        timer = setTimeout(() => { void refresh(); }, resumedWhilePending ? 0 : delay);
      }
      resumedWhilePending = false;
      if (result === 'allowed' && hasDiagnosticsAccess()) await hydrateQaModes().catch(() => {});
    };
    void refresh();
    // Explicitly denied accounts need no continuous QA polling; recheck on resume.
    const listener = AppState.addEventListener('change', state => {
      clearTimeout(timer);
      if (state === 'active') { failures = 0; void refresh(); }
    });
    return () => { active = false; clearTimeout(timer); listener.remove(); };
  }, [userId]);
  return null;
}
