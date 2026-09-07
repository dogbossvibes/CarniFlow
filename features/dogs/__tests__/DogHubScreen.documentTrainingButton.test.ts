// Neuer vollbreiter "Training dokumentieren"-Button auf dem Hundedetail-Screen,
// direkt oberhalb von "Alle Trainings anzeigen" — exakt dieselbe Card/Höhe/
// Radius/Typografie/Abstände (dasselbe s.journalLink-Style-Objekt), Chevron
// rechts, mintfarbenes Icon links (C.trackPrimary, wie der Journal-Button).
// Reiner Quelltext-Test (kein Render), analog zum bewährten Muster in
// app/track/__tests__/tracking-ux-safety.test.ts — vermeidet den schweren
// DogHubScreen-Render-Aufbau (Dogs-/Hub-Store-Abhängigkeiten) für eine reine
// Verdrahtungs-/Layout-Prüfung.
import { readFileSync } from 'fs';

const hub = readFileSync('features/dogs/DogHubScreen.tsx', 'utf8');
const dogDetail = readFileSync('app/dog/[id].tsx', 'utf8');

describe('DogHubScreen — "Training dokumentieren"-Button', () => {
  it('nutzt exakt dasselbe Card-Style wie "Alle Trainings anzeigen" (s.journalLink)', () => {
    const matches = hub.match(/style=\{s\.journalLink\}/g) ?? [];
    // Genau zwei Verwendungen: der neue Button + der bestehende Journal-Button —
    // keine dritte, abweichende Kachel/Designsprache.
    expect(matches.length).toBe(2);
  });

  it('steht direkt oberhalb von "Alle Trainings anzeigen" (Quelltext-Reihenfolge)', () => {
    // Eindeutige Anker: das Journal-Textlabel kommt nur EINMAL als Text vor
    // (die frühere DogRecentCard-Verwendung im Overview-Tab übergibt nur die
    // Callback-Prop, rendert den Text nicht selbst).
    const docBtnIdx = hub.indexOf("t('training.documentTraining')");
    const journalTextIdx = hub.indexOf("t('journal.allTrainings')", docBtnIdx);
    expect(docBtnIdx).toBeGreaterThan(-1);
    expect(journalTextIdx).toBeGreaterThan(-1);
    expect(docBtnIdx).toBeLessThan(journalTextIdx);
  });

  it('verwendet den bestehenden i18n-Key (kein neuer Text) und mintfarbenes Dokument-Icon links, Chevron rechts', () => {
    const start = hub.indexOf('actions.onOpenDocumentTraining && (');
    const end = hub.indexOf('actions.onOpenJournal && (', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = hub.slice(start, end);
    expect(block).toContain("t('training.documentTraining')");
    expect(block).toContain('name="create-outline"');
    expect(block).toContain('color={C.trackPrimary}');
    expect(block).toContain('name="chevron-forward"');
    expect(block).toContain('color={C.trackTextMut}');
  });

  it('keine zusätzliche Schnellstart-Kachel eingeführt (DogQuickActions unverändert, keine neue Kachel-Komponente)', () => {
    expect(hub.match(/<DogQuickActions\b/g) ?? []).toHaveLength(1);
    expect(hub).not.toContain('QuickActionTile');
    expect(hub).not.toContain('DocumentTrainingTile');
  });

  it('Tap öffnet den bestehenden Training-dokumentieren-Flow (/unit/document) mit vorausgewähltem Hund', () => {
    expect(dogDetail).toMatch(
      /onOpenDocumentTraining:\s*\(\) => router\.push\(\{ pathname: '\/unit\/document', params: \{ dogId: id \} \} as never\)/,
    );
    // Keine neue Route/Komponente — derselbe Screen wie beim bestehenden
    // Dokumentieren-Einstieg (app/unit/document.tsx akzeptiert dogId bereits).
    const documentScreen = readFileSync('app/unit/document.tsx', 'utf8');
    expect(documentScreen).toContain('dogId: dogIdParam');
    expect(documentScreen).toContain('dogIdParam ?? (dogs.length === 1 ? dogs[0].id : null)');
  });
});
