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
import { normalizeSearchEndDiagnostics, type QaSearchDiagnostics } from '@/features/tracking/utils/qaSearchCapture';
import { assertDiagnosticProvenance, isProvenanceUpdatePath, type DiagnosticProvenance } from './diagnosticProvenance';

/**
 * Not-Aus für den Support-Capture (z. B. falls ein Performance-Problem im Feld auftaucht).
 * Standard: AN — normale Kunden brauchen keinen Schalter.
 */
export const SUPPORT_DIAGNOSTICS_CAPTURE = true;
export const isSupportCaptureEnabled = (): boolean => SUPPORT_DIAGNOSTICS_CAPTURE;

export type SupportExport = Omit<QaTrackExport, 'sessionId' | 'recordingEvidence' | 'backgroundLayDiagnosticsStatus'> & {
  exportType: 'support';
  /** v2.18: observed phase history is distinct from the current exporting installation. */
  provenance?: DiagnosticProvenance;
};

export function attachSupportProvenance<T extends SupportExport>(exported: T, provenance: DiagnosticProvenance): T {
  const enriched = { ...exported, schemaMinor: Math.max(exported.schemaMinor ?? 0, 18) as SupportExport['schemaMinor'], provenance };
  assertSupportPrivacy(enriched);
  return enriched;
}

/** Schlüsselnamen, die in einem Kunden-Export NIE vorkommen dürfen (Vergleich ohne Gross/Klein, ohne _ und -). */
export const SUPPORT_FORBIDDEN_KEYS = [
  'latitude', 'longitude', 'lat', 'lon', 'lng',
  'email', 'userid', 'accountid', 'ownerid', 'sessionid', 'dogid', 'dogname', 'ownername',
  'accesstoken', 'refreshtoken', 'authtoken', 'token', 'deviceid', 'pushtoken', 'ip', 'ipaddress',
  'recordingevidence',
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
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'provenance'))
    assertDiagnosticProvenance((value as Record<string, unknown>).provenance);
  visitSupportPrivacy(value, path, []);
}

function visitSupportPrivacy(value: unknown, path: string, keys: (string | number)[]): void {
  if (value == null) return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Math.abs(value) >= EPOCH_LIKE) throw new Error(`Support-Export enthält einen absoluten Zeitwert bei ${path}`);
    return;
  }
  if (typeof value === 'string') {
    if (ISO_DATE.test(value)) throw new Error(`Support-Export enthält ein Datum bei ${path}`);
    if (EMAIL_LIKE.test(value)) throw new Error(`Support-Export enthält eine E-Mail bei ${path}`);
    if (UUID_LIKE.test(value) && !isProvenanceUpdatePath(keys)) throw new Error(`Support-Export enthält eine ID bei ${path}`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((v, i) => visitSupportPrivacy(v, `${path}[${i}]`, [...keys, i])); return; }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN.has(normalizeKey(k))) throw new Error(`Support-Export enthält unerlaubtes Feld ${k} bei ${path}`);
      visitSupportPrivacy(v, `${path}.${k}`, [...keys, k]);
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
  if (d.end) copy.end = normalizeSearchEndDiagnostics(d.end);
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
  // Local capture context is not a new unrestricted UUID-bearing subtree in the support JSON.
  const { recordingContext: _context, ...supportSearch } = toSupportCapture(search);
  void _context;
  const full = buildQaTrackExport('support', points as RawLayPoint[], markers as RawTrackMarker[], null, supportSearch);
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
