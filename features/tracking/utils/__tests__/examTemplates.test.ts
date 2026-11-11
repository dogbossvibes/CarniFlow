// T-200: Prüfungsvorlagen als Führung beim Legen — reine Logik.
import {
  EXAM_TEMPLATES, examLayGuidance, examTemplateById, type ExamLayProgress,
} from '../examTemplates';

const igp1 = examTemplateById('igp1')!;
const igp3 = examTemplateById('igp3')!;
const at = (currentStep: number, cornerSteps: number[] = [], articleSteps: number[] = []): ExamLayProgress => ({ currentStep, cornerSteps, articleSteps });

describe('Vorlagen nach FCI-Prüfungsordnung 2025', () => {
  test('Länge, Schenkel, Winkel, Gegenstände und Liegezeit je Stufe', () => {
    const rows = EXAM_TEMPLATES.map(t => [t.label, t.lengthSteps, t.legs, t.corners, t.acuteCorners, t.articles, t.ageMinutes]);
    expect(rows).toEqual([
      ['IGP-1', 300, 3, 2, 0, 3, 20], ['IGP-2', 400, 3, 2, 0, 3, 30], ['IGP-3', 600, 5, 4, 0, 3, 60],
      ['IFH-1', 800, 5, 4, 0, 3, 90], ['IFH-2', 1200, 7, 6, 1, 4, 120], ['IFH-3', 1800, 8, 7, 2, 7, 180],
    ]);
    for (const t of EXAM_TEMPLATES) expect(t.legs).toBe(t.corners + 1);
    expect(EXAM_TEMPLATES.filter(t => t.crossTracks).map(t => t.id)).toEqual(['ifh2', 'ifh3']);
    expect(examTemplateById(null)).toBeNull();
  });
});

describe('Führung beim Legen (IGP-1)', () => {
  test('Abgang: zuerst der Gegenstand auf Schenkel 1, frühestens nach 20 Schritten', () => {
    const g = examLayGuidance(igp1, at(5));
    expect(g).toMatchObject({ legIndex: 1, stepsOnLeg: 5, legTargetSteps: 100, next: 'article', stepsUntilNext: 15, remainingSteps: 295, warnings: [], complete: false });
    expect(examLayGuidance(igp1, at(40)).stepsUntilNext).toBe(0);
  });
  test('nach dem Gegenstand ist der Winkel fällig — mind. 50 Schritte ab Abgang und 20 nach dem Gegenstand', () => {
    expect(examLayGuidance(igp1, at(45, [], [40]))).toMatchObject({ next: 'corner', stepsUntilNext: 15 });   // 40 + 20 = 60
    expect(examLayGuidance(igp1, at(100, [], [40]))).toMatchObject({ next: 'corner', stepsUntilNext: 0 });
  });
  test('zweiter Schenkel: Schritte zählen ab dem Winkel', () => {
    const g = examLayGuidance(igp1, at(130, [100], [40]));
    expect(g).toMatchObject({ legIndex: 2, stepsOnLeg: 30, next: 'article', stepsUntilNext: 0, cornersSet: 1, articlesSet: 1 });
  });
  test('letzter Schenkel: letzter Gegenstand am Ende, erst wenn die Länge erreicht ist', () => {
    const g = examLayGuidance(igp1, at(230, [100, 200], [40, 150]));
    expect(g).toMatchObject({ legIndex: 3, next: 'last_article', stepsUntilNext: 70, remainingSteps: 70 });
    expect(examLayGuidance(igp1, at(300, [100, 200], [40, 150]))).toMatchObject({ next: 'last_article', stepsUntilNext: 0 });
  });
  test('vollständig und regelkonform', () => {
    expect(examLayGuidance(igp1, at(302, [100, 200], [40, 150, 300]))).toMatchObject({ next: 'finish', stepsUntilNext: 0, complete: true, warnings: [] });
  });
});

describe('Regel-Hinweise', () => {
  test('Winkel zu früh (weniger als 50 Schritte seit Abgang oder letztem Winkel)', () => {
    expect(examLayGuidance(igp1, at(60, [30])).warnings).toContain('corner_too_early');
    expect(examLayGuidance(igp1, at(160, [100, 130])).warnings).toContain('corner_too_early');
    expect(examLayGuidance(igp1, at(160, [100, 150])).warnings).not.toContain('corner_too_early');
  });
  test('Gegenstand näher als 20 Schritte an einem Winkel — davor wie danach', () => {
    expect(examLayGuidance(igp1, at(120, [100], [85])).warnings).toContain('article_near_corner');
    expect(examLayGuidance(igp1, at(120, [100], [115])).warnings).toContain('article_near_corner');
    expect(examLayGuidance(igp1, at(130, [100], [80])).warnings).not.toContain('article_near_corner');
  });
  test('IGP-3: erster Gegenstand frühestens nach 100 Schritten', () => {
    expect(examLayGuidance(igp3, at(10))).toMatchObject({ next: 'article', stepsUntilNext: 90 });
    expect(examLayGuidance(igp3, at(90, [], [60])).warnings).toContain('first_article_too_early');
    expect(examLayGuidance(igp1, at(90, [], [60])).warnings).not.toContain('first_article_too_early');
  });
  test('zu viele Winkel oder Gegenstände', () => {
    expect(examLayGuidance(igp1, at(320, [100, 200, 280])).warnings).toContain('too_many_corners');
    expect(examLayGuidance(igp1, at(320, [100, 200], [40, 150, 250, 300])).warnings).toContain('too_many_articles');
  });
  test('mit Warnung gilt die Fährte nicht als regelkonform vollständig', () => {
    expect(examLayGuidance(igp1, at(302, [100, 200], [40, 190, 300])).complete).toBe(false);
  });
});

describe('Robustheit', () => {
  test('ungültige Eingaben führen nicht zu Unsinn', () => {
    const g = examLayGuidance(igp1, { currentStep: Number.NaN, cornerSteps: [Number.NaN, -5], articleSteps: [Infinity] });
    expect(g).toMatchObject({ legIndex: 1, stepsOnLeg: 0, cornersSet: 0, articlesSet: 0, remainingSteps: 300 });
  });
  test('Reihenfolge der Marker spielt keine Rolle', () => {
    expect(examLayGuidance(igp1, at(230, [200, 100], [150, 40]))).toEqual(examLayGuidance(igp1, at(230, [100, 200], [40, 150])));
  });
});
