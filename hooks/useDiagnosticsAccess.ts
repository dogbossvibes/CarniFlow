import { useSyncExternalStore } from 'react';
import { getDiagnosticsAccessSnapshot, hasDiagnosticsAccess, subscribeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';

// Separate server-controlled personal permission; tester/subscription roles are unrelated.
export function useDiagnosticsAccess(): { allowed: boolean; loading: boolean } {
  const state = useSyncExternalStore(subscribeDiagnosticsAccess, getDiagnosticsAccessSnapshot, getDiagnosticsAccessSnapshot);
  return { allowed: hasDiagnosticsAccess(), loading: state.loading };
}
