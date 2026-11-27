import { readFileSync } from 'fs';
import { join } from 'path';

// Vertrag Lege-Screen ↔ Anleitung «Erste Fährte»: Solange das Panel eines
// laufenden oder geplanten Abschnitts sichtbar ist, liegt die Anleitung nicht
// darüber, damit «Stoppen» und «Abbrechen» des Abschnitts bedienbar bleiben.
describe('legen.tsx — Anleitung erste Fährte weicht dem Abschnitts-Panel', () => {
  const legen = readFileSync(join(__dirname, '..', 'legen.tsx'), 'utf8');

  it('Abschnitts-Panel und Anleitung schliessen sich aus', () => {
    expect(legen).toContain("{phase === 'recording' && activeSegment && (");
    expect(legen).toContain("{phase === 'recording' && layGuide.active && !activeSegment && !gsPicker && !winkelSheet && !pocketLock && !rainMode && (");
  });
});
