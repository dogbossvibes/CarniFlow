// QA-Mitschrift der Winkel-Kandidaten einer Fährte (nur Diagnosemodus).
//
// Hält je Kandidat EINE Zeile im Arbeitsspeicher: GPS-Geometrie und — falls
// Core Motion mitläuft — die zugehörige Turn-Evidenz. Damit ist ein
// Screenrecording oder ein kopierter Auszug später nachvollziehbar.
//
// BEWUSST NUR RAM: Roh-Motion-Daten und Kandidaten-Diagnosen werden nicht
// persistiert und nie in eine Produktionssession geschrieben. Beim Start einer
// neuen Aufzeichnung wird der Puffer geleert.

const MAX_LINES = 120;

let lines: string[] = [];
const listeners = new Set<(lines: readonly string[]) => void>();

export function pushQaCandidateLine(line: string): void {
  lines = [...lines, line].slice(-MAX_LINES);
  listeners.forEach(fn => fn(lines));
}

export function getQaCandidateLines(): readonly string[] {
  return lines;
}

export function clearQaCandidateLog(): void {
  if (!lines.length) return;
  lines = [];
  listeners.forEach(fn => fn(lines));
}

export function subscribeQaCandidateLog(fn: (lines: readonly string[]) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Ein zusammenhängender Textblock zum Kopieren/Teilen. */
export function formatQaCandidateLog(): string {
  return lines.join('\n');
}
