import { localDayKey, toISODate } from '@/features/dogs/dateInput';
// Punktzahl-Ableitung für die Fährten-Übersicht.
// Das Design zeigt eine 0–100-Punktzahl. Unser Model hat (noch) keine eigene
// Punktespalte, aber ein `rating`. Ältere Fährten nutzen 1–5, daher mappen wir
// 1–5 → 0–100; bereits 0–100-Werte werden durchgereicht. Fehlt rating, gibt es
// keinen Score (→ Anzeige "—").

interface ScoreSource {
  rating?:        number | null;
  score?:         number | null;
}

export function trackScore(s: ScoreSource): number | null {
  const raw = s.score ?? s.rating;
  if (raw == null) return null;
  const v = raw <= 5 ? (raw / 5) * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(v)));
}

// Aggregat über mehrere Fährten: Ø-Punkte aus allen mit Score.
export function averageScore(rows: ScoreSource[]): number | null {
  const scores = rows.map(trackScore).filter((x): x is number => x != null);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

// "Serie": Anzahl aufeinanderfolgender Kalendertage (bis heute zurück) mit
// mindestens einer abgeschlossenen Fährte.
export function dayStreak(dates: (string | null | undefined)[]): number {
  // Lokale Kalendertage: ein reines Datum bleibt, ein Zeitstempel zählt zum lokalen Tag
  // (nicht UTC – sonst zählen Fährten zwischen 0 und 1/2 Uhr zum Vortag).
  const days = new Set(dates.map(d => localDayKey(d)).filter((d): d is string => !!d));
  if (days.size === 0) return 0;

  let streak = 0;
  const cursor = new Date();
  // Toleranz: heute ODER gestern als Startpunkt zulassen.
  const today = toISODate(cursor);
  const yesterdayDate = new Date(cursor); yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toISODate(yesterdayDate);
  if (!days.has(today) && !days.has(yesterday)) return 0;
  if (!days.has(today)) cursor.setDate(cursor.getDate() - 1);

  while (days.has(toISODate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
