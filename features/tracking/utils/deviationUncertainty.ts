/**
 * Messunsicherheit der Linienabweichung (T-197).
 *
 * Die Abweichung vergleicht zwei unabhängige Handy-GPS-Aufzeichnungen: die
 * gelegte Fährte und die Absuche. Ihr gegenseitiger Versatz erscheint als
 * Abweichung, auch wenn Hund und Hundeführer exakt auf der Fährte waren.
 * Dieser Wert sagt, unterhalb welcher Grössenordnung eine Abweichung nicht
 * sicher von GPS-Versatz zu unterscheiden ist. Er ist eine Anzeigehilfe —
 * er korrigiert weder Geometrie noch Abweichung noch Punktzahl.
 */

/**
 * Anteil der kombinierten gemeldeten Genauigkeit. Im Fährten-Simulator (T-192)
 * lag die tatsächliche Messabweichung der mittleren Linienabweichung mit 0,4
 * in 77 % der Läufe innerhalb dieser Spanne (0,3 → 51 %, 0,5 → 92 %).
 */
export const DEVIATION_UNCERTAINTY_FACTOR = 0.4;

const usable = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

export function medianAccuracyM(values: readonly (number | null | undefined)[]): number | null {
  const sorted = values.filter(usable).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Unsicherheit (m) aus der typischen Genauigkeit der gelegten Referenz und der
 * Absuche. Null, wenn für die Absuche keine Genauigkeit vorliegt — dann wird
 * nichts angezeigt statt einer geratenen Zahl. Fehlt nur die Referenz
 * (ältere Fährten), zählt die Absuche allein; der Wert ist dann eher zu klein.
 */
export function deviationUncertaintyM(referenceAccuracyM: number | null | undefined, searchAccuracyM: number | null | undefined): number | null {
  if (!usable(searchAccuracyM)) return null;
  const combined = Math.hypot(usable(referenceAccuracyM) ? referenceAccuracyM : 0, searchAccuracyM);
  return Math.round(DEVIATION_UNCERTAINTY_FACTOR * combined * 10) / 10;
}
