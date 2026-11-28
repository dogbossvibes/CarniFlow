import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QuizScreen from '../quiz';
import KnowledgeScreen from '../index';
import { CoachAskCard } from '@/features/ai/components/CoachAskCard';
import { __resetKnowledgeStore } from '@/features/knowledge/useKnowledge';
import { QUESTIONS } from '@/features/knowledge/content/library';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'u1' } } }) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) }));


const byId = (r: ReactTestRenderer, id: string) => r.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.props.onPress !== 'undefined' || n.props.testID === id && typeof n.type === 'string')[0];
const has = (r: ReactTestRenderer, id: string) => r.root.findAll((n: ReactTestInstance) => n.props.testID === id).length > 0;
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => { act(() => { __resetKnowledgeStore(); }); mockPush.mockClear(); mockParams = {}; (AsyncStorage.setItem as jest.Mock).mockClear(); });

describe('Tagesquiz', () => {
  it('Runde mit 5 Fragen: Antwort speichert lokal, Abschluss markiert den Tag', async () => {
    mockParams = { mode: 'daily' };
    let r!: ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(<QuizScreen />); });
    await flush();
    for (let i = 0; i < 5; i++) {
      const qText = r.root.findAll((n: ReactTestInstance) => n.props.testID === 'knowledge-quiz-question')[0];
      const q = QUESTIONS.find(x => x.question === qText.props.children)!;
      expect(q).toBeDefined();
      await act(async () => { byId(r, `knowledge-quiz-option-${q.correct}`).props.onPress(); });
      expect(has(r, 'knowledge-quiz-feedback')).toBe(true);
      await act(async () => { byId(r, 'knowledge-quiz-next').props.onPress(); });
    }
    expect(has(r, 'knowledge-quiz-result')).toBe(true);
    const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
    expect(calls.every(c => c[0] === 'anyvo.knowledge.progress.v1:u1')).toBe(true);
    const last = JSON.parse(calls[calls.length - 1][1]);
    expect(Object.keys(last.questions)).toHaveLength(5);
    expect(last.quizDays).toHaveLength(1);
  });

  it('Übersicht zeigt Tagesquiz, gesperrte Module und Bibliothek', async () => {
    let r!: ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(<KnowledgeScreen />); });
    await flush();
    expect(has(r, 'knowledge-daily')).toBe(true);
    expect(byId(r, 'knowledge-module-m2-bewertung').props.disabled).toBe(true);
    expect(byId(r, 'knowledge-module-m1-zulassung').props.disabled).toBe(false);
    await act(async () => { byId(r, 'knowledge-article-zul-alter').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/wissen/[id]', params: { id: 'zul-alter' } });
  });
});

describe('Coach-Frage', () => {
  it('antwortet mit Fundstelle oder sagt offen, dass nichts gefunden wurde', async () => {
    let r!: ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(<CoachAskCard />); });
    await act(async () => { byId(r, 'coach-ask-input').props.onChangeText('Wie hoch ist die Schrägwand?'); });
    await act(async () => { byId(r, 'coach-ask-submit').props.onPress(); });
    expect(has(r, 'coach-ask-hit-uo-geraete')).toBe(true);
    expect(has(r, 'knowledge-refs')).toBe(true);
    await act(async () => { byId(r, 'coach-ask-input').props.onChangeText('Welches Futter ist am besten?'); });
    await act(async () => { byId(r, 'coach-ask-submit').props.onPress(); });
    expect(has(r, 'coach-ask-nohit')).toBe(true);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
