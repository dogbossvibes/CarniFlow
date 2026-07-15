import type { PendingTrack } from '@/features/tracking/store/trackPersist';

// ──────────────────────────────────────────────────────────────────────────
// Reine, testbare Liegezeit-Helfer (P3). Kein React/Expo/Native.
//
// Anyvo-Liegezeit ist ELAPSED-basiert („reifen" der gelegten Fährte, Hochzähler
// bis der Nutzer die Absuche manuell startet) — KEIN Countdown. Daher gibt es kein
// festes layTargetAt/Ablauf; die Anzeige wird stets aus echten Zeitstempeln
// (now − layStartedAt) berechnet, unabhängig von JS-Pausen/Hintergrund.
// ──────────────────────────────────────────────────────────────────────────

// Verstrichene Liegezeit in Sekunden aus Zeitstempeln. Nie negativ; robust gegen
// fehlenden Start und Uhr-Rücksprünge.
export function restingElapsedSeconds(startMs: number | null | undefined, now: number): number {
  if (startMs == null) return 0;
  return Math.max(0, Math.floor((now - startMs) / 1000));
}

// Nur `status === 'resting'` löst die Liegezeit-Recovery aus (analog decideRecovery
// für die Absuche). Legacy-Snapshots ohne Status → false.
export function isRestingRecovery(pending: PendingTrack | null): boolean {
  return pending?.status === 'resting';
}

// Effektiver Liegezeit-Start aus einem Pending-Snapshot (Legacy-Fallback auf
// layFinishedAt). Für Recovery/Timer-Fortsetzung ohne neue Startzeit.
export function restingStartMs(pending: PendingTrack | null): number | null {
  if (!pending) return null;
  return pending.layStartedAt ?? pending.layFinishedAt ?? null;
}
