import { useEffect, useState } from 'react';
import { signMediaUrl } from '@/lib/mediaUrl';

// Löst eine gespeicherte Storage-URL zu einer signierten URL auf.
// Zeigt sofort die Original-URL (fail-open) und tauscht auf die signierte,
// sobald verfügbar — kein Lade-Flackern, kein Bruch.
export function useSignedUrl(url: string | null | undefined): string {
  const [resolved, setResolved] = useState(url ?? '');

  useEffect(() => {
    let active = true;
    if (!url) { setResolved(''); return; }
    setResolved(url);
    signMediaUrl(url).then(s => { if (active) setResolved(s); });
    return () => { active = false; };
  }, [url]);

  return resolved;
}
