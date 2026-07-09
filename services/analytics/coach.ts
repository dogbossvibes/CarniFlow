import type { ScoredMetrics, TrendSummary, TrainingAnalysis } from '@/types/analytics';
import { scoreLabel } from './scoring';

interface AnalysisInput {
  dogName:    string;
  category:   string;   // Sparte/Kategorie (IGP, Fährte, …)
  scores:     ScoredMetrics;
  trend7:     TrendSummary;
  durationMin: number | null;
  belastung:  number | null;
}

/** Returns the weakest metric key. */
function weakestMetric(s: ScoredMetrics): string | null {
  const pairs: [string, number][] = ([
    ['Motivation',      s.motivation],
    ['Konzentration',   s.konzentration],
    ['Präzision',       s.praezision],
    ['Ausdauer',        s.ausdauer],
    ['Trieblage',       s.trieblage],
    ['Impulskontrolle', s.impulskontrolle],
  ] as [string, number][]).filter(([, v]) => v > 0);
  if (!pairs.length) return null;
  return pairs.reduce((a, b) => a[1] < b[1] ? a : b)[0];
}

/** Returns the strongest metric key. */
function strongestMetric(s: ScoredMetrics): string | null {
  const pairs: [string, number][] = ([
    ['Motivation',      s.motivation],
    ['Konzentration',   s.konzentration],
    ['Präzision',       s.praezision],
    ['Ausdauer',        s.ausdauer],
    ['Trieblage',       s.trieblage],
    ['Impulskontrolle', s.impulskontrolle],
  ] as [string, number][]).filter(([, v]) => v > 0);
  if (!pairs.length) return null;
  return pairs.reduce((a, b) => a[1] > b[1] ? a : b)[0];
}

export function generateAnalysis(input: AnalysisInput): Omit<TrainingAnalysis, 'id' | 'session_id' | 'user_id' | 'dog_id' | 'created_at'> {
  const { dogName, category, scores, trend7, durationMin, belastung } = input;
  const { gesamtscore, motivation, konzentration, praezision, ausdauer, impulskontrolle, trieblage } = scores;

  const strong = strongestMetric(scores);
  const weak   = weakestMetric(scores);
  const hasMetrics = gesamtscore > 0;

  // ── Positives ──────────────────────────────────────────────
  const positives: string[] = [];
  if (motivation >= 80)      positives.push(`${dogName} zeigte eine aussergewöhnliche Motivation`);
  else if (motivation >= 65) positives.push(`Gute Arbeitsmotivation über die Einheit`);
  if (konzentration >= 75)   positives.push('Starke Fokussierung und Aufmerksamkeit');
  if (praezision >= 75)      positives.push(`Präzise Ausführung der Übungen`);
  if (ausdauer >= 75)        positives.push(`Hohe Belastbarkeit und Ausdauer`);
  if (trieblage >= 75)       positives.push(`Ausgeprägte Trieblage — idealer Trainingsantrieb`);
  if (impulskontrolle >= 75) positives.push(`Sehr gute Impulskontrolle und Selbstregulation`);
  if (trend7.direction === 'up') positives.push(`Positive Entwicklung der letzten 7 Tage (+${trend7.deltaPct}%)`);
  if (trend7.stabilität >= 80)   positives.push(`Konstante Leistung — hohe Trainingsstabilität`);

  // ── Schwächen ──────────────────────────────────────────────
  const schwaechen: string[] = [];
  if (konzentration > 0 && konzentration < 50)     schwaechen.push(`Konzentration deutlich unter Potential`);
  if (impulskontrolle > 0 && impulskontrolle < 50) schwaechen.push(`Impulskontrolle ausbaufähig`);
  if (praezision > 0 && praezision < 50)           schwaechen.push(`Präzision bei den Übungen ungenau`);
  if (ausdauer > 0 && ausdauer < 45)               schwaechen.push(`Frühzeitige Erschöpfung festgestellt`);
  if (trieblage > 0 && trieblage < 40)             schwaechen.push(`Geringe Trieblage — Antrieb fehlt`);
  if (motivation > 0 && motivation < 45)           schwaechen.push(`Niedrige Motivation — mögliche Überforderung`);
  if (durationMin && durationMin > 60 && konzentration > 0 && konzentration < 60) {
    schwaechen.push('Konzentration sank bei langen Einheiten');
  }
  if (trend7.direction === 'down') schwaechen.push(`Leistungsabfall der letzten 7 Tage (${trend7.deltaPct}%)`);

  // ── Empfehlungen ───────────────────────────────────────────
  const empfehlungen: string[] = [];
  if (ausdauer > 0 && ausdauer < 50)               empfehlungen.push('Kürzere, intensivere Einheiten einplanen');
  if (konzentration > 0 && konzentration < 55)     empfehlungen.push('Mehr Pausen und Ruhephasen einbauen');
  if (impulskontrolle > 0 && impulskontrolle < 55) empfehlungen.push('Fokus auf Impulskontroll-Übungen legen');
  if (praezision > 0 && praezision < 55)           empfehlungen.push('Technische Wiederholungen mit niedrigem Druck');
  if (motivation > 0 && motivation < 50)           empfehlungen.push('Spielerische Elemente zur Motivationssteigerung');
  if (belastung && belastung >= 4)                 empfehlungen.push('Erholungseinheit oder Regenerationstag einplanen');
  if (trieblage > 0 && trieblage < 45)             empfehlungen.push('Triebaufbau mit Beute- und Spieltraining');
  if (category === 'IGP' && praezision > 0 && praezision < 60) {
    empfehlungen.push('Unterordnung und Gehorsamkeitsübungen intensivieren');
  }
  if (category === 'Mondioring' && impulskontrolle > 0 && impulskontrolle < 60) {
    empfehlungen.push('Schutzdienst-Impulskontrolle mit Ablenkung trainieren');
  }

  // Ensure we always have something
  if (!positives.length)    positives.push(`${dogName} absolvierte die Einheit`);
  if (!empfehlungen.length) empfehlungen.push('Trainingsrhythmus beibehalten');

  // ── Zusammenfassung ────────────────────────────────────────
  const levelText = hasMetrics ? scoreLabel(gesamtscore) : '';
  const strongText = strong ? `besonders stark in ${strong}` : '';
  const weakText   = weak   ? `mit Entwicklungspotenzial bei ${weak}` : '';

  let zusammenfassung = `${dogName} zeigte heute eine ${levelText.toLowerCase()} Trainingseinheit`;
  if (strongText) zusammenfassung += `, ${strongText}`;
  if (weakText)   zusammenfassung += `, ${weakText}`;
  zusammenfassung += '.';

  // ── Coach Message ──────────────────────────────────────────
  let coach_message = '';
  if (trend7.direction === 'up' && gesamtscore >= 70) {
    coach_message = `${dogName} entwickelt sich stark — halte das Tempo. Stabilität ist der nächste Schritt.`;
  } else if (trend7.direction === 'down') {
    coach_message = `Leichte Leistungsdelle erkannt. Checke Belastung und Regeneration — weniger kann mehr sein.`;
  } else if (weak && weak === 'Konzentration') {
    coach_message = `Die Konzentration ist dein grösster Hebel. Kürzere Sequenzen mit mehr Erfolgserlebnissen bringen mehr als lange Sessions.`;
  } else if (weak && weak === 'Impulskontrolle') {
    coach_message = `Impulskontrolle unter Ablenkung ist das Herzstück. Baue gezielt Situationen ein, in denen ${dogName} Selbstkontrolle zeigen kann.`;
  } else if (motivation >= 80) {
    coach_message = `${dogName} ist im Flow — jetzt ist der ideale Moment, neue Anforderungen einzuführen.`;
  } else if (motivation > 0 && motivation < 50) {
    coach_message = `Heute war nicht ${dogName}s bester Tag. Das ist normal — priorisiere Spass und lockeres Training in der nächsten Session.`;
  } else if (gesamtscore >= 80) {
    coach_message = `Hervorragende Einheit. ${dogName} ist auf einem sehr guten Niveau — bleibe konsistent.`;
  } else {
    coach_message = `Solide Trainingseinheit. ${empfehlungen[0] ?? 'Weiter so.'}`;
  }

  return {
    gesamtscore,
    zusammenfassung,
    positives:   positives.slice(0, 4),
    schwaechen:  schwaechen.slice(0, 3),
    empfehlungen: empfehlungen.slice(0, 4),
    coach_message,
  };
}
