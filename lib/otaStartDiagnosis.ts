// Diagnose der OTA-Startprüfung (lib/otaStartCheck.ts): Grund und Zeitpunkt der LETZTEN
// Startentscheidung, lokal in AsyncStorage. Nur ein Eintrag, keine personenbezogenen Daten
// (keine Hunde-/Session-IDs, keine Orte), nur Codes, Zähler und Zeitangaben.
// Wird im Profil im Versionsblock angezeigt. Ändert nichts am Ablauf der Startprüfung.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TranslationKey } from '@/i18n';
import type { LateInfo, ProtectReason, StartCheckReason, StartCheckResult } from '@/lib/otaStartCheck';

export const OTA_START_DIAGNOSIS_KEY = 'anyvo_ota_startcheck_last_v1';

/** Zusätzliche Gründe, die nur das Gate kennt. */
export type DiagnosisReason = StartCheckReason | 'reload_failed' | 'reloaded_ok';

export interface StartDiagnosis {
  v: 1;
  at: number;                  // ms, Zeitpunkt der Entscheidung
  reason: DiagnosisReason;
  protect?: ProtectReason;     // bei 'protected' und 'pending_hint'
  detail?: string;             // kurzer technischer Code (z. B. «1×cancelled·12d»)
  ms?: number;                 // Dauer bis zur Entscheidung
  late?: LateInfo;             // nach Timeout: wann/wie die Start-Phase später endete
}

const REASONS: readonly DiagnosisReason[] = [
  'disabled', 'restarted', 'protected', 'check_timeout', 'no_update', 'fetch_timeout', 'fetch_failed',
  'reloaded', 'pending_hint', 'error', 'reload_failed', 'reloaded_ok',
];
const PROTECTS: readonly ProtectReason[] = ['background', 'location_task', 'laying_searching', 'pending_buffer', 'timeout', 'error'];

/** Aus dem Ergebnis der Startprüfung einen Eintrag bauen. */
export function diagnosisFromResult(r: StartCheckResult, at: number): StartDiagnosis {
  return {
    v: 1, at, reason: r.reason, ms: r.elapsedMs,
    ...(r.protection ? { protect: r.protection.reason } : {}),
    ...(r.protection?.detail ? { detail: r.protection.detail.slice(0, 60) } : {}),
  };
}

function parse(raw: string | null): StartDiagnosis | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<StartDiagnosis>;
    if (d?.v !== 1 || typeof d.at !== 'number' || !Number.isFinite(d.at) || !REASONS.includes(d.reason as DiagnosisReason)) return null;
    if (d.protect != null && !PROTECTS.includes(d.protect)) return null;
    return d as StartDiagnosis;
  } catch { return null; }
}

export async function loadStartDiagnosis(): Promise<StartDiagnosis | null> {
  try { return parse(await AsyncStorage.getItem(OTA_START_DIAGNOSIS_KEY)); } catch { return null; }
}

/**
 * Speichert den neuen Eintrag (ersetzt den alten). Nach einem erfolgreichen OTA-Neustart
 * meldet der neue JS-Start 'restarted'; folgt das direkt auf 'reloaded', wird daraus
 * 'reloaded_ok' (der Neustart hat gegriffen), damit der Befund nicht verloren geht.
 */
export async function saveStartDiagnosis(next: StartDiagnosis): Promise<void> {
  try {
    let entry = next;
    if (next.reason === 'restarted') {
      const prev = await loadStartDiagnosis();
      if (prev?.reason === 'reloaded') entry = { ...prev, reason: 'reloaded_ok' };
      else if (prev?.reason === 'reloaded_ok') return;   // weitere JS-Neustarts überschreiben den Befund nicht
    }
    await AsyncStorage.setItem(OTA_START_DIAGNOSIS_KEY, JSON.stringify(entry));
  } catch { /* nur Diagnose */ }
}

/** Ergänzt den gespeicherten Eintrag um den späten Ausgang (nur wenn er noch derselbe ist). */
export async function addLateInfo(at: number, late: LateInfo): Promise<void> {
  try {
    const prev = await loadStartDiagnosis();
    if (!prev || prev.at !== at) return;
    await AsyncStorage.setItem(OTA_START_DIAGNOSIS_KEY, JSON.stringify({ ...prev, late }));
  } catch { /* nur Diagnose */ }
}

const REASON_KEY: Record<DiagnosisReason, TranslationKey> = {
  disabled: 'updates.startCheck.disabled',
  restarted: 'updates.startCheck.restarted',
  protected: 'updates.startCheck.protected',
  check_timeout: 'updates.startCheck.checkTimeout',
  no_update: 'updates.startCheck.noUpdate',
  fetch_timeout: 'updates.startCheck.fetchTimeout',
  fetch_failed: 'updates.startCheck.fetchFailed',
  reloaded: 'updates.startCheck.reloaded',
  pending_hint: 'updates.startCheck.pendingHint',
  error: 'updates.startCheck.error',
  reload_failed: 'updates.startCheck.reloadFailed',
  reloaded_ok: 'updates.startCheck.reloadedOk',
};
const PROTECT_KEY: Record<ProtectReason, TranslationKey> = {
  background: 'updates.startCheck.protectBackground',
  location_task: 'updates.startCheck.protectLocationTask',
  laying_searching: 'updates.startCheck.protectLayingSearching',
  pending_buffer: 'updates.startCheck.protectPendingBuffer',
  timeout: 'updates.startCheck.protectTimeout',
  error: 'updates.startCheck.protectError',
};

type T = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Alle Textschlüssel der Anzeige (für den Sprachtest). */
export const START_DIAGNOSIS_TEXT_KEYS: readonly TranslationKey[] = [
  'updates.startCheck.line', 'updates.startCheck.lateReady', 'updates.startCheck.lateNone',
  ...Object.values(REASON_KEY), ...Object.values(PROTECT_KEY),
];

/** Zeile im Profil, z. B. «Letzte Startprüfung: 26.11. 07:00 · übersprungen (Aufnahme-Schutz: …)». */
export function formatStartDiagnosis(d: StartDiagnosis, t: T, dateLocale: string): { line: string; detail: string | null } {
  let date: string;
  try {
    date = new Date(d.at).toLocaleString(dateLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { date = new Date(d.at).toISOString().slice(5, 16).replace('T', ' '); }
  const protect = d.protect ? t(PROTECT_KEY[d.protect]) : '';
  let result = t(REASON_KEY[d.reason], { protect });
  if (d.late) {
    const value = Math.max(0, Math.round(d.late.afterMs / 100) / 10);
    let seconds: string;
    try { seconds = value.toLocaleString(dateLocale); } catch { seconds = String(value); }
    result += ` · ${t(d.late.phase === 'ready' ? 'updates.startCheck.lateReady' : 'updates.startCheck.lateNone', { seconds })}`;
  }
  const tech = [d.detail, typeof d.ms === 'number' ? `${Math.round(d.ms)} ms` : null].filter(Boolean).join(' · ');
  return { line: t('updates.startCheck.line', { date, result }), detail: tech || null };
}
