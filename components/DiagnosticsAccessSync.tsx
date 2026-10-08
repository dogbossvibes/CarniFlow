import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { revokeDiagnosticsAccess, hasDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
import { refreshDiagnosticsAccess } from '@/services/diagnosticsAccessService';
import { hydrateQaModes } from '@/features/tracking/utils/qaModeBootstrap';

export function DiagnosticsAccessSync() {
  const { user } = useSession();
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const refresh = async () => {
      if (!active || AppState.currentState !== 'active') return;
      await refreshDiagnosticsAccess();
      if (active) await hydrateQaModes();
    };
    void refresh();
    // Ordinary accounts need no continuous QA polling; recheck them at the next resume.
    const timer = setInterval(() => { if (hasDiagnosticsAccess()) void refresh(); }, 30_000);
    const listener = AppState.addEventListener('change', state => {
      // Revalidate on resume. The bounded access lease also expires in the background.
      if (state === 'active') {
        if (!hasDiagnosticsAccess()) revokeDiagnosticsAccess();
        void refresh();
      }
    });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, [userId]);
  return null;
}
