// Support-Diagnose für normale Kunden (privacy-reduced, nur lokal).
//
// DATENFLUSS — Einbahnstrasse:
//     Production Tracking  ──►  Support-Diagnose        (erlaubt)
//     Support-Diagnose     ──►  Production Tracking      (verboten, nie)
// Dieses Modul liest nichts aus dem Tracking und gibt nichts an das Tracking zurück: es
// formt ausschliesslich bereits aufgezeichnete, schon relative Beobachtungsdaten in einen
// teilbaren Export um. Der Capture selbst ist dieselbe rein beobachtende Search-Telemetrie
// wie im QA-Modus (qaSearchCapture.ts), nur auf Minimal-Umfang (`captureLevel: 'support'`).
//
// Der interne QA-Modus (qaDiagnosticsMode.ts, profiles.is_internal_tester) bleibt getrennt
// und unverändert; er wird NICHT global eingeschaltet.
import {
  buildQaTrackExport, assertNoAbsoluteData, type QaTrackExport, type RawLayPoint, type RawTrackMarker,
} from '@/features/tracking/utils/qaTrackExport';
import type { QaSearchDiagnostics } from '@/features/tracking/utils/qaSearchCapture';

/**
 * Not-Aus für den Support-Capture (z. B. falls ein Performance-Problem im Feld auftaucht).
 * Standard: AN — normale Kunden brauchen keinen Schalter.
 */
export const SUPPORT_DIAGNOSTICS_CAPTURE = true;
export const isSupportCaptureEnabled = (): boolean => SUPPORT_DIAGNOSTICS_CAPTURE;

export type SupportExport = Omit<QaTrackExport, 'sessionId'> & { exportType: 'support' };

/** Schlüsselnamen, die in einem Kunden-Export NIE vorkommen dürfen (Vergleich ohne Gross/Klein, ohne _ und -). */
export const SUPPORT_FORBIDDEN_KEYS = [
  'latitude', 'longitude', 'lat', 'lon', 'lng',
  'email', 'userid', 'accountid', 'ownerid', 'sessionid', 'dogid', 'dogname', 'ownername',
  'accesstoken', 'refreshtoken', 'authtoken', 'token', 'deviceid', 'pushtoken', 'ip', 'ipaddress',
] as const;

const normalizeKey = (k: string) => k.toLowerCase().replace(/[_-]/g, '');
const FORBIDDEN = new Set<string>(SUPPORT_FORBIDDEN_KEYS);
const ISO_DATE = /\d{4}-\d{2}-\d{2}/;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const UUID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** Absolute Unix-Zeitstempel (ms) wären >= 1e12; relative Zeiten einer Fährte bleiben weit darunter. */
const EPOCH_LIKE = 1e11;

/**
 * Wirft, sobald irgendwo im Export ein verbotener Schlüssel, ein ISO-Datum, ein Epoch-Wert,
 * eine E-Mail oder eine UUID auftaucht. Rekursiv über alle Werte — lieber kein Export als ein Leck.
 */
export function assertSupportPrivacy(value: unknown, path = '$'): void {
  if (value == null) return;
  if (typeof value === 'number') {
    if (Math.abs(value) >= EPOCH_LIKE) throw new Error(`Support-Export enthält einen absoluten Zeitwert bei ${path}`);
    return;
  }
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) throw new Error(`Support-Export enthält ein Datum bei ${path}`);
    if (EMAIL_LIKE.test(value)) throw new Error(`Support-Export enthält eine E-Mail bei ${path}`);
    if (UUID_LIKE.test(value)) throw new Error(`Support-Export enthält eine ID bei ${path}`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((v, i) => assertSupportPrivacy(v, `${path}[${i}]`)); return; }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN.has(normalizeKey(k))) throw new Error(`Support-Export enthält unerlaubtes Feld ${k} bei ${path}`);
      assertSupportPrivacy(v, `${path}.${k}`);
    }
  }
}

/** UX-Diagnosen, die nur der interne QA-Modus mitschreibt (Voice, Approach, Ende-Samples, Dwell). */
const QA_ONLY_KEYS = [
  'voiceDiagnostics', 'startApproachDiagnostics', 'approachFixDiagnostics',
  'endEligibilityDiagnostics', 'endConfirmationDiagnostics', 'objectDwellDiagnostics',
] as const;

/**
 * Support-Kopie einer Search-Diagnose: immer derselbe Minimalumfang, egal ob die Session im QA-Modus
 * lief. Entfernt nur die QA-only UX-Diagnosen; Geometrie, Accuracy je Fix, Summary, Cursor, Objekte
 * und Ende-Summary bleiben. Reine Funktion, verändert die Eingabe nicht.
 */
export function toSupportCapture(d: QaSearchDiagnostics): QaSearchDiagnostics {
  const copy: Record<string, unknown> = { ...d };
  for (const k of QA_ONLY_KEYS) delete copy[k];
  return copy as unknown as QaSearchDiagnostics;
}

/** Minimale Formprüfung eines gespeicherten Payloads — korrupte/teilweise Daten werden abgelehnt, nie geworfen. */
export function isUsableSupportCapture(x: unknown): x is QaSearchDiagnostics {
  if (!x || typeof x !== 'object') return false;
  const d = x as Partial<QaSearchDiagnostics>;
  return typeof d.rawSearchPointCount === 'number'
    && !!d.geometry && Array.isArray(d.geometry.raw) && Array.isArray(d.geometry.run) && Array.isArray(d.geometry.replay)
    && !!d.cursor && Array.isArray(d.cursor.samples);
}

/**
 * Baut den teilbaren Export: bestehender privacy-reduced QA-Export (relative x/y/t, Accuracy,
 * Marker) OHNE die (gehashte) Session-ID, markiert als `exportType: 'support'`.
 * Das Schema (schemaVersion/-Minor) kommt unverändert aus der bestehenden Konvention.
 */
export function buildSupportExport(
  points: readonly RawLayPoint[], markers: readonly RawTrackMarker[], search: QaSearchDiagnostics,
): SupportExport {
  // Der Hash dient nur als Platzhalter für den bestehenden Builder und wird sofort wieder entfernt.
  const full = buildQaTrackExport('support', points as RawLayPoint[], markers as RawTrackMarker[], null, search);
  assertNoAbsoluteData(full);
  const { sessionId: _dropped, ...rest } = full;
  void _dropped;
  const out: SupportExport = { exportType: 'support', ...rest };
  assertSupportPrivacy(out);
  return out;
}

export function serializeSupportExport(e: SupportExport): string {
  assertSupportPrivacy(e);
  return JSON.stringify(e);
}

/** `ANYVO-Track-Diagnostics-YYYY-MM-DD.json` — Datum des Teilens, keine Namen, keine IDs. */
export function supportExportFileName(now: Date = new Date()): string {
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `ANYVO-Track-Diagnostics-${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}.json`;
}
