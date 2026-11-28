import { ARTICLES, MODULES, QUESTIONS, SOURCES } from '../content/library';
import { askKnowledge, normalize, refLabel } from '../ask';
import { DAILY_SIZE, dailyQuiz, moduleQuiz, moduleStates, questionsForModule } from '../learning';
import { EMPTY_PROGRESS, parseProgress, streak, withAnswer, withQuizDay, withRead } from '../progress';
import type { KnowledgeProgress } from '../types';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

describe('Wissensinhalte', () => {
  it('IDs sind eindeutig, Verweise gültig', () => {
    const aIds = ARTICLES.map(a => a.id);
    const qIds = QUESTIONS.map(q => q.id);
    expect(new Set(aIds).size).toBe(aIds.length);
    expect(new Set(qIds).size).toBe(qIds.length);
    for (const q of QUESTIONS) expect(aIds).toContain(q.articleId);
    for (const m of MODULES) for (const id of m.articleIds) expect(aIds).toContain(id);
  });

  it('jede Karte hat Fundstelle in einer bekannten Quelle mit offiziellem Link', () => {
    for (const a of ARTICLES) {
      expect(a.refs.length).toBeGreaterThan(0);
      for (const r of a.refs) {
        expect(SOURCES[r.source]).toBeDefined();
        expect(SOURCES[r.source].url).toMatch(/^https:\/\//);
        expect(r.section.length).toBeGreaterThan(3);
      }
    }
  });

  it('jede Frage hat 2–4 verschiedene Antworten und eine gültige richtige', () => {
    for (const q of QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.correct).toBeGreaterThanOrEqual(0);
      expect(q.correct).toBeLessThan(q.options.length);
      expect(q.explanation.length).toBeGreaterThan(5);
    }
  });

  it('jede Karte hat mindestens eine Frage, jedes Modul Fragen', () => {
    for (const a of ARTICLES) expect(QUESTIONS.some(q => q.articleId === a.id)).toBe(true);
    for (const m of MODULES) expect(questionsForModule(m).length).toBeGreaterThan(0);
  });

  it('Urheberrecht: kurze eigene Stichpunkte, keine langen Textblöcke', () => {
    for (const a of ARTICLES) {
      expect(a.summary.length).toBeLessThanOrEqual(200);
      for (const p of a.points) expect(p.length).toBeLessThanOrEqual(220);
    }
  });
});

describe('Lernfortschritt', () => {
  it('kaputte oder fremde Werte → leerer Stand', () => {
    expect(parseProgress(null)).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('{kaputt')).toEqual(EMPTY_PROGRESS);
    expect(parseProgress('{"version":2}')).toEqual(EMPTY_PROGRESS);
  });

  it('liest gültige Einträge und verwirft ungültige', () => {
    const raw = JSON.stringify({
      version: 1,
      questions: { a: { right: 2, wrong: 1, lastRight: true, lastDay: '2026-11-27' }, b: { right: 1, lastDay: 'gestern' }, c: 5 },
      quizDays: ['2026-11-27', 'x', '2026-11-26', '2026-11-27'],
      read: ['zul-alter', 3],
    });
    const p = parseProgress(raw);
    expect(Object.keys(p.questions)).toEqual(['a']);
    expect(p.quizDays).toEqual(['2026-11-26', '2026-11-27']);
    expect(p.read).toEqual(['zul-alter']);
  });

  it('Antworten, Tage und Gelesenes sind unveränderlich fortgeschrieben', () => {
    let p: KnowledgeProgress = EMPTY_PROGRESS;
    p = withAnswer(p, 'q1', false, '2026-11-28');
    p = withAnswer(p, 'q1', true, '2026-11-28');
    expect(p.questions.q1).toEqual({ right: 1, wrong: 1, lastRight: true, lastDay: '2026-11-28' });
    expect(EMPTY_PROGRESS.questions).toEqual({});
    const d = withQuizDay(p, '2026-11-28');
    expect(withQuizDay(d, '2026-11-28')).toBe(d);
    const r = withRead(d, 'x');
    expect(withRead(r, 'x')).toBe(r);
  });

  it('Serie zählt Tage in Folge, heute offen zählt bis gestern', () => {
    const p = { ...EMPTY_PROGRESS, quizDays: ['2026-11-25', '2026-11-26', '2026-11-27'] };
    expect(streak(p, '2026-11-28')).toBe(3);
    expect(streak(withQuizDay(p, '2026-11-28'), '2026-11-28')).toBe(4);
    expect(streak(p, '2026-11-30')).toBe(0);
    expect(streak({ ...EMPTY_PROGRESS, quizDays: ['2026-02-28', '2026-03-01'] }, '2026-03-01')).toBe(2);
  });
});

describe('Tagesquiz und Lernpfad', () => {
  it('Tagesquiz: feste Grösse, stabil je Tag, ohne Doppel', () => {
    const a = dailyQuiz(EMPTY_PROGRESS, '2026-11-28', 'u1');
    expect(a).toHaveLength(DAILY_SIZE);
    expect(new Set(a.map(q => q.id)).size).toBe(DAILY_SIZE);
    expect(dailyQuiz(EMPTY_PROGRESS, '2026-11-28', 'u1').map(q => q.id)).toEqual(a.map(q => q.id));
    expect(dailyQuiz(EMPTY_PROGRESS, '2026-11-29', 'u1').map(q => q.id)).not.toEqual(a.map(q => q.id));
  });

  it('falsch Beantwortetes kommt zuerst, sicher Gewusstes zuletzt', () => {
    let p: KnowledgeProgress = EMPTY_PROGRESS;
    for (const q of QUESTIONS) p = withAnswer(p, q.id, true, '2026-11-20');
    p = withAnswer(p, 'q-sd-3', false, '2026-11-27');
    const quiz = dailyQuiz(p, '2026-11-28', 'u1');
    expect(quiz[0].id).toBe('q-sd-3');
  });

  it('Module schalten nacheinander frei', () => {
    const s0 = moduleStates(EMPTY_PROGRESS);
    expect(s0[0].unlocked).toBe(true);
    expect(s0.slice(1).every(m => !m.unlocked)).toBe(true);
    let p: KnowledgeProgress = EMPTY_PROGRESS;
    for (const q of questionsForModule(MODULES[0])) p = withAnswer(p, q.id, true, '2026-11-28');
    const s1 = moduleStates(p);
    expect(s1[0].done).toBe(true);
    expect(s1[1].unlocked).toBe(true);
    expect(s1[2].unlocked).toBe(false);
  });

  it('Modulrunde fragt zuerst Offenes, sonst alles', () => {
    const m = MODULES[0];
    const all = questionsForModule(m);
    let p: KnowledgeProgress = withAnswer(EMPTY_PROGRESS, all[0].id, true, '2026-11-28');
    expect(moduleQuiz(p, m).map(q => q.id)).not.toContain(all[0].id);
    for (const q of all) p = withAnswer(p, q.id, true, '2026-11-28');
    expect(moduleQuiz(p, m)).toHaveLength(all.length);
  });
});

describe('Coach-Frage zur Prüfungsordnung', () => {
  it('normalisiert Umlaute und Stufen', () => {
    expect(normalize('Läufige Hündin für IGP 1?')).toBe('laeufige huendin fuer igp1');
  });

  it.each([
    ['Wie alt muss mein Hund für IGP 1 sein?', 'zul-alter'],
    ['Darf meine läufige Hündin starten?', 'zul-laeufig'],
    ['Wie nah dürfen Gegenstände am Winkel liegen?', 'fae-legen'],
    ['Wie hoch ist die Schrägwand?', 'uo-geraete'],
    ['Was ist der Unterschied zwischen Abbruch und Disqualifikation?', 'abl-abbruch'],
    ['Wie viele Punkte für vorzüglich gesamt?', 'bew-gesamt'],
    ['Wie viele Verstecke beim Revieren?', 'sd-ablauf'],
  ])('«%s» → %s', (q, id) => {
    const a = askKnowledge(q);
    expect(a.hits.map(h => h.article.id)).toContain(id);
    for (const h of a.hits) {
      expect(h.refs.length).toBeGreaterThan(0);
      expect(h.points.length).toBeGreaterThan(0);
      expect(h.points.length).toBeLessThanOrEqual(3);
      for (const p of h.points) expect(h.article.points).toContain(p);
    }
  });

  it('ohne passenden Inhalt keine Antwort statt einer erfundenen', () => {
    expect(askKnowledge('Welches Futter ist das beste?').hits).toEqual([]);
    expect(askKnowledge('   ').hits).toEqual([]);
    expect(askKnowledge('der die das').hits).toEqual([]);
  });

  it('Fundstelle als lesbarer Text', () => {
    expect(refLabel({ source: 'fci-igp-2025', section: 'Abteilung A · Legen der Fährte' })).toBe('FCI-IGP 2025 · Abteilung A · Legen der Fährte');
  });
});
