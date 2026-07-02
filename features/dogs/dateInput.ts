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
