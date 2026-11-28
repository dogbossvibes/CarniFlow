import { ARTICLES, MODULES, QUESTIONS } from './content/library';
import type { KnowledgeArticle, KnowledgeProgress, LearningModule, QuizQuestion } from './types';

// Tagesquiz und Lernpfad: reine Funktionen, deterministisch und offline.

export const DAILY_SIZE = 5;
/** Ein Modul gilt als geschafft, wenn so viele seiner Fragen zuletzt richtig beantwortet wurden. */
export const MODULE_PASS_RATIO = 0.8;

export function articleById(id: string): KnowledgeArticle | undefined {
  return ARTICLES.find(a => a.id === id);
}

export function questionsForArticles(ids: readonly string[]): QuizQuestion[] {
  const set = new Set(ids);
  return QUESTIONS.filter(q => set.has(q.articleId));
}

export function questionsForModule(m: LearningModule): QuizQuestion[] {
  return questionsForArticles(m.articleIds);
}

/** Kleiner, stabiler Hash (FNV-1a) für die Tagesauswahl. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/**
 * Tagesquiz: gleiche Auswahl für denselben Tag und dieselbe Person. Vorrang haben Fragen,
 * die zuletzt falsch beantwortet wurden, dann neue, dann die am längsten nicht gesehenen.
 */
export function dailyQuiz(progress: KnowledgeProgress, day: string, seed = '', pool: readonly QuizQuestion[] = QUESTIONS): QuizQuestion[] {
  const rank = (q: QuizQuestion): number => {
    const st = progress.questions[q.id];
    if (!st) return 1;
    if (!st.lastRight) return 0;
    return 2;
  };
  const lastDay = (q: QuizQuestion) => progress.questions[q.id]?.lastDay ?? '';
  const sorted = [...pool].sort((a, b) =>
    rank(a) - rank(b)
    || lastDay(a).localeCompare(lastDay(b))
    || hash(`${seed}|${day}|${a.id}`) - hash(`${seed}|${day}|${b.id}`));
  return sorted.slice(0, DAILY_SIZE);
}

export interface ModuleState {
  module: LearningModule;
  total: number;
  /** Zuletzt richtig beantwortete Fragen. */
  mastered: number;
  done: boolean;
  /** Freigeschaltet, wenn das vorherige Modul geschafft ist (das erste immer). */
  unlocked: boolean;
}

export function moduleStates(progress: KnowledgeProgress, modules: readonly LearningModule[] = MODULES): ModuleState[] {
  const out: ModuleState[] = [];
  for (const m of modules) {
    const qs = questionsForModule(m);
    const mastered = qs.filter(q => progress.questions[q.id]?.lastRight === true).length;
    const done = qs.length > 0 && mastered / qs.length >= MODULE_PASS_RATIO;
    const unlocked = out.length === 0 || out[out.length - 1].done;
    out.push({ module: m, total: qs.length, mastered, done, unlocked });
  }
  return out;
}

/** Fragen für eine Modulrunde: zuerst noch nicht sicher beantwortete. */
export function moduleQuiz(progress: KnowledgeProgress, m: LearningModule): QuizQuestion[] {
  const qs = questionsForModule(m);
  const open = qs.filter(q => progress.questions[q.id]?.lastRight !== true);
  return open.length ? open : qs;
}
