// Gewählte Zoom-Stufe der Absuche-Karte (T-218). Reine Geräte-Einstellung
// (AsyncStorage), reine Anzeige. Lese-/Schreibfehler fallen still auf «normal» zurück.
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SEARCH_ZOOM_LEVEL, isSearchZoomLevel, type SearchZoomLevel } from '@/features/tracking/utils/searchMapView';

export const SEARCH_ZOOM_STORAGE_KEY = 'track_search_zoom_level';

export function useSearchZoomLevel(): [SearchZoomLevel, (level: SearchZoomLevel) => void] {
  const [level, setLevel] = useState<SearchZoomLevel>(DEFAULT_SEARCH_ZOOM_LEVEL);
  // Eine Wahl, die vor dem Ende des Ladens getroffen wird, darf nicht überschrieben werden.
  const chosenRef = useRef(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(SEARCH_ZOOM_STORAGE_KEY)
      .then(raw => { if (alive && !chosenRef.current && isSearchZoomLevel(raw)) setLevel(raw); })
      .catch(() => { /* Komfort-Einstellung */ });
    return () => { alive = false; };
  }, []);
  const change = useCallback((next: SearchZoomLevel) => {
    chosenRef.current = true;
    setLevel(next);
    AsyncStorage.setItem(SEARCH_ZOOM_STORAGE_KEY, next).catch(() => { /* Komfort-Einstellung */ });
  }, []);
  return [level, change];
}
