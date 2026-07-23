import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MarkerSample, TrackPointSample, StartAnchor, SessionStatus } from '@/features/tracking/store/trackingStore';
import type { TrackSegment } from '@/features/tracking/utils/trackSegments';

// Lokaler Puffer der laufenden Aufnahme — schützt vor Datenverlust bei
// Crash/Verbindungsabbruch im Feld. HUNDEBASIERT: jede dog_id hat ihren eigenen
// Slot (`anyvo_track_pending_v1::<dogId>`). So besitzt jeder Hund seine eigene
// GPS-Route, Marker und Wiederherstellung; mehrere Fährten können gleichzeitig
// liegen, ohne sich zu überschreiben. Ohne dog_id (Legacy/Altdaten) wird der
// frühere Einzel-Slot `anyvo_track_pending_v1` genutzt und beim ersten Zugriff
// automatisch auf den Hund migriert.
const PREFIX     = 'anyvo_track_pending_v1';
const LEGACY_KEY = PREFIX;                    // alter Einzel-Slot (vor der Migration)
const SEP        = '::';

function keyFor(dogId: string | null | undefined): string {
  return dogId ? `${PREFIX}${SEP}${dogId}` : LEGACY_KEY;
}
function isDogKey(k: string): boolean {
  return k.startsWith(`${PREFIX}${SEP}`);
}

export interface PendingTrack {
  sessionId:       string | null;
  dogId?:          string | null;   // Besitzer der Fährte (bestehende dogs.id) — Schlüssel des Slots
  trackPoints:     TrackPointSample[];
  markers:         MarkerSample[];
  segments?:       TrackSegment[];  // Teilstrecken; optional, damit alte Puffer weiter funktionieren
  runPoints:       TrackPointSample[];
  distanceMeters:  number;
  durationSeconds: number;
  layFinishedAt:   number | null;   // ms: „Fertig gelegt" → überlebt die Liegezeit, auch wenn die App gekillt wird
  startAnchor:     StartAnchor | null;   // stabilisierter Startpunkt (lokale Metadaten, keine DB-Migration nötig)
  savedAt:         number;
  // ── P2: Absuche-Recovery (alle optional → Legacy-Snapshots bleiben lesbar) ──
  searchPoints?:     TrackPointSample[];   // Absuche-Spur (Fallback; SQLite ist autoritativ)
  runId?:            string | null;        // track_runs.id (Supabase-Finalisierung)
  status?:           SessionStatus;        // Session-Status; fehlt bei Legacy → nicht 'searching'
  searchStartedAt?:  number | null;        // ms: Start der Absuche (Timer-Fortsetzung)
  searchUpdatedAt?:  number | null;        // ms: letzter akzeptierter Suchpunkt
  // ── P3: Liegezeit (zeitstempelbasiert) ──
  layStartedAt?:     number | null;        // ms: Start der Liegezeit (= Lege-Ende)
  layUpdatedAt?:     number | null;        // ms: letzte relevante Aktualisierung
}

// Entprell-Timer PRO Slot (Schlüssel) — so überschreiben sich gleichzeitig
// gepufferte Hunde nicht gegenseitig.
const timers = new Map<string, ReturnType<typeof setTimeout>>();

async function readKey(key: string): Promise<PendingTrack | null> {
  try { const raw = await AsyncStorage.getItem(key); return raw ? JSON.parse(raw) as PendingTrack : null; }
  catch { return null; }
}

// Entprellt (max. alle 4 s je Slot schreiben), damit häufige GPS-Fixes nicht spammen.
export function schedulePersist(dogId: string | null | undefined, snapshot: () => PendingTrack) {
  const key = keyFor(dogId);
  if (timers.has(key)) return;
  timers.set(key, setTimeout(async () => {
    timers.delete(key);
    try { await AsyncStorage.setItem(key, JSON.stringify(snapshot())); } catch { /* best-effort */ }
  }, 4000));
}

// Sofortiges (nicht entprelltes) Schreiben — für kritische Übergänge (Absuche-
// Start/-Status P2, Liegezeit-Start P3). Bricht einen ausstehenden Debounce
// desselben Slots ab, um Doppelschreiben zu vermeiden. Best-effort.
export async function writePendingNow(dogId: string | null | undefined, snapshot: PendingTrack): Promise<void> {
  const key = keyFor(dogId);
  const tm = timers.get(key);
  if (tm) { clearTimeout(tm); timers.delete(key); }
  try { await AsyncStorage.setItem(key, JSON.stringify(snapshot)); } catch { /* best-effort */ }
}

// Puffer eines Hundes laden. Migration: fehlt der Hunde-Slot, aber ein Legacy-
// Einzel-Slot passt (ohne dogId oder gleiche dogId), wird er einmalig auf den
// Hunde-Slot übernommen. Ohne dogId → Legacy-Slot, sonst der zuletzt gesicherte.
export async function loadPending(dogId?: string | null): Promise<PendingTrack | null> {
  if (dogId) {
    const own = await readKey(keyFor(dogId));
    if (own) return { ...own, dogId };
    const legacy = await readKey(LEGACY_KEY);
    if (legacy && (legacy.dogId == null || legacy.dogId === dogId)) {
      const migrated = { ...legacy, dogId };
      try {
        await AsyncStorage.setItem(keyFor(dogId), JSON.stringify(migrated));
        await AsyncStorage.removeItem(LEGACY_KEY);
      } catch { /* best-effort — Lesen gelingt trotzdem */ }
      return migrated;
    }
    return null;
  }
  // Ohne dogId: zuerst Legacy-Slot (Altdaten), sonst der jüngste Hunde-Slot.
  const legacy = await readKey(LEGACY_KEY);
  if (legacy) return legacy;
  return loadMostRecentPending();
}

// Jüngsten Hunde-Puffer über alle Slots hinweg (Fallback ohne bekannte dogId).
export async function loadMostRecentPending(): Promise<PendingTrack | null> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter(isDogKey);
    if (keys.length === 0) return null;
    const entries = await AsyncStorage.multiGet(keys);
    let best: PendingTrack | null = null;
    for (const [, raw] of entries) {
      if (!raw) continue;
      try {
        const p = JSON.parse(raw) as PendingTrack;
        if (!best || (p.savedAt ?? 0) > (best.savedAt ?? 0)) best = p;
      } catch { /* ignorieren */ }
    }
    return best;
  } catch { return null; }
}

// Alle dog_ids mit offenem Puffer (für Recovery-Übersicht / Registry-Reconcile).
export async function listPendingDogIds(): Promise<string[]> {
  try {
    return (await AsyncStorage.getAllKeys())
      .filter(isDogKey)
      .map(k => k.slice(PREFIX.length + SEP.length))
      .filter(Boolean);
  } catch { return []; }
}

// Puffer eines Hundes leeren (nach erfolgreichem Speichern/Abschluss). Ohne dogId
// wird der Legacy-Slot geleert (Altpfad).
export async function clearPending(dogId?: string | null): Promise<void> {
  const key = keyFor(dogId);
  const tm = timers.get(key);
  if (tm) { clearTimeout(tm); timers.delete(key); }
  try { await AsyncStorage.removeItem(key); } catch { /* best-effort */ }
}

// TODO(P3+): „Aufnahme fortsetzen?"-Dialog beim App-Start, wenn listPendingDogIds()
// unbeendete Sessions liefert. TODO: Server-Sync nachgelagert, falls beim Beenden
// offline → Pending behalten und bei Reconnect hochladen.
