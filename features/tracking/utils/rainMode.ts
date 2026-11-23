// Regenmodus beim Legen: reine Hilfsfunktionen (keine Aufnahme-/Speicherlogik).

/** Haltedauer der grossen Regenmodus-Tasten. Kurze Berührungen (Regentropfen)
 *  lösen nichts aus. Startwert, im Feld zu bestätigen. */
export const RAIN_HOLD_MS = 500;

/** WMO-Wettercode (Open-Meteo) meldet Niederschlag als Regen: Niesel (51–57),
 *  Regen (61–67), Regenschauer (80–82), Gewitter (95–99). Schnee zählt nicht. */
export function isRainyWeatherCode(code: number | null | undefined): boolean {
  if (typeof code !== 'number' || !Number.isFinite(code)) return false;
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
}
