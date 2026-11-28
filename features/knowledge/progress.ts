import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KnowledgeProgress, QuestionStat } from './types';

// Lernfortschritt nur auf dem Gerät, je Person. Neuer, eigener Schlüssel: keine bestehenden
// Daten werden gelesen, verändert oder migriert. Kaputte oder unbekannte Werte fallen auf
// einen leeren Stand zurück, ohne den gespeicherten Wert zu löschen.

export const EMPTY_PROGRESS: KnowledgeProgress = { version: 1, questions: {}, quizDays: [], read: [] };
const MAX_DAYS = 400;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const progressKey = (uid: string) => `anyvo.knowledge.progress.v1:${uid}`;

const strList = (v: unknown, valid: (s: string) => boolean = () => true): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && valid(x)))] : [];

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export function parseProgress(raw: string | null): KnowledgeProgress {
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object' || (v as { version?: unknown }).version !== 1) return EMPTY_PROGRESS;
    const questions: Record<string, QuestionStat> = {};
    const qs = (v as { questions?: unknown }).questions;
    if (qs && typeof qs === 'object') {
      for (const [id, s] of Object.entries(qs as Record<string, unknown>)) {
        if (!s || typeof s !== 'object') continue;
        const st = s as Record<string, unknown>;
        const lastDay = typeof st.lastDay === 'string' && DAY.test(st.lastDay) ? st.lastDay : '';
        if (!lastDay) continue;
        questions[id] = { right: count(st.right), wrong: count(st.wrong), lastRight: st.lastRight === true, lastDay };
      }
    }
    const quizDays = strList((v as { quizDays?: unknown }).quizDays, d => DAY.test(d)).sort().slice(-MAX_DAYS);
    return { version: 1, questions, quizDays, read: strList((v as { read?: unknown }).read) };
  } catch { return EMPTY_PROGRESS; }
}

export async function loadProgress(uid: string): Promise<KnowledgeProgress> {
  try { return parseProgress(await AsyncStorage.getItem(progressKey(uid))); } catch { return EMPTY_PROGRESS; }
}

export async function saveProgress(uid: string, p: KnowledgeProgress): Promise<void> {
  await AsyncStorage.setItem(progressKey(uid), JSON.stringify(p));
}

export function withAnswer(p: KnowledgeProgress, questionId: string, right: boolean, day: string): KnowledgeProgress {
  const cur = p.questions[questionId] ?? { right: 0, wrong: 0, lastRight: false, lastDay: day };
  const next: QuestionStat = {
    right: cur.right + (right ? 1 : 0),
    wrong: cur.wrong + (right ? 0 : 1),
    lastRight: right,
    lastDay: day,
  };
  return { ...p, questions: { ...p.questions, [questionId]: next } };
}

export function withQuizDay(p: KnowledgeProgress, day: string): KnowledgeProgress {
  if (p.quizDays.includes(day)) return p;
  return { ...p, quizDays: [...p.quizDays, day].sort().slice(-MAX_DAYS) };
}

export function withRead(p: KnowledgeProgress, articleId: string): KnowledgeProgress {
  return p.read.includes(articleId) ? p : { ...p, read: [...p.read, articleId] };
}

function prevDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - 1));
  return dt.toISOString().slice(0, 10);
}

/** Tage in Folge mit abgeschlossenem Tagesquiz bis heute (oder bis gestern, wenn heute noch offen). */
export function streak(p: KnowledgeProgress, today: string): number {
  const set = new Set(p.quizDays);
  let day = set.has(today) ? today : prevDay(today);
  let n = 0;
  while (set.has(day)) { n += 1; day = prevDay(day); }
  return n;
}
