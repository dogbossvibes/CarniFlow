// "TT.MM.JJJJ" → Date (oder null bei ungültig). Bewusst dependency-frei,
// damit kein nativer Date-Picker nötig ist.
export function parseDeDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// "JJJJ-MM-TT" (ISO-Date) → LOKALES Date. Bewusst NICHT `new Date(iso)`, denn das
// parst als UTC-Mitternacht und springt in UTC-negativen Zonen einen Tag zurück
// (Anzeige/erneutes Speichern via toISODate würde das Datum dann verschieben).
export function fromISODate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Lokaler Kalendertag (JJJJ-MM-TT) zu einem Zeitstempel oder Datum. Ein reines Datum
 * bleibt unverändert; ein ISO-Zeitstempel wird in lokaler Zeit gelesen (nicht `slice(0, 10)`,
 * das wäre UTC und verschiebt Zeiten zwischen 0 und 1/2 Uhr Schweizer Zeit auf den Vortag).
 * Ungültige Werte: null.
 */
export function localDayKey(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : toISODate(d);
}

/** Reines Datum (JJJJ-MM-TT) als lokales Datum lesen; sonst wie `new Date(value)`. Nie UTC-Mitternacht. */
export function parseDay(value: string): Date {
  // Nur ein reines Datum lokal lesen; ein voller Zeitstempel bleibt ein Zeitpunkt.
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? (fromISODate(value) ?? new Date(value)) : new Date(value);
}
