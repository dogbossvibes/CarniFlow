// #144: «Verleitung anfragen» ist direkt im Gruppentraining erreichbar (Übersicht und Gruppen-Seite).
// Der ältere Bildschirm «Gruppenfährten» (/track/group-tasks) bleibt mit allen Aufgaben bestehen,
// heisst nur neu «Verleitung in der Gruppe»; «Fährten gemeinsam» heisst neu «Datei und Übergabe».
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('#144 Verleitung im Gruppentraining', () => {
  it('Übersicht: Karte «Verleitung und Dateien» mit beiden Wegen', () => {
    const src = read('features/training-groups/GroupsOverviewScreen.tsx');
    expect(src).toMatch(/t\('groups\.distractionsAndFiles'\)/);
    expect(src).toMatch(/t\('groups\.requestGroupDistraction'\)/);
    expect(src).toMatch(/router\.push\('\/track\/group-tasks' as never\)/);
    expect(src).toMatch(/router\.push\('\/track\/share' as never\)/);
  });

  it('Gruppen-Seite öffnet die Verleitungsaufgaben mit vorausgewählter Gruppe', () => {
    const src = read('features/training-groups/GroupDetailScreen.tsx');
    expect(src).toMatch(/t\('groups\.requestDistraction'\)/);
    expect(src).toMatch(/pathname: '\/track\/group-tasks', params: \{ groupId \}/);
  });

  it('Aufgaben-Bildschirm übernimmt die Gruppe nur, wenn man Mitglied ist, und nur einmal', () => {
    const src = read('features/tracking-exchange/groups/GroupTasksScreen.tsx');
    expect(src).toMatch(/groupId\?:string/);
    expect(src).toMatch(/!groupParamApplied\.current&&list\.groups\.some\(g=>g\.groupId===groupId\)/);
    // Eine Aufgabe (taskId) hat Vorrang vor der Gruppenvorauswahl.
    expect(src).toMatch(/if\(taskId\)\{await show\(await service\.get\(taskId\),guard\);return;\}/);
  });

  it('Route des älteren Bildschirms bleibt bestehen', () => {
    expect(read('app/track/group-tasks.tsx')).toMatch(/GroupTasksScreen/);
    expect(read('features/tracking-exchange/groups/releaseGate.ts')).toMatch(/GROUP_DISTRACTION_RELEASE_READY: boolean = true/);
  });

  it.each(['i18n/de-CH.ts', 'i18n/gsw-CH.ts', 'i18n/locales/en.ts', 'i18n/locales/fr.ts', 'i18n/locales/it.ts'])(
    'Texte vorhanden in %s', (file) => {
      const src = read(file);
      for (const key of ['distractionsAndFiles', 'requestGroupDistraction', 'distractions', 'distractionsHint', 'requestDistraction']) {
        expect(src).toMatch(new RegExp(`"groups\\.${key}": "[^"]+"`));
      }
    });

  it('neue Namen in allen Sprachen der beiden älteren Bildschirme', () => {
    const exchange = read('features/tracking-exchange/i18n.ts');
    expect(exchange).toMatch(/title:'Datei und Übergabe'/);
    expect(exchange).toMatch(/groups:'Verleitung in der Gruppe'/);
    expect(exchange).not.toMatch(/Fährten gemeinsam|Gruppenfährten|Tracks together|Group tracks|Pistes ensemble|Pistes de groupe|Piste insieme|Piste di gruppo/);
    const tasks = read('features/tracking-exchange/groups/i18n.ts');
    expect(tasks).toMatch(/"title": "Verleitung in der Gruppe"/);
    expect(tasks).not.toMatch(/"title": "(Gruppenfährten|Group tracks|Pistes de groupe|Piste di gruppo)"/);
  });
});
