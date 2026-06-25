import { useCallback, useEffect, useState } from 'react';
import { isCrashReportingEnabled, setCrashReportingEnabled } from '@/lib/monitoring';

// Profil-Einstellung „Absturzberichte senden". Default an; lokal persistiert.
export function useCrashReporting() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    let active = true;
    isCrashReportingEnabled().then(v => { if (active) { setEnabled(v); setLoaded(true); } });
    return () => { active = false; };
  }, []);

  const toggle = useCallback(async (value: boolean) => {
    setEnabled(value);                          // optimistisch
    await setCrashReportingEnabled(value);
  }, []);

  return { enabled, loaded, toggle };
}
