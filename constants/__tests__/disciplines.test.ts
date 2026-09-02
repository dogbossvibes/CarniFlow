import { DISCIPLINES, getDiscipline, customToDiscipline } from '@/constants/disciplines';
import type { CustomCategory } from '@/types/customCategory';

// Neue Obedience-Übung „Kegelgruppe umrunden": Der Hund wird zur Kegelgruppe
// geschickt, umrundet diese und kehrt zum Hundeführer zurück. Übungen haben in
// diesem Modul keine separate ID — der Anzeigetext IST der gespeicherte Wert
// (siehe app/unit/document.tsx, app/unit/[discipline].tsx: `key={ex}`,
// `exercise_name: text` in der DB) — daher kein neuer Key/ID nötig oder möglich,
// ohne von der bestehenden Architektur aller anderen Übungen abzuweichen.
describe('Obedience-Übung „Kegelgruppe umrunden"', () => {
  const obedience = getDiscipline('obedience');

  it('ist Teil der Obedience-Übungsliste', () => {
    expect(obedience).toBeDefined();
    expect(obedience?.exercises).toContain('Kegelgruppe umrunden');
  });

  it('kommt genau einmal vor', () => {
    expect(obedience?.exercises.filter(e => e === 'Kegelgruppe umrunden')).toHaveLength(1);
  });

  it('steht vor dem abschliessenden „Eigene Übung"-Platzhalter (bestehende Konvention: Custom-Eintrag immer zuletzt)', () => {
    const exercises = obedience?.exercises ?? [];
    const kegelIdx = exercises.indexOf('Kegelgruppe umrunden');
    const eigeneIdx = exercises.indexOf('Eigene Übung');
    expect(kegelIdx).toBeGreaterThanOrEqual(0);
    expect(eigeneIdx).toBeGreaterThan(kegelIdx);
  });

  it('entfernt oder benennt keine bestehende Obedience-Übung um', () => {
    const bestehende = [
      'Fussarbeit',
      'Positionen aus der Bewegung',
      'Abrufen mit Steh/Platz',
      'Voraussenden in Viereck',
      'Apport (Bringholz)',
      'Apport über Hürde',
      'Geruchsunterscheidung',
      'Distanzkontrolle',
      'Gruppenarbeit',
      'Bleib-Übungen (Gruppe)',
      'Eigene Übung',
    ];
    for (const ex of bestehende) {
      expect(obedience?.exercises).toContain(ex);
    }
    // Genau ein neuer Eintrag zusätzlich zu den bestehenden 11.
    expect(obedience?.exercises).toHaveLength(bestehende.length + 1);
  });

  it('ändert keine andere Disziplin und keine Obedience-Kerndaten (key/label/subtitle/emoji/icon/accent)', () => {
    expect(obedience).toMatchObject({
      key:      'obedience',
      label:    'Obedience',
      subtitle: 'Präzision & Freude an der Arbeit',
      emoji:    '🎪',
      icon:     'ribbon',
      hero:     false,
    });
    const faehrte = getDiscipline('faehrte');
    const unterordnung = getDiscipline('unterordnung');
    const agility = getDiscipline('agility');
    expect(faehrte?.exercises).toHaveLength(7);
    expect(unterordnung?.exercises).toHaveLength(9);
    expect(agility?.exercises).toHaveLength(11);
  });

  it('bleibt Teil der vollständigen DISCIPLINES-Liste (keine Sparte verloren)', () => {
    const keys = DISCIPLINES.map(d => d.key);
    expect(keys).toEqual([
      'faehrte', 'unterordnung', 'schutzdienst', 'obedience', 'agility', 'rally', 'mondioring', 'eigene',
    ]);
  });
});

// Eigene Trainings-Sparte (Custom Discipline): customToDiscipline() bildet eine
// gespeicherte custom_categories-Zeile auf dieselbe Discipline-Form ab wie jede
// feste Sparte — dieselbe Trainingslogik, kein zweites System.
describe('customToDiscipline — eigene Sparte', () => {
  const category: CustomCategory = {
    id:         '11111111-2222-3333-4444-555555555555',
    owner_id:   'owner-1',
    name:       'Fitness',
    icon:       'barbell',
    color:      '#A78BFA',
    exercises:  ['Liegestütze', 'Sprints'],
    created_at: '2026-01-01T00:00:00.000Z',
  };

  it('erzeugt einen eindeutig als custom markierten Key — nie kollidierend mit einer System-Sparte', () => {
    const disc = customToDiscipline(category);
    expect(disc.key).toBe('custom:11111111-2222-3333-4444-555555555555');
    expect(DISCIPLINES.some(d => d.key === disc.key)).toBe(false);
  });

  it('übernimmt den Nutzernamen unverändert als label — keine automatische Übersetzung', () => {
    const disc = customToDiscipline(category);
    expect(disc.label).toBe('Fitness');
  });

  it('übernimmt die vom Nutzer erfassten Übungen unverändert', () => {
    const disc = customToDiscipline(category);
    expect(disc.exercises).toEqual(['Liegestütze', 'Sprints']);
  });

  it('verändert keine bestehende System-Disziplin', () => {
    const keysBefore = DISCIPLINES.map(d => d.key);
    customToDiscipline(category);
    expect(DISCIPLINES.map(d => d.key)).toEqual(keysBefore);
  });
});
