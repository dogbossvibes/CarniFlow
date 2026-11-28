// Wissen · Bibliothek, Tagesquiz und Lernpfad zur Prüfungsordnung.
//
// Urheberrecht: Die Prüfungsordnungen (FCI-IGP) sind urheberrechtlich geschützte Werke der
// FCI. In der App stehen deshalb NUR eigene, sinngemässe Zusammenfassungen und Fakten
// (Punktzahlen, Altersgrenzen, Abläufe) mit Fundstelle, KEINE wörtlichen Auszüge. Für den
// verbindlichen Wortlaut verweist jede Karte auf das offizielle Dokument.
// Alles läuft auf dem Gerät; es gehen keine Daten an einen KI-Dienst.

export type KnowledgeSourceId = 'fci-igp-2025';

export interface KnowledgeSource {
  id: KnowledgeSourceId;
  /** Kurzname für Fundstellen, z. B. «FCI-IGP 2025». */
  short: string;
  title: string;
  issuer: string;
  /** Gültig ab (JJJJ-MM-TT). */
  validFrom: string;
  /** Offizielle Bezugsquelle für den verbindlichen Wortlaut. */
  url: string;
}

/** Fundstelle in der Quelle (Abschnitt wie im Dokument; Seitenzahlen unterscheiden sich je nach Fassung). */
export interface KnowledgeRef {
  source: KnowledgeSourceId;
  section: string;
}

export type KnowledgeTopic = 'zulassung' | 'bewertung' | 'ablauf' | 'faehrte' | 'unterordnung' | 'schutzdienst';

export interface KnowledgeArticle {
  /** Dauerhaft (steht im Lernfortschritt), nicht umbenennen. */
  id: string;
  topic: KnowledgeTopic;
  title: string;
  /** Eigene Zusammenfassung in einem Satz. */
  summary: string;
  /** Eigene Stichpunkte (sinngemäss, keine Zitate). */
  points: readonly string[];
  refs: readonly KnowledgeRef[];
  /** Suchbegriffe für die Coach-Antwort (klein, ohne Umlaute nötig). */
  keywords: readonly string[];
}

export interface QuizQuestion {
  /** Dauerhaft (steht im Lernfortschritt), nicht umbenennen. */
  id: string;
  articleId: string;
  question: string;
  /** 2–4 Antworten. */
  options: readonly string[];
  correct: number;
  /** Kurze Begründung in eigenen Worten. */
  explanation: string;
}

export interface LearningModule {
  id: string;
  title: string;
  articleIds: readonly string[];
}

/** Ergebnis je Frage (lokal auf dem Gerät). */
export interface QuestionStat {
  right: number;
  wrong: number;
  /** Letzte Antwort richtig? */
  lastRight: boolean;
  /** Letzter Antworttag JJJJ-MM-TT. */
  lastDay: string;
}

export interface KnowledgeProgress {
  version: 1;
  questions: Record<string, QuestionStat>;
  /** Tage (JJJJ-MM-TT), an denen das Tagesquiz abgeschlossen wurde. */
  quizDays: string[];
  /** Gelesene Artikel. */
  read: string[];
}
