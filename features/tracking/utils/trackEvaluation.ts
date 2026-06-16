import type { LegRow } from '@/features/tracking/components/LegBars';

// Abschnitts-Bewertung einer Fährte. Wir haben keine offizielle IGP-Punkte-Tabelle
// im Datenmodell → wir bewerten jeden Abschnitt auf einer 0–10-Qualitätsskala
// (statt erfundene Punktemaxima vorzutäuschen). Der Gesamtscore ist der Mittelwert
// in Prozent (0–100) und wird in `rating` + `track_data` der Session persistiert.

const LEG_MAX = 10;

// Default-Abschnitte aus der realen Fährtenstruktur (Winkel + Gegenstände).
export function defaultLegs(corners: number, articles: number): LegRow[] {
  const legs: LegRow[] = [];
  const sections = Math.max(1, corners + 1);
  for (let i = 0; i < sections; i++) {
    legs.push({ name: `Ausarbeitung Abschnitt ${i + 1}`, score: LEG_MAX, max: LEG_MAX });
    if (i < corners) legs.push({ name: `${i + 1}. Winkel`, score: LEG_MAX, max: LEG_MAX });
  }
  if (articles > 0) legs.push({ name: 'Gegenstände', score: LEG_MAX, max: LEG_MAX });
  return legs;
}

// Gespeicherte Legs laden oder Defaults erzeugen.
export function legsFromSession(
  trackData: any, corners: number, articles: number,
): LegRow[] {
  const saved = trackData?.legs;
  if (Array.isArray(saved) && saved.length > 0
    && saved.every((l: any) => typeof l?.name === 'string' && typeof l?.score === 'number' && typeof l?.max === 'number')) {
    return saved as LegRow[];
  }
  return defaultLegs(corners, articles);
}

// Gesamtscore (0–100) aus den Abschnitten.
export function overallScore(legs: LegRow[]): number {
  const maxSum = legs.reduce((a, b) => a + b.max, 0);
  if (maxSum === 0) return 0;
  const sum = legs.reduce((a, b) => a + b.score, 0);
  return Math.round((sum / maxSum) * 100);
}

// Verbale Bewertung gemäß IGP-Notenstufen.
export function scoreVerdict(score: number): { headline: string; sub: string } {
  if (score >= 96) return { headline: 'VORZÜG-\nLICH.', sub: 'Vorzüglich' };
  if (score >= 90) return { headline: 'SEHR\nGUT.', sub: 'Sehr gut' };
  if (score >= 80) return { headline: 'GUT.', sub: 'Gut' };
  if (score >= 70) return { headline: 'BEFRIE-\nDIGEND.', sub: 'Befriedigend' };
  if (score > 0)   return { headline: 'MANGEL-\nHAFT.', sub: 'Mangelhaft' };
  return { headline: 'OFFEN.', sub: 'Noch nicht bewertet' };
}

// #hashtags aus dem Notiztext extrahieren (für die Tag-Chips).
export function extractTags(notes: string | null | undefined): string[] {
  if (!notes) return [];
  return Array.from(new Set((notes.match(/#[\wäöüÄÖÜß]+/g) ?? []).map(t => t.toLowerCase())));
}
