// «Fährten gemeinsam» ist in der Fährten-Übersicht durch das Gruppentraining abgelöst.
// Das Öffnen einer empfangenen Fährten-Datei muss trotzdem erreichbar bleiben (heute nur
// über den Austausch-Bildschirm /track/share): neu über die Gruppentraining-Übersicht.
// Teilen/Verleitung je Fährte bleibt in der Fährten-Detailansicht.
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Einstieg «Empfangene Fährten-Datei öffnen»', () => {
  it('Fährten-Übersicht zeigt die Karte «Fährten gemeinsam» nicht mehr', () => {
    expect(read('app/track/index.tsx')).not.toMatch(/ExchangeEntry/);
  });

  it('Gruppentraining öffnet den Austausch-Bildschirm mit Datei-Import', () => {
    const src = read('features/training-groups/GroupsOverviewScreen.tsx');
    expect(src).toMatch(/t\('groups\.openTrackFile'\)/);
    expect(src).toMatch(/router\.push\('\/track\/share' as never\)/);
  });

  it('Detailansicht einer Fährte behält Teilen/Verleitung', () => {
    expect(read('app/track/[id].tsx')).toMatch(/<ExchangeEntry sourceId=/);
  });

  it.each(['i18n/de-CH.ts', 'i18n/gsw-CH.ts', 'i18n/locales/en.ts', 'i18n/locales/fr.ts', 'i18n/locales/it.ts'])(
    'Texte vorhanden in %s', (file) => {
      const src = read(file);
      expect(src).toMatch(/"groups\.openTrackFile": "/);
      expect(src).toMatch(/"groups\.openTrackFileHint": "/);
    });
});
