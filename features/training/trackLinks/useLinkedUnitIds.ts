import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { linkedUnitIds } from './store';

const EMPTY: ReadonlySet<string> = new Set();

/** Eigene Trainings mit verknüpfter Fährte (#114), aus dem lokalen Speicher. Fehler → leer. */
export function useLinkedUnitIds(refreshKey?: unknown): ReadonlySet<string> {
  const [ids, setIds] = useState<ReadonlySet<string>>(EMPTY);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const next = session?.user.id ? await linkedUnitIds(session.user.id) : EMPTY;
        if (!cancelled) setIds(next);
      } catch { if (!cancelled) setIds(EMPTY); }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);
  return ids;
}
