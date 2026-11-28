import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { MODULES } from '@/features/knowledge/content/library';
import { dailyQuiz, moduleQuiz, questionsForArticles } from '@/features/knowledge/learning';
import { useKnowledge } from '@/features/knowledge/useKnowledge';
import type { QuizQuestion } from '@/features/knowledge/types';
import { ks } from '@/features/knowledge/ui/styles';

type Mode = 'daily' | 'module' | 'article';

// Quiz: Tagesquiz, Modulrunde im Lernpfad oder Fragen zu einer Karte.
// Die Fragen werden beim Start einmal festgelegt und ändern sich während der Runde nicht.
export default function KnowledgeQuizScreen() {
  const router = useRouter();
  const { t } = useT();
  const params = useLocalSearchParams<{ mode?: string; id?: string }>();
  const mode: Mode = params.mode === 'module' || params.mode === 'article' ? params.mode : 'daily';
  const k = useKnowledge();
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const [finished, setFinished] = useState(false);

  // Beim ersten geladenen Stand einmal festlegen (Setzen während des Renderns, ohne Effekt).
  if (k.loaded && questions === null) {
    const m = mode === 'module' ? MODULES.find(x => x.id === params.id) : undefined;
    setQuestions(
      mode === 'module' ? (m ? moduleQuiz(k.progress, m) : [])
        : mode === 'article' ? (params.id ? questionsForArticles([String(params.id)]) : [])
        : dailyQuiz(k.progress, k.today, k.seed),
    );
  }

  const q = questions?.[idx];
  const answered = picked !== null;

  const choose = (i: number) => {
    if (!q || answered) return;
    const ok = i === q.correct;
    setPicked(i);
    if (ok) setRight(r => r + 1);
    k.answer(q.id, ok);
  };

  const next = () => {
    if (!questions) return;
    if (idx + 1 < questions.length) { setIdx(idx + 1); setPicked(null); return; }
    if (mode === 'daily') k.finishDaily();
    setFinished(true);
  };

  return (
    <SafeAreaView style={ks.safe} edges={['top']}>
      <View style={ks.header}>
        <TouchableOpacity style={ks.back} onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('knowledge.quiz.close')} testID="knowledge-quiz-close">
          <Ionicons name="close" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[ks.title, { fontSize: 20 }]} accessibilityRole="header">{mode === 'daily' ? t('knowledge.daily.title') : t('knowledge.path.title')}</Text>
          {q && !finished ? <Text style={ks.subtitle}>{t('knowledge.quiz.question', { n: idx + 1, total: questions!.length })}</Text> : null}
        </View>
      </View>

      <ScrollView contentContainerStyle={ks.content}>
        {!questions ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 30 }} />
        ) : questions.length === 0 ? (
          <Text style={ks.p}>{t('knowledge.quiz.empty')}</Text>
        ) : finished ? (
          <View style={ks.card} testID="knowledge-quiz-result">
            <Text style={[ks.title, { fontSize: 22 }]}>{t('knowledge.quiz.result', { right, total: questions.length })}</Text>
            <Text style={[ks.p, { marginTop: 8 }]}>{t('knowledge.quiz.resultHint')}</Text>
            <TouchableOpacity style={ks.btn} onPress={() => router.back()} accessibilityRole="button" testID="knowledge-quiz-done">
              <Text style={ks.btnTxt}>{t('knowledge.quiz.close')}</Text>
            </TouchableOpacity>
          </View>
        ) : q ? (
          <View style={ks.card}>
            <View style={ks.bar}><View style={[ks.barFill, { width: `${Math.round((idx / questions.length) * 100)}%` }]} /></View>
            <Text style={[ks.h, { fontSize: 17, marginTop: 14, lineHeight: 23 }]} testID="knowledge-quiz-question">{q.question}</Text>
            <View style={{ gap: 9, marginTop: 14 }}>
              {q.options.map((o, i) => {
                const isRight = answered && i === q.correct;
                const isWrong = answered && i === picked && i !== q.correct;
                return (
                  <TouchableOpacity
                    key={o}
                    onPress={() => choose(i)}
                    disabled={answered}
                    style={{
                      borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12,
                      borderColor: isRight ? C.accent : isWrong ? C.warning : C.borderLight,
                      backgroundColor: isRight ? C.accentDim : 'transparent',
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: picked === i, disabled: answered }}
                    testID={`knowledge-quiz-option-${i}`}
                  >
                    <Text style={{ fontSize: 14.5, color: C.white, fontWeight: isRight ? '800' : '500' }}>{o}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {answered ? (
              <View style={{ marginTop: 14 }} accessibilityLiveRegion="polite">
                <Text style={[ks.h, { color: picked === q.correct ? C.accent : C.warning }]} testID="knowledge-quiz-feedback">
                  {picked === q.correct ? t('knowledge.quiz.right') : t('knowledge.quiz.wrong')}
                </Text>
                <Text style={[ks.p, { marginTop: 4 }]}>{q.explanation}</Text>
                <TouchableOpacity onPress={() => router.push({ pathname: '/wissen/[id]', params: { id: q.articleId } } as never)} accessibilityRole="link">
                  <Text style={[ks.small, ks.link, { marginTop: 8 }]}>{t('knowledge.quiz.readArticle')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={ks.btn} onPress={next} accessibilityRole="button" testID="knowledge-quiz-next">
                  <Text style={ks.btnTxt}>{idx + 1 < questions.length ? t('knowledge.quiz.next') : t('knowledge.quiz.finish')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
