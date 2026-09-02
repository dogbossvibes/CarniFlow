import { DISCIPLINES, getDiscipline } from '@/constants/disciplines';

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
