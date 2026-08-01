import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useAiCoach } from '@/features/ai/hooks/useAiCoach';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useT } from '@/i18n';

// Kompakte Dashboard-Card — nicht dominant. Zeigt den wichtigsten Hinweis oder
// die Wochenstatistik und führt zum Smart Coach (regelbasiert).
// Gating: Smart Coach ist eine Premium-Funktion. NEWBIE (isPro=false) sieht nur
// einen Upgrade-Hinweis, KEINE Coach-Auswertung (kein Datenabruf für NEWBIE).
export function AiCoachCard() {
  const router = useRouter();
  const { t } = useT();
  const { isPro } = useCapabilities();

  if (!isPro) {
    return (
      <TouchableOpacity style={s.card} onPress={() => router.push('/premium' as never)} activeOpacity={0.85}>
        <View style={s.icon}><Ionicons name="lock-closed" size={18} color={C.accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>SMART COACH</Text>
          <Text style={s.headline} numberOfLines={1}>{t('premium.upgradeActive')}</Text>
        </View>
        <Text style={s.cta}>{t('premium.activeShort')}</Text>
        <Ionicons name="chevron-forward" size={18} color={C.muted} />
      </TouchableOpacity>
    );
  }

  return <AiCoachCardContent />;
}

function AiCoachCardContent() {
  const router = useRouter();
  const { t } = useT();
  const { data, isLoading } = useAiCoach();

  const important = data.insights.filter(i => i.severity === 'warning' || i.severity === 'critical');
  const headline = important.length > 0
    ? t('analyse.importantHints', { count: important.length, suffixImportant: important.length === 1 ? 'r' : '', suffixHint: important.length === 1 ? '' : 'e' })
    : data.weekly.sessions > 0
      ? t('analyse.thisWeekTrainings', { count: data.weekly.sessions, plural: data.weekly.sessions === 1 ? '' : 's', score: data.weekly.avgScore != null ? `, Ø ${data.weekly.avgScore}` : '' })
      : t('analyse.detectsPatterns');

  return (
    <TouchableOpacity style={s.card} onPress={() => router.push('/analyse/coach' as never)} activeOpacity={0.85}>
      <View style={s.icon}><Ionicons name="sparkles" size={19} color={C.accent} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>SMART COACH</Text>
        <Text style={s.headline} numberOfLines={1}>{isLoading ? t('analyse.summaryRunning') : headline}</Text>
      </View>
      {important.length > 0 && <View style={s.dot} />}
      <Text style={s.cta}>{t('analyse.view')}</Text>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card:    { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, paddingHorizontal: 15, paddingVertical: 14 },
  icon:    { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  label:   { fontSize: 9.5, color: C.muted, fontWeight: '800', letterSpacing: 1.5 },
  headline:{ fontSize: 14.5, color: C.white, fontWeight: '700', marginTop: 2 },
  cta:     { fontSize: 12.5, color: C.muted, fontWeight: '700' },
  dot:     { width: 9, height: 9, borderRadius: 5, backgroundColor: C.warning },
});
