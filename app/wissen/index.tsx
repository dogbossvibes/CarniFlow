import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { ARTICLES } from '@/features/knowledge/content/library';
import { DAILY_SIZE, moduleStates } from '@/features/knowledge/learning';
import { streak } from '@/features/knowledge/progress';
import { useKnowledge } from '@/features/knowledge/useKnowledge';
import type { KnowledgeTopic } from '@/features/knowledge/types';
import { ks } from '@/features/knowledge/ui/styles';
import type { TranslationKey } from '@/i18n';

const TOPICS: readonly KnowledgeTopic[] = ['zulassung', 'bewertung', 'ablauf', 'faehrte', 'unterordnung', 'schutzdienst'];

// Wissen: Tagesquiz, Lernpfad und Bibliothek zur Prüfungsordnung (für alle Konten).
export default function KnowledgeScreen() {
  const router = useRouter();
  const { t, locale } = useT();
  const k = useKnowledge();
  const doneToday = k.progress.quizDays.includes(k.today);
  const days = streak(k.progress, k.today);
  const modules = moduleStates(k.progress);

  return (
    <SafeAreaView style={ks.safe} edges={['top']}>
      <View style={ks.header}>
        <TouchableOpacity style={ks.back} onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('knowledge.quiz.close')}>
          <Ionicons name="chevron-back" size={20} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={ks.title} accessibilityRole="header">{t('knowledge.title')}</Text>
          <Text style={ks.subtitle}>{t('knowledge.subtitle')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={ks.content} showsVerticalScrollIndicator={false}>
        {locale !== 'de' && locale !== 'gsw' ? <Text style={[ks.p, { marginBottom: 12 }]}>{t('knowledge.contentGerman')}</Text> : null}

        <View style={ks.card} testID="knowledge-daily">
          <View style={ks.row}>
            <View style={ks.icon}><Ionicons name={doneToday ? 'checkmark' : 'flash'} size={19} color={C.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={ks.h}>{t('knowledge.daily.title')}</Text>
              <Text style={ks.small}>{doneToday ? t('knowledge.daily.done') : t('knowledge.daily.sub', { count: DAILY_SIZE })}</Text>
            </View>
            {days > 0 ? <Text style={[ks.small, { color: C.accent, fontWeight: '700' }]}>{t('knowledge.streak', { count: days })}</Text> : null}
          </View>
          <TouchableOpacity
            style={doneToday ? ks.ghost : ks.btn}
            disabled={!k.loaded}
            onPress={() => router.push({ pathname: '/wissen/quiz', params: { mode: 'daily' } } as never)}
            accessibilityRole="button"
            testID="knowledge-daily-start"
          >
            <Text style={doneToday ? ks.ghostTxt : ks.btnTxt}>{doneToday ? t('knowledge.daily.again') : t('knowledge.daily.start')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={ks.section}>{t('knowledge.path.title')}</Text>
        <View style={{ gap: 10 }}>
          {modules.map((m, i) => (
            <TouchableOpacity
              key={m.module.id}
              style={[ks.card, !m.unlocked && { opacity: 0.5 }]}
              disabled={!m.unlocked || !k.loaded}
              onPress={() => router.push({ pathname: '/wissen/quiz', params: { mode: 'module', id: m.module.id } } as never)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !m.unlocked }}
              accessibilityHint={m.unlocked ? undefined : t('knowledge.path.locked')}
              testID={`knowledge-module-${m.module.id}`}
            >
              <View style={ks.row}>
                <View style={ks.icon}>
                  {m.done ? <Ionicons name="checkmark" size={19} color={C.accent} />
                    : m.unlocked ? <Text style={{ color: C.accent, fontWeight: '900' }}>{i + 1}</Text>
                    : <Ionicons name="lock-closed" size={16} color={C.muted} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ks.h}>{m.module.title}</Text>
                  <Text style={ks.small}>{m.done ? t('knowledge.path.done') : m.unlocked ? t('knowledge.path.progress', { mastered: m.mastered, total: m.total }) : t('knowledge.path.locked')}</Text>
                  {m.unlocked ? <View style={ks.bar}><View style={[ks.barFill, { width: `${m.total ? Math.round((m.mastered / m.total) * 100) : 0}%` }]} /></View> : null}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={ks.section}>{t('knowledge.library.title')}</Text>
        {TOPICS.map(topic => {
          const list = ARTICLES.filter(a => a.topic === topic);
          if (!list.length) return null;
          return (
            <View key={topic} style={{ marginBottom: 14 }}>
              <Text style={[ks.small, { fontWeight: '700', marginBottom: 8, marginLeft: 2 }]}>{t(`knowledge.topic.${topic}` as TranslationKey)}</Text>
              <View style={[ks.card, { padding: 0 }]}>
                {list.map((a, i) => (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => router.push({ pathname: '/wissen/[id]', params: { id: a.id } } as never)}
                    style={[ks.row, { paddingHorizontal: 15, paddingVertical: 13 }, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}
                    accessibilityRole="button"
                    testID={`knowledge-article-${a.id}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[ks.h, { fontSize: 14 }]}>{a.title}</Text>
                      <Text style={ks.small} numberOfLines={2}>{a.summary}</Text>
                    </View>
                    {k.progress.read.includes(a.id) ? <Ionicons name="checkmark-circle" size={16} color={C.accent} /> : null}
                    <Ionicons name="chevron-forward" size={16} color={C.muted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}
        <Text style={ks.notice}>{t('knowledge.source.notice')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
