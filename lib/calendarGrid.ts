// Monatsraster als feste Wochenzeilen (Mo–So).
//
// Hintergrund: Ein Raster mit `width: 14.28%` + `flexWrap: 'wrap'` kann je nach
// Bildschirmbreite durch Rundung in Yoga (float32) die 7. Zelle in die nächste
// Zeile schieben. Dann rutscht der ganze Monat um eine Spalte und Datum und
// Wochentag passen nicht mehr zusammen (iOS und Android). Mit expliziten
// 7er-Zeilen und `flex: 1` pro Zelle kann das nicht passieren.

/** Teilt Monatszellen (mit führenden Leerzellen) in Wochen à 7 Zellen; die letzte Woche wird mit `null` aufgefüllt. */
export function toWeekRows<T>(cells: readonly (T | null)[]): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7);
    while (row.length < 7) row.push(null);
    rows.push(row);
  }
  return rows;
}
