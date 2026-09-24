import { readFileSync } from 'fs';

// Release-Cleanup: app/dog-command/detail.tsx:69 löste react/no-unescaped-entities
// aus (unescapte ASCII-Anführung nach {cmd.verbalCue}). Fix ist rein präsentational
// (typografisches „…“-Anführungszeichenpaar statt ASCII „…") — keine Änderung an
// cmd.verbalCue selbst oder an der umgebenden Command-Logik.
describe('dog-command detail: verbalCue quote (react/no-unescaped-entities fix)', () => {
  const detail = readFileSync('app/dog-command/detail.tsx', 'utf8');

  it('verwendet ein typografisches Anführungszeichenpaar statt einer rohen ASCII-Quote', () => {
    expect(detail).toContain('„{cmd.verbalCue}“');
    expect(detail).not.toMatch(/\{cmd\.verbalCue\}"/);
  });

  it('cmd.verbalCue wird weiterhin unverändert im Signal-Abschnitt gerendert', () => {
    expect(detail).toMatch(/title=\{t\('cmd\.signal'\)\}><Text style=\{s\.body\}>„\{cmd\.verbalCue\}“<\/Text>/);
  });
});
