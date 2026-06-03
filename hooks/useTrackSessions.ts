import { useCallback, useEffect, useState } from 'react';
import { useSession } from './useSession';
import { getTrackSessions, getTrackStats } from '@/services/trackingService';
import type { TrackSession } from '@/types/tracking';

export interface TrackStatsTotal {
  anzahl:     number;
  distanz_m:  number;
  dauer_sec:  number;
}

export function useTrackSessions(dogId?: string) {
  const { session } = useSession();
  const [tracks,  setTracks]  = useState<TrackSession[]>([]);
  const [stats,   setStats]   = useState<TrackStatsTotal>({ anzahl: 0, distanz_m: 0, dauer_sec: 0 });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) { setLoading(false); return; }

    setLoading(true);
    const [tracksRes, statsRes] = await Promise.all([
      getTrackSessions(uid, dogId),
      dogId ? Promise.resolve({ data: null }) : getTrackStats(uid),
    ]);

    const rows = (tracksRes.data as TrackSession[]) ?? [];
    setTracks(rows);

    if (statsRes.data) {
      const rawStats = statsRes.data as { distanz_m: number | null; dauer_sec: number | null }[];
      setStats({
        anzahl:    rawStats.length,
        distanz_m: rawStats.reduce((s, r) => s + (r.distanz_m ?? 0), 0),
        dauer_sec: rawStats.reduce((s, r) => s + (r.dauer_sec ?? 0), 0),
      });
    } else {
      setStats({
        anzahl:    rows.length,
        distanz_m: rows.reduce((s, r) => s + (r.distanz_m ?? 0), 0),
        dauer_sec: rows.reduce((s, r) => s + (r.dauer_sec ?? 0), 0),
      });
    }

    setLoading(false);
  }, [session?.user.id, dogId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { tracks, stats, loading, refresh };
}
