import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { revokeDiagnosticsAccess, hasDiagnosticsAccess, getDiagnosticsAccessSnapshot } from '@/lib/diagnosticsAccessState';
import { refreshDiagnosticsAccess } from '@/services/diagnosticsAccessService';
import { hydrateQaModes } from '@/features/tracking/utils/qaModeBootstrap';

export function DiagnosticsAccessSync() {
  const { user } = useSession();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let inFlight = false;
    let failures = 0;
    let retryAt = 0;
    const refresh = async () => {
      if (!active || inFlight || AppState.currentState !== 'active') return;
      inFlight = true;
      try {
        const result = await refreshDiagnosticsAccess();
        if (!active || getDiagnosticsAccessSnapshot().userId !== userId) return;
        if (result === 'denied') { failures = 0; retryAt = Infinity; }
        else if (result === 'allowed') { failures = 0; retryAt = Date.now() + 30_000; }
        else { failures++; retryAt = Date.now() + Math.min(300_000, 30_000 * 2 ** Math.min(failures - 1, 4)); }
        try { await hydrateQaModes(); } catch { /* Preferences cannot grant access. */ }
      } catch {
        if (active && getDiagnosticsAccessSnapshot().userId === userId) {
          revokeDiagnosticsAccess();
          failures++; retryAt = Date.now() + Math.min(300_000, 30_000 * 2 ** Math.min(failures - 1, 4));
        }
      } finally { inFlight = false; }
    };
    void refresh();
    // Retry transient failures with bounded frequency; an explicit denial waits for resume.
    const timer = setInterval(() => {
      if (hasDiagnosticsAccess() || Date.now() >= retryAt) void refresh();
    }, 30_000);
    const listener = AppState.addEventListener('change', state => {
      // Revalidate on resume. The bounded access lease also expires in the background.
      if (state === 'active') {
        failures = 0; retryAt = 0;
        if (!hasDiagnosticsAccess()) revokeDiagnosticsAccess();
        void refresh();
      }
    });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, [userId]);
  return null;
}
