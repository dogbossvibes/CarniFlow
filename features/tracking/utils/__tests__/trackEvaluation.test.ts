// Root-Cause-Fix (echtes iPhone, Build 43 — Abschnitt 8 des Audits): eine
// Absuche ohne verwertbare Geometrie (0 m Suchspur, 0 Winkel, 0 Teilstrecken)
// zeigte bisher kommentarlos "100 Punkte / Vorzüglich" an, weil defaultLegs()
// jeden Abschnitt bedingungslos auf den vollen Punktestand setzte.
import { defaultLegs, legsFromSession, overallScore, scoreVerdict } from '@/features/tracking/utils/trackEvaluation';

describe('defaultLegs — hasValidGeometry steuert den Default-Startwert', () => {
  it('OHNE verwertbare Geometrie (0 Winkel, 0 Gegenstände): Default startet bei 0, nicht bei LEG_MAX', () => {
    const legs = defaultLegs(0, 0, false);
    expect(legs.every(l => l.score === 0)).toBe(true);
    expect(overallScore(legs)).toBe(0);
    expect(scoreVerdict(overallScore(legs)).sub).toBe('Noch nicht bewertet');
  });

  it('MIT verwertbarer Geometrie (echte Absuche, noch nicht manuell bewertet): unverändertes Verhalten — voller Punktestand als Ausgangswert (IGP-Konvention: Richter zieht ab)', () => {
    const legs = defaultLegs(2, 1, true);
    expect(legs.every(l => l.score === l.max)).toBe(true);
    expect(overallScore(legs)).toBe(100);
  });

  it('Default-Parameter (hasValidGeometry weggelassen) verhält sich wie bisher — keine Regression für bestehende Aufrufer', () => {
    const legs = defaultLegs(1, 0);
    expect(legs.every(l => l.score === l.max)).toBe(true);
  });
});

describe('legsFromSession — bereits gespeicherte manuelle Bewertung bleibt unangetastet', () => {
  it('eine gespeicherte manuelle Bewertung wird IMMER zurückgegeben, unabhängig von hasValidGeometry', () => {
    const trackData = { legs: [{ name: 'Manuell', score: 3, max: 10 }] };
    expect(legsFromSession(trackData, 0, 0, false)).toEqual(trackData.legs);
    expect(legsFromSession(trackData, 0, 0, true)).toEqual(trackData.legs);
  });

  it('ohne gespeicherte Bewertung und ohne verwertbare Geometrie: Default-Score 0 (kein vorgetäuschtes "100 Punkte")', () => {
    const legs = legsFromSession(null, 0, 0, false);
    expect(overallScore(legs)).toBe(0);
  });
});
