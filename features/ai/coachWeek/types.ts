// Coach · Wochenvorschlag je Hund (Spec docs/specs/phase2/05-ki-trainingscoach.md, Variante A).
// Reine Daten für das Regelwerk: keine Namen, keine Orte, keine Notizen. Was die App ohnehin
// lädt, wird in PR B in diese Form gebracht. Keine Daten verlassen das Gerät.

export type CoachDiscipline = 'faehrte' | 'unterordnung' | 'schutzdienst' | 'mantrailing' | 'obedience' | 'other';

export interface CoachSession {
  /** Kalendertag JJJJ-MM-TT (lokal). */
  date: string;
  discipline: CoachDiscipline;
  /** Gesamtbewertung 1–5, falls erfasst. */
  rating: number | null;
  durationMinutes: number | null;
}

export interface CoachTrack {
  date: string;
  /** Liegezeit in Minuten, falls bekannt. */
  lyingMinutes: number | null;
  /** Abweichung je Winkel (Reihenfolge = 1., 2., … Winkel), in Metern; null = unbekannt. */
  cornerDeviationsM: (number | null)[];
  articlesFound: number | null;
  articlesTotal: number | null;
  lengthSteps: number | null;
}

export interface CoachExam {
  /** Prüfungstag JJJJ-MM-TT. */
  date: string;
  /** Prüfungsart wie im Prüfungsbuch (igp, ifh, fh, bh, obedience …). */
  examType: string;
  /** Anzeige, z. B. «IGP 2» (bereits übersetzt, ohne Personendaten). */
  label: string;
}

export interface CoachInput {
  /** Heute (JJJJ-MM-TT, lokal). Die Woche beginnt morgen. */
  today: string;
  dogId: string;
  /** Alter in Monaten, falls Geburtsdatum erfasst. */
  ageMonths: number | null;
  /** Läufigkeit nur, wenn bereits erfasst. */
  inHeat: boolean | null;
  /** Im Profil aktivierte Sparten. */
  disciplines: CoachDiscipline[];
  sessions: CoachSession[];
  tracks: CoachTrack[];
  exams: CoachExam[];
  /** Ausgeblendete Vorschläge («nicht passend») – Schlüssel aus suggestionKey. */
  dismissedKeys?: readonly string[];
  /** Für diesen Hund ausgeschaltete Regeln. */
  disabledRules?: readonly CoachRuleId[];
}

export type CoachRuleId = 'exam' | 'pause' | 'corner' | 'lying' | 'rating' | 'balance';

export interface CoachReason { key: string; params?: Record<string, string | number> }

export type CoachFocus = 'corners' | 'lying' | 'basics' | 'exam_run' | 'maintain';

export interface CoachSuggestion {
  /** Stabil je Hund, Woche, Regel und Sparte (für «schon im Kalender» und Ausblenden). */
  key: string;
  rule: CoachRuleId;
  discipline: CoachDiscipline;
  focus: CoachFocus;
  /** Tag JJJJ-MM-TT innerhalb der nächsten 7 Tage. */
  date: string;
  /** Konkrete Eckdaten, z. B. Liegezeit oder Winkelzahl. */
  params: { lyingMinutes?: number; corners?: number; steps?: number; minutes?: number };
  /** Begründung aus den eigenen Daten, immer mit Zahlen. */
  reasons: CoachReason[];
  priority: number;
  /** Harte Einheit: nie zwei an aufeinanderfolgenden Tagen. */
  hard: boolean;
}

export interface CoachWeek {
  dogId: string;
  weekStart: string;
  weekEnd: string;
  state: 'ok' | 'no_data';
  suggestions: CoachSuggestion[];
  /** Hinweise ohne eigene Einheit (z. B. Läufigkeit). */
  notes: CoachReason[];
}
