import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { askKnowledge, type AskAnswer } from '@/features/knowledge/ask';
import { SourceRefs } from '@/features/knowledge/ui/SourceRefs';
import { ks } from '@/features/knowledge/ui/styles';

// Coach · Frage zur Prüfungsordnung. Antwortet nur aus der Wissensbibliothek, immer mit
// Fundstelle; ohne Treffer sagt der Coach das offen. Kein Sprachmodell, nichts verlässt
// das Gerät, die Frage wird nicht gespeichert.
export function CoachAskCard() {
  const router = useRouter();
  const { t } = useT();
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<AskAnswer | null>(null);

  const submit = () => {
    const q = text.trim();
    if (!q) return;
    setAnswer(askKnowledge(q));
  };

  return (
    <View style={ks.card} testID="coach-ask">
      <View style={ks.row}>
        <View style={ks.icon}><Ionicons name="book" size={18} color={C.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={ks.h}>{t('knowledge.ask.title')}</Text>
          <Text style={ks.small}>{t('knowledge.ask.hint')}</Text>
        </View>
      </View>
      <View style={[ks.row, { marginTop: 12, gap: 8 }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          returnKeyType="search"
          placeholder={t('knowledge.ask.placeholder')}
          placeholderTextColor={C.textPlaceholder}
          style={{ flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: C.white, fontSize: 14 }}
          accessibilityLabel={t('knowledge.ask.title')}
          maxLength={200}
          testID="coach-ask-input"
        />
        <TouchableOpacity
          onPress={submit}
          disabled={!text.trim()}
          style={{ borderRadius: 12, backgroundColor: text.trim() ? C.accent : C.cardAlt, paddingHorizontal: 14, paddingVertical: 11 }}
          accessibilityRole="button"
          testID="coach-ask-submit"
        >
          <Text style={{ fontWeight: '800', color: text.trim() ? C.accentText : C.muted }}>{t('knowledge.ask.submit')}</Text>
        </TouchableOpacity>
      </View>

      {answer ? (
        answer.hits.length === 0 ? (
          <Text style={[ks.p, { marginTop: 12 }]} testID="coach-ask-nohit">{t('knowledge.ask.noHit')}</Text>
        ) : (
          <View style={{ marginTop: 12, gap: 14 }} accessibilityLiveRegion="polite">
            {answer.hits.map(h => (
              <View key={h.article.id} testID={`coach-ask-hit-${h.article.id}`}>
                <Text style={[ks.h, { fontSize: 14 }]}>{h.article.title}</Text>
                <View style={{ gap: 6, marginTop: 6 }}>
                  {h.points.map(p => (
                    <View key={p} style={{ flexDirection: 'row', gap: 8 }}>
                      <Text style={[ks.p, { color: C.accent }]}>•</Text>
                      <Text style={[ks.p, { flex: 1 }]}>{p}</Text>
                    </View>
                  ))}
                </View>
                <SourceRefs refs={h.refs} showLink={false} />
                <TouchableOpacity onPress={() => router.push({ pathname: '/wissen/[id]', params: { id: h.article.id } } as never)} accessibilityRole="link">
                  <Text style={[ks.small, ks.link, { marginTop: 6 }]}>{t('knowledge.ask.openArticle')}</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={ks.notice}>{t('knowledge.source.notice')}</Text>
          </View>
        )
      ) : null}
    </View>
  );
}
