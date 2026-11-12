/**
 * Prüfungsvorlagen für das Fährtenlegen (T-200).
 *
 * Reine Führungshilfe beim LEGEN: Die Vorlage sagt, was die Prüfungsordnung
 * verlangt, und meldet, wenn ein gesetzter Winkel oder Gegenstand eine Regel
 * verletzt. Sie verändert weder Aufzeichnung noch Geometrie noch Bewertung und
 * wird nicht mit der Fährte gespeichert.
 *
 * Quelle: FCI-Prüfungsordnung für Gebrauchshunde 2025 (gültig ab 1.1.2025),
 * Abteilung A. Alle Längen in Schritten; die Schrittzahl der App ist aus der
 * GPS-Distanz geschätzt (siehe steps.ts).
 */

export type ExamTemplateId = 'igp1' | 'igp2' | 'igp3' | 'ifh1' | 'ifh2' | 'ifh3';

export interface ExamTemplate {
  id: ExamTemplateId;
  label: string;
  /** Mindest- bzw. Soll-Länge in Schritten. */
  lengthSteps: number;
  legs: number;
  corners: number;
  /** Davon Spitzwinkel (30–60°). */
  acuteCorners: number;
  articles: number;
  /** Frühester erster Gegenstand in Schritten ab Abgang (0 = keine Vorgabe ausser «auf dem 1. Schenkel»). */
  firstArticleMinSteps: number;
  ageMinutes: number;
  crossTracks: boolean;
  /** IFH-3: ein Schenkel als Halbkreis (Radius ca. 30 m). */
  semicircleLeg: boolean;
}

/** Mindestabstand zwischen zwei Winkeln (Schritte). */
export const EXAM_MIN_STEPS_BETWEEN_CORNERS = 50;
/** Kein Gegenstand näher als so viele Schritte vor oder nach einem Winkel. */
export const EXAM_ARTICLE_CORNER_CLEARANCE_STEPS = 20;
/** Nach dem letzten Gegenstand geht der Fährtenleger noch geradeaus weiter (Schritte). */
export const EXAM_STEPS_AFTER_LAST_ARTICLE = 10;

export const EXAM_TEMPLATES: readonly ExamTemplate[] = [
  { id: 'igp1', label: 'IGP-1', lengthSteps: 300,  legs: 3, corners: 2, acuteCorners: 0, articles: 3, firstArticleMinSteps: 0,   ageMinutes: 20,  crossTracks: false, semicircleLeg: false },
  { id: 'igp2', label: 'IGP-2', lengthSteps: 400,  legs: 3, corners: 2, acuteCorners: 0, articles: 3, firstArticleMinSteps: 0,   ageMinutes: 30,  crossTracks: false, semicircleLeg: false },
  { id: 'igp3', label: 'IGP-3', lengthSteps: 600,  legs: 5, corners: 4, acuteCorners: 0, articles: 3, firstArticleMinSteps: 100, ageMinutes: 60,  crossTracks: false, semicircleLeg: false },
  { id: 'ifh1', label: 'IFH-1', lengthSteps: 800,  legs: 5, corners: 4, acuteCorners: 0, articles: 3, firstArticleMinSteps: 100, ageMinutes: 90,  crossTracks: false, semicircleLeg: false },
  { id: 'ifh2', label: 'IFH-2', lengthSteps: 1200, legs: 7, corners: 6, acuteCorners: 1, articles: 4, firstArticleMinSteps: 100, ageMinutes: 120, crossTracks: true,  semicircleLeg: false },
  { id: 'ifh3', label: 'IFH-3', lengthSteps: 1800, legs: 8, corners: 7, acuteCorners: 2, articles: 7, firstArticleMinSteps: 100, ageMinutes: 180, crossTracks: true,  semicircleLeg: true },
];

export function examTemplateById(id: ExamTemplateId | null | undefined): ExamTemplate | null {
  return EXAM_TEMPLATES.find(t => t.id === id) ?? null;
}

export interface ExamLayProgress {
  /** Geschätzte Schritte ab Abgang. */
  currentStep: number;
  /** Schrittpositionen der bereits gesetzten Winkel (aufsteigend oder beliebig). */
  cornerSteps: readonly number[];
  /** Schrittpositionen der bereits gesetzten Gegenstände. */
  articleSteps: readonly number[];
}

export type ExamNextAction =
  | 'walk'            // weitergehen, nichts fällig
  | 'article'         // nächster Gegenstand kann gesetzt werden
  | 'corner'          // nächster Winkel kann gesetzt werden
  | 'last_article'    // Länge erreicht: letzten Gegenstand ablegen
  | 'finish';         // alles gesetzt, Länge erreicht

export type ExamWarning =
  | 'corner_too_early'          // weniger als 50 Schritte seit Abgang/letztem Winkel
  | 'article_near_corner'       // Gegenstand näher als 20 Schritte an einem Winkel
  | 'first_article_too_early'   // erster Gegenstand vor der Mindestdistanz
  | 'too_many_corners'
  | 'too_many_articles';

export interface ExamLayGuidance {
  /** Aktueller Schenkel (1-basiert) und Schritte auf diesem Schenkel. */
  legIndex: number;
  stepsOnLeg: number;
  /** Richtwert für die Schenkellänge (Gesamtlänge ÷ Schenkel). */
  legTargetSteps: number;
  cornersSet: number;
  articlesSet: number;
  /** Fehlende Schritte bis zur Soll-Länge (0 = erreicht). */
  remainingSteps: number;
  next: ExamNextAction;
  /** Schritte bis die nächste Aktion regelkonform möglich ist (0 = jetzt). */
  stepsUntilNext: number;
  warnings: ExamWarning[];
  /** Alle Vorgaben der Vorlage sind erfüllt und es liegt keine Warnung vor. */
  complete: boolean;
}

const clean = (values: readonly number[]): number[] => values.filter(v => Number.isFinite(v) && v >= 0).slice().sort((a, b) => a - b);

/** Wertet den bisherigen Legeverlauf gegen die Vorlage aus. Reine Funktion. */
export function examLayGuidance(template: ExamTemplate, progress: ExamLayProgress): ExamLayGuidance {
  const step = Number.isFinite(progress.currentStep) && progress.currentStep > 0 ? Math.round(progress.currentStep) : 0;
  const corners = clean(progress.cornerSteps);
  const articles = clean(progress.articleSteps);
  const lastCorner = corners.length ? corners[corners.length - 1] : 0;
  const legTargetSteps = Math.round(template.lengthSteps / template.legs);

  const warnings: ExamWarning[] = [];
  const legStarts = [0, ...corners];
  if (corners.some((c, i) => c - legStarts[i] < EXAM_MIN_STEPS_BETWEEN_CORNERS)) warnings.push('corner_too_early');
  if (articles.some(a => corners.some(c => Math.abs(a - c) < EXAM_ARTICLE_CORNER_CLEARANCE_STEPS))) warnings.push('article_near_corner');
  if (articles.length && template.firstArticleMinSteps > 0 && articles[0] < template.firstArticleMinSteps) warnings.push('first_article_too_early');
  if (corners.length > template.corners) warnings.push('too_many_corners');
  if (articles.length > template.articles) warnings.push('too_many_articles');

  const remainingSteps = Math.max(0, template.lengthSteps - step);
  const cornersLeft = Math.max(0, template.corners - corners.length);
  const articlesLeft = Math.max(0, template.articles - articles.length);

  let next: ExamNextAction = 'walk';
  let stepsUntilNext = 0;
  if (cornersLeft === 0 && articlesLeft <= 1) {
    // Letzter Schenkel: der letzte Gegenstand liegt am Ende der Fährte.
    if (articlesLeft === 1) { next = 'last_article'; stepsUntilNext = Math.max(remainingSteps, lastCorner + EXAM_ARTICLE_CORNER_CLEARANCE_STEPS - step, 0); }
    else { next = 'finish'; stepsUntilNext = remainingSteps; }
  } else {
    // Auf dem laufenden Schenkel zuerst ein Gegenstand (falls noch Zwischengegenstände offen sind
    // und auf diesem Schenkel noch keiner liegt), danach der Winkel.
    const articleOnThisLeg = articles.some(a => a >= lastCorner);
    const middleArticlesLeft = articlesLeft - 1;
    if (middleArticlesLeft > 0 && !articleOnThisLeg) {
      next = 'article';
      const earliest = Math.max(lastCorner + EXAM_ARTICLE_CORNER_CLEARANCE_STEPS, articles.length === 0 ? template.firstArticleMinSteps : 0);
      stepsUntilNext = Math.max(0, earliest - step);
    } else if (cornersLeft > 0) {
      next = 'corner';
      const lastArticle = articles.length ? articles[articles.length - 1] : -Infinity;
      const earliest = Math.max(lastCorner + EXAM_MIN_STEPS_BETWEEN_CORNERS, lastArticle + EXAM_ARTICLE_CORNER_CLEARANCE_STEPS);
      stepsUntilNext = Math.max(0, earliest - step);
    }
  }

  const complete = corners.length === template.corners && articles.length === template.articles
    && remainingSteps === 0 && warnings.length === 0;
  return {
    legIndex: Math.min(template.legs, corners.filter(c => c <= step).length + 1),
    stepsOnLeg: Math.max(0, step - Math.min(lastCorner, step)),
    legTargetSteps, cornersSet: corners.length, articlesSet: articles.length,
    remainingSteps, next, stepsUntilNext, warnings, complete,
  };
}
