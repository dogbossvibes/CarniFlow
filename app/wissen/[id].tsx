import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { articleById, questionsForArticles } from '@/features/knowledge/learning';
import { useKnowledge } from '@/features/knowledge/useKnowledge';
import { SourceRefs } from '@/features/knowledge/ui/SourceRefs';
import { ks } from '@/features/knowledge/ui/styles';

// Wissenskarte: eigene Zusammenfassung mit Fundstelle und Link zum offiziellen Wortlaut.
export default function KnowledgeArticleScreen() {
  const router = useRouter();
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const article = id ? articleById(String(id)) : undefined;
  const { markRead, loaded } = useKnowledge();
  const [linkError, setLinkError] = useState(false);
  const count = article ? questionsForArticles([article.id]).length : 0;

  useEffect(() => { if (article && loaded) markRead(article.id); }, [article, loaded, markRead]);

  return (
    <SafeAreaView style={ks.safe} edges={['top']}>
      <View style={ks.header}>
        <TouchableOpacity style={ks.back} onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('knowledge.quiz.close')}>
          <Ionicons name="chevron-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[ks.title, { fontSize: 20 }]} accessibilityRole="header">{article?.title ?? t('knowledge.title')}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={ks.content}>
        {!article ? (
          <Text style={ks.p}>{t('knowledge.article.notFound')}</Text>
        ) : (
          <>
            <View style={ks.card}>
              <Text style={[ks.p, { color: C.white, fontWeight: '600' }]}>{article.summary}</Text>
              <View style={{ gap: 8, marginTop: 12 }}>
                {article.points.map(p => (
                  <View key={p} style={{ flexDirection: 'row', gap: 8 }}>
                    <Text style={[ks.p, { color: C.accent }]}>•</Text>
                    <Text style={[ks.p, { flex: 1 }]}>{p}</Text>
                  </View>
                ))}
              </View>
              <SourceRefs refs={article.refs} onLinkError={() => setLinkError(true)} />
              {linkError ? <Text style={[ks.small, { color: C.warning }]}>{t('knowledge.source.openFailed')}</Text> : null}
            </View>
            {count > 0 ? (
              <TouchableOpacity
                style={ks.btn}
                onPress={() => router.push({ pathname: '/wissen/quiz', params: { mode: 'article', id: article.id } } as never)}
                accessibilityRole="button"
                testID="knowledge-article-quiz"
              >
                <Text style={ks.btnTxt}>{t('knowledge.article.practise')} ({count})</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={ks.notice}>{t('knowledge.source.notice')}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
