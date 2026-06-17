import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text,
  TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';
import { useDogs } from '@/hooks/useDogs';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useSession } from '@/hooks/useSession';
import { scoreLabel } from '@/services/analytics/scoring';
import { getTrainingUnits } from '@/services/trainingUnitService';
import { generateAIAnalysis } from '@/services/aiAnalysis';
import { ScoreRing }          from '@/components/analytics/ScoreRing';
import { RadarChart }          from '@/components/analytics/RadarChart';
import { TrendLine }           from '@/components/analytics/TrendLine';
import { MetricRow }           from '@/components/analytics/MetricRow';
import { AICoachCard }         from '@/components/analytics/AICoachCard';
import { RecommendationCard }  from '@/components/analytics/RecommendationCard';
import { METRIC_LABELS }       from '@/types/analytics';
import type { TrainingAnalysis } from '@/types/analytics';
import type { TrainingUnit } from '@/types/trainingUnit';

const PERIODS = [
  { label: '7T',  days: 7  },
  { label: '30T', days: 30 },
  { label: '90T', days: 90 },
] as const;

export default function AnalyticsScreen() {
  const { session }            = useSession();
  const { dogs }               = useDogs();
  const [dogIdx,   setDogIdx]  = useState(0);
  const [period,   setPeriod]  = useState<7 | 30 | 90>(30);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOverride, setAiOverride] = useState<TrainingAnalysis | null>(null);
  const { width }              = useWindowDimensions();
  const router                 = useRouter();

  const selectedDog = dogs[dogIdx] ?? null;
  const {
    latestScore, latestAnalysis, trend7, trend30,
    trendPoints, recommendations, loading, refresh,
  } = useAnalytics(selectedDog?.id ?? null);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const runAIAnalysis = async () => {
    if (!selectedDog || !session?.user.id) return;
    setAiLoading(true);
    try {
      const { data, error } = await getTrainingUnits(session.user.id, selectedDog.id);
      if (error) { Alert.alert('Fehler beim Laden', error.message); return; }
      const units = (data as TrainingUnit[]) ?? [];
      if (!units.length) {
        Alert.alert('Keine Trainings', `Für ${selectedDog.name} wurden noch keine Einheiten erfasst.`);
        return;
      }
      // Einheiten → AI-Input (1 Einheit = 1 "Session")
      const input = units.map(u => ({
        session_date:     u.session_date,
        category:         u.exercises?.[0]?.discipline ?? 'Training',
        title:            (u.exercises ?? []).map(e => e.exercise_name).join(', ') || null,
        duration_minutes: u.duration_sec != null ? Math.round(u.duration_sec / 60) : null,
        rating:           u.score ?? u.rating,
        notes:            u.notes,
        motivation:       u.motivation,
        konzentration:    u.konzentration,
        praezision:       u.praezision,
        ausdauer:         u.ausdauer,
        trieblage:        u.trieblage,
        impulskontrolle:  u.impulskontrolle,
        belastung:        null,
      }));
      const result = await generateAIAnalysis(input, selectedDog.name);
      // Ergebnis live anzeigen (keine Persistenz in der Alt-Tabelle).
      setAiOverride({
        id: 'ai-live', session_id: units[0].id, user_id: session.user.id, dog_id: selectedDog.id,
        created_at: new Date().toISOString(), ...result,
      });
    } catch (e: any) {
      Alert.alert('Ups, kurze Pause 🐾', e?.message ?? 'Analyse noch nicht fertig — versuch es nochmal!');
    } finally {
      setAiLoading(false);
    }
  };

  // LLM-Analyse (lokal) überschreibt die live berechnete Coach-Auswertung.
  const coach = aiOverride ?? latestAnalysis;
  // Override zurücksetzen, wenn der Hund gewechselt wird.
  useEffect(() => { setAiOverride(null); }, [selectedDog?.id]);

  const activeTrend = period === 7 ? trend7 : trend30;

  const trendIcon = activeTrend.direction === 'up'
    ? 'trending-up' : activeTrend.direction === 'down'
    ? 'trending-down' : 'remove';
  const trendColor = activeTrend.direction === 'up'
    ? C.accent : activeTrend.direction === 'down'
    ? '#FF3B30' : C.muted;

  const metricEntries = latestScore
    ? (Object.keys(METRIC_LABELS) as (keyof typeof METRIC_LABELS)[])
        .map((k, i) => ({ key: k, label: METRIC_LABELS[k], value: latestScore[k], delay: i * 80 }))
        .filter(e => e.value > 0)
    : [];

  return (
    <View style={s.root}>
      {/* ── Header ── */}
      <SafeAreaView edges={['top']} style={s.headerWrap}>
        <LinearGradient
          colors={['#0A0A0A', 'transparent']}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={s.header}>
          <View>
            <Text style={s.headerSub}>ANALYSE</Text>
            <Text style={s.headerTitle}>
              {selectedDog ? selectedDog.name : 'Training'}
            </Text>
          </View>
          {/* Period selector */}
          <View style={s.periodRow}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.days}
                style={[s.periodBtn, period === p.days && s.periodBtnActive]}
                onPress={() => setPeriod(p.days as 7 | 30 | 90)}
                activeOpacity={0.7}
              >
                {period === p.days && (
                  <LinearGradient
                    colors={['#00FFCC', '#00FFCC']}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Text style={[s.periodTxt, period === p.days && s.periodTxtActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Dog tabs */}
        {dogs.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.dogScroll} contentContainerStyle={s.dogScrollContent}>
            {dogs.map((d, i) => (
              <TouchableOpacity
                key={d.id}
                style={[s.dogChip, i === dogIdx && s.dogChipActive]}
                onPress={() => setDogIdx(i)}
                activeOpacity={0.75}
              >
                {i === dogIdx && (
                  <LinearGradient
                    colors={['rgba(0,255,204,0.15)', 'rgba(0,255,204,0.05)']}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Text style={[s.dogChipTxt, i === dogIdx && s.dogChipTxtActive]}>{d.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Smart Search / Insights (KI-Semantiksuche) ── */}
          <TouchableOpacity
            onPress={() => router.push('/analyse/insights' as never)}
            activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 15, paddingVertical: 14,
              borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginBottom: 16 }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles" size={19} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: C.white, fontWeight: '700' }}>Smart Search</Text>
              <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Trainings nach Bedeutung durchsuchen</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.muted} />
          </TouchableOpacity>

          {/* ── Hero Score Card ── */}
          <View style={s.heroCard}>
            <LinearGradient
              colors={['#0F0F1A', '#111118']}
              style={StyleSheet.absoluteFill}
            />
            <View style={s.heroInner}>
              <View style={s.ringWrap}>
                <ScoreRing
                  score={latestScore?.gesamtscore ?? 0}
                  size={150}
                  label={latestScore ? scoreLabel(latestScore.gesamtscore) : 'Keine Daten'}
                />
              </View>

              <View style={s.heroStats}>
                {/* Trend */}
                <View style={s.statItem}>
                  <View style={s.statIconRow}>
                    <Ionicons name={trendIcon} size={14} color={trendColor} />
                    <Text style={[s.statValue, { color: trendColor }]}>
                      {activeTrend.deltaPct > 0 ? `+${activeTrend.deltaPct}%` : `${activeTrend.deltaPct}%`}
                    </Text>
                  </View>
                  <Text style={s.statLabel}>Trend</Text>
                </View>

                <View style={s.statDivider} />

                {/* Stabilität */}
                <View style={s.statItem}>
                  <Text style={s.statValue}>{activeTrend.stabilität}%</Text>
                  <Text style={s.statLabel}>Stabilität</Text>
                </View>

                <View style={s.statDivider} />

                {/* Sessions */}
                <View style={s.statItem}>
                  <Text style={s.statValue}>{activeTrend.sessions}</Text>
                  <Text style={s.statLabel}>Einheiten</Text>
                </View>
              </View>

              {/* Avg score badge */}
              {activeTrend.durchschnitt > 0 && (
                <View style={s.avgBadge}>
                  <Text style={s.avgBadgeTxt}>
                    Ø {activeTrend.durchschnitt} Punkte im Zeitraum
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ── KI Analyse Button ── */}
          {selectedDog && (
            <TouchableOpacity
              style={[s.aiBtn, aiLoading && s.aiBtnDis]}
              onPress={runAIAnalysis}
              disabled={aiLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={aiLoading ? [C.cardAlt, C.cardAlt] : ['#00FFCC', '#00FFCC']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              {aiLoading ? (
                <View style={s.aiBtnRow}>
                  <ActivityIndicator size="small" color={C.muted} />
                  <Text style={[s.aiBtnTxt, { color: C.muted }]}>Claude analysiert…</Text>
                </View>
              ) : (
                <View style={s.aiBtnRow}>
                  <Text style={s.aiBtnIcon}>✦</Text>
                  <Text style={s.aiBtnTxt}>
                    {coach ? 'KI Analyse aktualisieren' : 'KI Analyse starten'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* ── KI Coach ── */}
          {coach && <AICoachCard analysis={coach} />}

          {!coach && !loading && !aiLoading && (
            <View style={s.emptyCard}>
              <Ionicons name="analytics-outline" size={32} color={C.subtle} style={{ marginBottom: 10 }} />
              <Text style={s.emptyTitle}>Sammle Trainings und entdecke dein Potenzial ✨</Text>
              <Text style={s.emptyText}>
                Tippe auf „KI Analyse starten“ — Claude wertet deine Trainings aus.
              </Text>
            </View>
          )}

          {/* ── Radar Chart ── */}
          {latestScore && latestScore.gesamtscore > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>LEISTUNGSPROFIL</Text>
              <View style={s.radarWrap}>
                <RadarChart scores={latestScore} size={Math.min(width - 64, 280)} />
              </View>
            </View>
          )}

          {/* ── Metriken ── */}
          {metricEntries.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>METRIKEN — LETZTE EINHEIT</Text>
              {metricEntries.map(e => (
                <MetricRow key={e.key} label={e.label} value={e.value} delay={e.delay} />
              ))}
            </View>
          )}

          {/* ── Trend Chart ── */}
          {trendPoints.length > 1 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>PERFORMANCE VERLAUF</Text>
              <View style={s.chartWrap}>
                <TrendLine
                  points={trendPoints}
                  width={width - 64}
                  height={120}
                />
              </View>
            </View>
          )}

          {/* ── Empfehlungen ── */}
          {recommendations.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>EMPFEHLUNGEN</Text>
              {recommendations.map(r => (
                <RecommendationCard key={r.id} item={r} />
              ))}
            </View>
          )}

          {latestAnalysis?.empfehlungen && latestAnalysis.empfehlungen.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>TRAININGSHINWEISE</Text>
              {latestAnalysis.empfehlungen.map((e, i) => (
                <View key={i} style={s.hintRow}>
                  <View style={s.hintDot} />
                  <Text style={s.hintText}>{e}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerWrap:  { paddingBottom: 0, overflow: 'hidden' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  headerSub:   { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  headerTitle: { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  periodRow:      { flexDirection: 'row', gap: 4 },
  periodBtn:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  periodBtnActive:{ borderColor: C.accent },
  periodTxt:      { fontSize: 11, color: C.muted, fontWeight: '700' },
  periodTxtActive:{ color: C.accentText },

  dogScroll:        { marginBottom: 12 },
  dogScrollContent: { paddingHorizontal: 20, gap: 8, flexDirection: 'row' },
  dogChip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  dogChipActive:    { borderColor: `${C.accent}80` },
  dogChipTxt:       { fontSize: 13, color: C.muted, fontWeight: '600' },
  dogChipTxtActive: { color: C.accent },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8 },

  heroCard: {
    borderRadius:    22,
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     C.border,
    marginBottom:    16,
    padding:         20,
  },
  heroInner:  { alignItems: 'center' },
  ringWrap:   { marginBottom: 20 },
  heroStats:  { flexDirection: 'row', gap: 0, marginBottom: 14 },
  statItem:   { flex: 1, alignItems: 'center', gap: 4 },
  statIconRow:{ flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue:  { fontSize: 17, color: C.white, fontWeight: '800' },
  statLabel:  { fontSize: 9,  color: C.muted, fontWeight: '700', letterSpacing: 1 },
  statDivider:{ width: 1, height: 32, backgroundColor: C.border, marginHorizontal: 4 },
  avgBadge:   { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 5 },
  avgBadgeTxt:{ fontSize: 11, color: C.muted, fontWeight: '600' },

  aiBtn: {
    borderRadius:    16,
    overflow:        'hidden',
    marginBottom:    16,
    paddingVertical: 15,
    alignItems:      'center',
    justifyContent:  'center',
  },
  aiBtnDis:  { opacity: 0.6 },
  aiBtnRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiBtnIcon: { fontSize: 14, color: C.accentText },
  aiBtnTxt:  { fontSize: 15, fontWeight: '800', color: C.accentText },

  card:       { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 16 },
  cardTitle:  { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 16 },
  radarWrap:  { alignItems: 'center' },
  chartWrap:  { alignItems: 'center', marginTop: 4 },

  section:      { marginBottom: 16 },
  sectionTitle: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12 },

  hintRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  hintDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, marginTop: 5 },
  hintText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 19 },

  emptyCard:  { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 32, alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 15, color: C.white, fontWeight: '700', marginBottom: 8 },
  emptyText:  { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 19 },
});
