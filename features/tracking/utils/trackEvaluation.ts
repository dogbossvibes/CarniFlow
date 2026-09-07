import type { LegRow } from '@/features/tracking/components/LegBars';

// Abschnitts-Bewertung einer Fährte. Wir haben keine offizielle IGP-Punkte-Tabelle
// im Datenmodell → wir bewerten jeden Abschnitt auf einer 0–10-Qualitätsskala
// (statt erfundene Punktemaxima vorzutäuschen). Der Gesamtscore ist der Mittelwert
// in Prozent (0–100) und wird in `rating` + `track_data` der Session persistiert.

const LEG_MAX = 10;

// Root-Cause-Fix (echtes iPhone, Build 43 — "100 Punkte/Vorzüglich trotz 0 m
// Suchspur, 0 Winkel, 0 Teilstrecken"): defaultLegs() setzte JEDEN Abschnitt
// bedingungslos auf den vollen Punktestand (score=max=LEG_MAX) — das
// entspricht der echten IGP-Bewertungskonvention (Punktrichter startet bei
// voller Punktzahl und zieht ab), ist aber FALSCH, wenn die Absuche gar keine
// verwertbare Geometrie erzeugt hat: dann täuscht "voller Punktestand" eine
// automatische Bewertung vor, die nie stattgefunden hat. `hasValidGeometry`
// (Aufrufer: mind. 1 echter Suchpunkt vorhanden) steuert deshalb den
// Ausgangswert: NUR bei einer echten, aufgezeichneten Absuche startet ein
// Abschnitt bei LEG_MAX (normale IGP-Konvention); ohne verwertbare Geometrie
// startet er bei 0 → overallScore()=0 → scoreVerdict(0) liefert bereits
// korrekt "OFFEN"/"Noch nicht bewertet" (bestehender Code, unverändert).
// Eine bereits gespeicherte MANUELLE Bewertung (legsFromSession: `saved`-Zweig)
// bleibt davon komplett unberührt — dieser Fix betrifft ausschliesslich den
// unbenutzten DEFAULT-Zustand vor der ersten manuellen Bewertung.
export function defaultLegs(corners: number, articles: number, hasValidGeometry = true): LegRow[] {
  const startScore = hasValidGeometry ? LEG_MAX : 0;
  const legs: LegRow[] = [];
  const sections = Math.max(1, corners + 1);
  for (let i = 0; i < sections; i++) {
    legs.push({ name: `Ausarbeitung Abschnitt ${i + 1}`, score: startScore, max: LEG_MAX });
    if (i < corners) legs.push({ name: `${i + 1}. Winkel`, score: startScore, max: LEG_MAX });
  }
  if (articles > 0) legs.push({ name: 'Gegenstände', score: startScore, max: LEG_MAX });
  return legs;
}

// Gespeicherte Legs laden oder Defaults erzeugen. `hasValidGeometry` (Default
// true = bisheriges Verhalten für normale, echte Absuchen unverändert) steuert
// NUR den Default-Startwert, siehe defaultLegs().
export function legsFromSession(
  trackData: any, corners: number, articles: number, hasValidGeometry = true,
): LegRow[] {
  const saved = trackData?.legs;
  if (Array.isArray(saved) && saved.length > 0
    && saved.every((l: any) => typeof l?.name === 'string' && typeof l?.score === 'number' && typeof l?.max === 'number')) {
    return saved as LegRow[];
  }
  return defaultLegs(corners, articles, hasValidGeometry);
}

// Gesamtscore (0–100) aus den Abschnitten.
export function overallScore(legs: LegRow[]): number {
  const maxSum = legs.reduce((a, b) => a + b.max, 0);
  if (maxSum === 0) return 0;
  const sum = legs.reduce((a, b) => a + b.score, 0);
  return Math.round((sum / maxSum) * 100);
}

// Verbale Bewertung gemäss IGP-Notenstufen.
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
