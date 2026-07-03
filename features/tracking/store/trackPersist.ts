import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MarkerSample, TrackPointSample, StartAnchor } from '@/features/tracking/store/trackingStore';

// Lokaler Puffer der laufenden Aufnahme — schützt vor Datenverlust bei
// Crash/Verbindungsabbruch im Feld. Beim erfolgreichen Speichern geleert.
const KEY = 'anyvo_track_pending_v1';

export interface PendingTrack {
  sessionId:       string | null;
  trackPoints:     TrackPointSample[];
  markers:         MarkerSample[];
  runPoints:       TrackPointSample[];
  distanceMeters:  number;
  durationSeconds: number;
  layFinishedAt:   number | null;   // ms: „Fertig gelegt" → überlebt die Liegezeit, auch wenn die App gekillt wird
  startAnchor:     StartAnchor | null;   // stabilisierter Startpunkt (lokale Metadaten, keine DB-Migration nötig)
  savedAt:         number;
}

let timer: ReturnType<typeof setTimeout> | null = null;

// Entprellt (max. alle 4 s schreiben), damit häufige GPS-Fixes nicht spammen.
export function schedulePersist(snapshot: () => PendingTrack) {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    try { await AsyncStorage.setItem(KEY, JSON.stringify(snapshot())); } catch { /* best-effort */ }
  }, 4000);
}

export async function loadPending(): Promise<PendingTrack | null> {
  try { const raw = await AsyncStorage.getItem(KEY); return raw ? JSON.parse(raw) as PendingTrack : null; }
  catch { return null; }
}

export async function clearPending(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  try { await AsyncStorage.removeItem(KEY); } catch { /* best-effort */ }
}

// TODO(P3+): „Aufnahme fortsetzen?"-Dialog beim App-Start, wenn loadPending()
// eine unbeendete Session liefert. TODO: Server-Sync nachgelagert, falls beim
// Beenden offline → Pending behalten und bei Reconnect hochladen.
