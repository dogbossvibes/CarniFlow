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
    let deniedChecks = 0;
    const refresh = async () => {
      if (!active || inFlight || AppState.currentState !== 'active') return;
      inFlight = true;
      try {
        await refreshDiagnosticsAccess();
        if (!active || getDiagnosticsAccessSnapshot().userId !== userId) return;
        deniedChecks = hasDiagnosticsAccess() ? 0 : deniedChecks + 1;
        await hydrateQaModes();
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    // A transient failed read must not permanently hide the owner's menu.
    // At most three denied checks per foreground cycle; authority stays server-only.
    const timer = setInterval(() => {
      if (hasDiagnosticsAccess() || deniedChecks < 3) void refresh();
    }, 30_000);
    const listener = AppState.addEventListener('change', state => {
      // Revalidate on resume. The bounded access lease also expires in the background.
      if (state === 'active') {
        deniedChecks = 0;
        if (!hasDiagnosticsAccess()) revokeDiagnosticsAccess();
        void refresh();
      }
    });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, [userId]);
  return null;
}
