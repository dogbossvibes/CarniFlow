import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSession } from '@/hooks/useSession';
import { getDogById } from '@/services/dogs';
import type { Dog } from '@/types';
import { C } from '@/constants/colors';
import { isTrackOverlayColorKey, resolveTrackOverlayColorKey, trackOverlayColor, type TrackOverlayColorKey } from '@/features/tracking/utils/trackOverlayColors';

/** Refresh on return from the profile editor; never retain another account/dog's color. */
export function useDogTrackColor(dogId: string | null | undefined) {
  const { session } = useSession();
  const userId = session?.user.id;
  const [dog, setDog] = useState<Dog | null>(null);
  const [cached, setCached] = useState<{ userId: string; dogId: string; key: TrackOverlayColorKey | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++generation.current;
    if (!dogId || !userId) { setDog(null); setLoading(false); return; }
    setLoading(true);
    const cacheKey = `anyvo.dogTrackColor.v1::${userId}::${dogId}`;
    try {
      const raw = await AsyncStorage.getItem(cacheKey).catch(() => null);
      if (token !== generation.current) return;
      if (raw) {
        try {
          const value: unknown = JSON.parse(raw);
          if (value === null || isTrackOverlayColorKey(value)) setCached({ userId, dogId, key: value });
        } catch { /* Invalid cache is never treated as a colour. */ }
      }
      const { data } = await getDogById(dogId);
      if (token !== generation.current) return;
      if (data?.id === dogId && data.owner_id === userId) {
        setDog(data);
        const key = isTrackOverlayColorKey(data.track_overlay_color_key) ? data.track_overlay_color_key : null;
        setCached({ userId, dogId, key });
        await AsyncStorage.setItem(cacheKey, JSON.stringify(key)).catch(() => {});
      }
    } catch { /* Keep the last confirmed colour offline. */ }
    finally { if (token === generation.current) setLoading(false); }
  }, [dogId, userId]);
  useFocusEffect(useCallback(() => { void refresh(); return () => { generation.current++; }; }, [refresh]));
  const own = dog && dog.id === dogId && dog.owner_id === userId ? dog : null;
  const cachedKey = cached && cached.userId === userId && cached.dogId === dogId ? cached.key : null;
  const storedKey = own ? (isTrackOverlayColorKey(own.track_overlay_color_key) ? own.track_overlay_color_key : null) : cachedKey;
  const colorKey = dogId ? resolveTrackOverlayColorKey(dogId, storedKey) : null;
  return { dog: own, storedKey, loading, refresh, colorKey, color: colorKey ? trackOverlayColor(colorKey) : C.trackPrimary };
}
