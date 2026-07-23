import type { SessionStatus } from '@/features/tracking/store/trackingStore';
import { getGpsQuality } from '@/features/tracking/utils/gpsFilter';

// ──────────────────────────────────────────────────────────────────────────
// Aktive-Fährten-Registry — REINE, testbare Logik (kein React/Expo/Native).
//
// Kernidee der Überarbeitung: Eine aktive Fährte gehört einem HUND (dog_id),
// nicht einem Screen. Diese Registry ist die lokale Quelle der Wahrheit dafür,
// welche Hunde gerade eine offene Fährte haben und in welchem Zustand. Sie ist
// entkoppelt vom bildschirm-gebundenen Aufnahme-Store (trackingStore) und
// überlebt Navigation, App-Neustart und Hundewechsel.
//
// dog_id ist der EINZIGE Schlüssel. Es wird KEINE zweite Hundestruktur angelegt —
// die dog_id stammt aus den bestehenden Hundeprofilen (dogs / useDogs).
// ──────────────────────────────────────────────────────────────────────────

// Wetter-Snapshot: EINMALIG beim Legen erfasst (keine Live-Aktualisierung).
export interface FaehrteWeather {
  temperature: number | null;   // °C
  windSpeed:   number | null;   // km/h
  humidity:    number | null;   // %
  condition:   string | null;   // deutsche Wetterlage (deckt Bewölkung/Niederschlag ab)
}

export interface ActiveFaehrte {
  dogId:           string;               // bestehende dogs.id — einzige Zuordnung
  sessionId:       string | null;        // training_sessions.id (null solange offline)
  runId:           string | null;        // track_runs.id (nur während der Absuche)
  status:          SessionStatus;        // laying | laid | resting | searching | completed | cancelled
  startedAt:       number | null;        // ms: Beginn der Aufnahme („Start"-Uhrzeit)
  layStartedAt:    number | null;        // ms: Beginn der Liegezeit (resting)
  searchStartedAt: number | null;        // ms: Beginn der Absuche (searching)
  distanceMeters:  number;               // Kennzahl der gelegten Fährte
  winkelCount:     number;
  objektCount:     number;
  gpsAccuracy:     number | null;        // m: letzte GPS-Genauigkeit (nur vorhandene Daten)
  weather:         FaehrteWeather | null;// Snapshot beim Legen
  updatedAt:       number;               // ms: letzte Aktualisierung (Sortierung/Reconcile)
}

export type ActiveFaehrtenMap = Record<string, ActiveFaehrte>;

// „Offene" Zustände bleiben in der Registry; abgeschlossene/abgebrochene werden
// entfernt. So kann pro Hund höchstens EINE offene Fährte existieren.
const OPEN_STATUSES: SessionStatus[] = ['laying', 'laid', 'resting', 'searching'];

export function isOpenStatus(status: SessionStatus | null | undefined): boolean {
  return status != null && OPEN_STATUSES.includes(status);
}

// Regel 2/4: Besitzt dieser Hund bereits eine AKTIVE (offene) Fährte?
export function hasActiveFaehrte(map: ActiveFaehrtenMap, dogId: string | null | undefined): boolean {
  return !!dogId && isValidEntry(map[dogId]);
}

// Regel 4: Entscheidung beim Versuch, eine neue Fährte zu starten.
//   'start'    → keine aktive Fährte → normal starten
//   'conflict' → aktive Fährte existiert → Dialog (fortsetzen/abbrechen), KEINE zweite
export function startDecision(map: ActiveFaehrtenMap, dogId: string | null | undefined): 'start' | 'conflict' {
  return hasActiveFaehrte(map, dogId) ? 'conflict' : 'start';
}

// Ein Registry-Eintrag ist gültig, wenn er einer dog_id zugeordnet und offen ist.
export function isValidEntry(e: Partial<ActiveFaehrte> | null | undefined): e is ActiveFaehrte {
  return !!e && typeof e.dogId === 'string' && e.dogId.length > 0 && isOpenStatus(e.status as SessionStatus);
}

// Registry-Reducer (rein): fügt einen Eintrag pro dog_id ein/aktualisiert ihn.
// Nicht-offene Status entfernen den Eintrag (z. B. completed/cancelled).
export function upsertEntry(map: ActiveFaehrtenMap, dogId: string, patch: Partial<ActiveFaehrte>): ActiveFaehrtenMap {
  if (!dogId) return map;
  const status = (patch.status ?? map[dogId]?.status) as SessionStatus | undefined;
  if (status && !isOpenStatus(status)) return removeEntry(map, dogId);

  const prev = map[dogId];
  const next: ActiveFaehrte = {
    dogId,
    sessionId:       patch.sessionId       ?? prev?.sessionId       ?? null,
    runId:           patch.runId           ?? prev?.runId           ?? null,
    status:          (status ?? 'laid') as SessionStatus,
    startedAt:       patch.startedAt       ?? prev?.startedAt       ?? null,
    layStartedAt:    patch.layStartedAt    ?? prev?.layStartedAt    ?? null,
    searchStartedAt: patch.searchStartedAt ?? prev?.searchStartedAt ?? null,
    distanceMeters:  patch.distanceMeters  ?? prev?.distanceMeters  ?? 0,
    winkelCount:     patch.winkelCount      ?? prev?.winkelCount     ?? 0,
    objektCount:     patch.objektCount      ?? prev?.objektCount     ?? 0,
    // gpsAccuracy darf explizit auf null zurückgesetzt werden (kein ??-Merge):
    gpsAccuracy:     'gpsAccuracy' in patch ? (patch.gpsAccuracy ?? null) : (prev?.gpsAccuracy ?? null),
    weather:         patch.weather         ?? prev?.weather         ?? null,
    updatedAt:       patch.updatedAt        ?? Date.now(),
  };
  return { ...map, [dogId]: next };
}

export function removeEntry(map: ActiveFaehrtenMap, dogId: string): ActiveFaehrtenMap {
  if (!map[dogId]) return map;
  const next = { ...map };
  delete next[dogId];
  return next;
}

// Legacy-/Fremdeinträge defensiv säubern (unbekannte/leere dog_id, nicht offen).
export function sanitizeMap(raw: unknown): ActiveFaehrtenMap {
  if (!raw || typeof raw !== 'object') return {};
  const out: ActiveFaehrtenMap = {};
  for (const [dogId, e] of Object.entries(raw as Record<string, unknown>)) {
    const entry = e as ActiveFaehrte;
    if (isValidEntry(entry) && entry.dogId === dogId) out[dogId] = entry;
  }
  return out;
}

// Reconcile mit dem Serverzustand: nur Einträge behalten, deren Hund weiterhin
// existiert. Verhindert „Geister-Fährten" für gelöschte Hunde. Kein Netz nötig.
export function reconcileWithDogs(map: ActiveFaehrtenMap, existingDogIds: string[]): ActiveFaehrtenMap {
  const set = new Set(existingDogIds);
  const out: ActiveFaehrtenMap = {};
  for (const [dogId, e] of Object.entries(map)) if (set.has(dogId)) out[dogId] = e;
  return out;
}

// Sortierung für Listen (Logbuch/Global) — Regel 7: recording (laying) zuerst,
// dann searching, dann resting; danach nach zuletzt aktualisiert (neueste zuerst).
const STATUS_ORDER: Record<SessionStatus, number> = {
  laying: 0, searching: 1, resting: 2, laid: 3, completed: 9, cancelled: 9,
};
export function sortActive(list: ActiveFaehrte[]): ActiveFaehrte[] {
  return [...list].sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5);
    return s !== 0 ? s : b.updatedAt - a.updatedAt;
  });
}

// Verstrichene Zeit (Sekunden) für die Anzeige — zeitstempelbasiert, ohne
// laufende Timer (Liegezeit reift auch im Hintergrund korrekt weiter).
export function faehrteElapsedSeconds(e: ActiveFaehrte, now: number): number {
  const base = e.status === 'searching' ? e.searchStartedAt
    : e.status === 'laying' ? e.startedAt
    : e.layStartedAt;
  if (base == null) return 0;
  return Math.max(0, Math.floor((now - base) / 1000));
}

// Route-Ziel zum Wiederöffnen einer Fährte — abhängig vom Zustand. Immer mit
// dogId, damit der Zielscreen den richtigen Hund rehydrieren kann.
export function reopenTarget(e: ActiveFaehrte): string {
  const q = (extra: string) => `dogId=${e.dogId}${e.sessionId ? `&id=${e.sessionId}` : ''}${extra}`;
  switch (e.status) {
    case 'searching': return `/track/run?${q('')}`;
    case 'resting':
    case 'laid':      return `/track/liegen?${q('')}`;
    case 'laying':    return `/track/legen?${q('')}`;
    default:          return `/track?${q('')}`;
  }
}

// Kurzlabel für Karten/Listen (Live-Status). recording = laying.
export function statusLabel(status: SessionStatus): string {
  switch (status) {
    case 'laying':    return 'Aufnahme läuft';
    case 'searching': return 'Suche läuft';
    case 'resting':   return 'Fährte liegt';
    case 'laid':      return 'Fährte gelegt';
    case 'completed': return 'Abgeschlossen';
    case 'cancelled': return 'Abgebrochen';
    default:          return 'Aktiv';
  }
}

// Farbton des Status-Badges. Der konkrete Theme-Token wird in der UI aufgelöst
// (Modell bleibt frei von Farben): recording=grün, searching=blau, resting=orange,
// completed/neutral=grau.
export type StatusTone = 'recording' | 'searching' | 'resting' | 'completed' | 'neutral';
export function statusTone(status: SessionStatus): StatusTone {
  switch (status) {
    case 'laying':    return 'recording';
    case 'searching': return 'searching';
    case 'resting':   return 'resting';
    case 'laid':      return 'resting';
    case 'completed': return 'completed';
    default:          return 'neutral';
  }
}

// GPS-Qualität als Label — NUR aus vorhandener Genauigkeit (keine neue Engine).
// Ohne Daten → „—". Schwellen aus getGpsQuality (≤3 sehr gut, ≤7 gut, ≤15 mittel).
export function gpsQualityLabel(accuracy: number | null | undefined): string {
  if (accuracy == null) return '—';
  const q = getGpsQuality(accuracy);
  switch (q) {
    case 'sehr-gut': return 'Sehr gut';
    case 'gut':      return 'Gut';
    case 'mittel':   return 'Mittel';
    default:         return 'Schlecht';
  }
}

// Uhrzeit HH:MM eines Zeitstempels (für „Start 09:12"). Leer, wenn unbekannt.
export function fmtClockOfDay(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Kompakte Wetterzeile für Karten/Listen. Null-sicher; leer, wenn kein Snapshot.
export function weatherLine(w: FaehrteWeather | null | undefined): string | null {
  if (!w) return null;
  const parts = [
    w.temperature != null ? `${Math.round(w.temperature)}°C` : null,
    w.windSpeed   != null ? `Wind ${Math.round(w.windSpeed)} km/h` : null,
    w.condition   ?? null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
