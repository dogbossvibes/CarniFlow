import type { Dog } from '@/types';

// Pro Hund ein stabiles Avatar-Gradient + Initial + Kurz-Level ableiten.
// Das Design (chrome.jsx Avatar/DogSwitch) nutzt hundespezifische Farben (c1/c2),
// Rasse + Level. Unser Dog-Model hat keine Farben → wir leiten sie deterministisch
// aus der id ab, damit jeder Hund eine eigene, konstante Tönung bekommt.

const PALETTE: [string, string][] = [
  ['#15e6c3', '#0a9e94'],   // mint
  ['#8ad7ff', '#3a7bd1'],   // blau
  ['#ffb547', '#e07b2e'],   // orange
  ['#c79bff', '#7b4dd1'],   // violett
  ['#ff8fb3', '#d14d7b'],   // pink
  ['#9be88a', '#3fa14d'],   // grün
];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface DogVisual {
  c1:      string;
  c2:      string;
  initial: string;
  level:   string;   // erster Titel oder Rasse als Kurz-Label
}

export function dogVisual(dog: Pick<Dog, 'id' | 'name' | 'breed' | 'titles'>): DogVisual {
  const [c1, c2] = PALETTE[hash(dog.id) % PALETTE.length];
  return {
    c1,
    c2,
    initial: (dog.name?.[0] ?? '?').toUpperCase(),
    level:   dog.titles?.[0] ?? dog.breed ?? '—',
  };
}
