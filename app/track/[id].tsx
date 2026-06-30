import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { TrackScoreRing } from '@/features/tracking/components/TrackScoreRing';
import { LegBars, type LegRow } from '@/features/tracking/components/LegBars';
import { FaehrtenHeader, SectionLabel, relDate } from '@/features/tracking/components/FaehrtenChrome';
import { getTrackSessionById, saveTrackEvaluation } from '@/features/tracking/services/trackService';
import { createEmbeddingForTrackSummary } from '@/features/ai/services/trainingEmbeddingService';
import { SmartFeedbackSection } from '@/features/ai/components/SmartFeedbackSection';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { extractTags, legsFromSession, overallScore, scoreVerdict } from '@/features/tracking/utils/trackEvaluation';
import type { LatLng } from '@/features/tracking/utils/gpsFilter';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function TrackAuswertungScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [legs, setLegs]   = useState<LegRow[]>([]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    useTrackingStore.getState().reset();   // Flow abgeschlossen → Store leeren
    if (!id) return;
    getTrackSessionById(id).then(r => {
      const d = r.data;
      setData(d);
      if (d) {
        setLegs(legsFromSession(d.track_data, d.corners_total ?? 0, d.articles_total ?? 0));
        setNotes(d.notes ?? '');
      }
      setLoading(false);
    });
  }, [id]);

  const score = useMemo(() => overallScore(legs), [legs]);
  const verdict = scoreVerdict(score);
  const totalPts = legs.reduce((a, b) => a + b.score, 0);
  const maxPts = legs.reduce((a, b) => a + b.max, 0);
  const tags = extractTags(notes);

  const map = useMemo(() => {
    if (!data) return null;
    const lay: LatLng[] = (data.points ?? []).filter((p: any) => (p.point_type ?? 'lay') === 'lay').map((p: any) => ({ lat: p.latitude, lng: p.longitude }));
    const run: LatLng[] = ((data.runs ?? [])[0]?.run_points ?? []).map((p: any) => ({ lat: p.lat, lng: p.lng }));
    const markers: MapMarker[] = (data.markers ?? []).map((m: any) => ({ type: m.marker_type, lat: m.latitude, lng: m.longitude, angleKind: m.angle_kind }));
    const center = lay[Math.floor(lay.length / 2)] ?? null;
    return { lay, run, markers, center, hasGps: lay.length > 1 };
  }, [data]);

  const onSave = async () => {
    if (!id) return;
    setSaving(true);
    const { error } = await saveTrackEvaluation(id, { legs, rating: score, notes: notes.trim() || null });
    setSaving(false);
    if (!error) {
      // Semantik-Embedding (non-blocking) — darf das Speichern nicht aufhalten.
      const surf = data.surface_types?.[0] ?? 'Fährte';
      const text = `Fährte ${surf}, ${data.corners_total ?? 0} Winkel, ${data.articles_total ?? 0} Gegenstände, `
        + `Score ${score}/100${notes.trim() ? `. Notiz: ${notes.trim()}` : ''}`;
      void createEmbeddingForTrackSummary({
        trainingSessionId: id, sourceId: id, content: text, contentSummary: notes.trim() || undefined,
        metadata: {
          dog_id: data.dog_id, category: 'Fährte', score,
          surface_types: data.surface_types ?? [], session_date: data.session_date ?? null,
        },
      });
      router.replace('/track' as never);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={C.trackPrimary} size="large" /></View>;
  if (!data)   return <View style={s.center}><Text style={s.muted}>Fährte nicht gefunden.</Text></View>;

  const dogName = data.dog?.name ?? 'Fährte';
  const surface = data.surface_types?.[0] ?? 'Fährte';
  const corners = data.corners_total ?? 0;
  const aFound = data.articles_found ?? 0;
  const aTotal = data.articles_total ?? 0;
  const distractions = data.distractions_total ?? 0;

  // Bedingungen (echtes Wetter zur Startposition + Untergrund/Beschaffenheit).
  const weatherCond: string | null = data.weather_condition ?? data.wetter ?? null;
  const temp: number | null     = data.temperature ?? null;
  const wind: number | null     = data.wind_speed ?? null;
  const humidity: number | null = data.humidity ?? null;
  const terrain: string[]       = data.terrain_conditions ?? [];
  const condStats: { icon: IconName; label: string; value: string }[] = [
    ...(weatherCond     ? [{ icon: 'partly-sunny-outline' as IconName, label: 'Wetter',     value: weatherCond }] : []),
    ...(temp != null     ? [{ icon: 'thermometer-outline' as IconName, label: 'Temperatur', value: `${temp.toFixed(1)} °C` }] : []),
    ...(wind != null     ? [{ icon: 'flag-outline'        as IconName, label: 'Wind',       value: `${Math.round(wind)} km/h` }] : []),
    ...(humidity != null ? [{ icon: 'water-outline'       as IconName, label: 'Feuchte',    value: `${Math.round(humidity)} %` }] : []),
  ];
  const condTags = [surface, ...terrain].filter(Boolean);
  const hasConditions = condStats.length > 0 || condTags.length > 0;

  const highlights: { icon: IconName; value: string; label: string }[] = [
    { icon: 'flag',          value: `${aFound}/${aTotal}`, label: 'Gegenstände' },
    { icon: 'git-branch',    value: String(corners),       label: 'Winkel' },
    { icon: 'shuffle',       value: distractions > 0 ? String(distractions) : '–', label: 'Verleitung' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <FaehrtenHeader title="AUSWERTUNG" onBack={() => (router.canGoBack() ? router.back() : router.replace('/track' as never))} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Hero */}
          <View style={[s.card, s.cardGlow, s.hero]}>
            <TrackScoreRing value={score} size={118} label="Punkte" sub={verdict.sub} />
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>{dogName} · {relDate(data.session_date ?? data.created_at)}</Text>
              <Text style={s.heroHeadline}>{verdict.headline}</Text>
              <View style={s.tagRow}>
                {data.distance_meters != null && <Tag>{Math.round(data.distance_meters)} m</Tag>}
                <Tag>{surface}</Tag>
                <Tag>{corners} Winkel</Tag>
              </View>
            </View>
          </View>

          {/* Highlights */}
          <View style={s.highlightRow}>
            {highlights.map((h, i) => (
              <View key={i} style={[s.card, s.highlight]}>
                <Ionicons name={h.icon} size={20} color={C.trackPrimary} />
                <Text style={s.highlightVal}>{h.value}</Text>
                <Text style={s.highlightLabel}>{h.label}</Text>
              </View>
            ))}
          </View>

          {/* Bedingungen — Wetter (echt) + Untergrund/Beschaffenheit */}
          {hasConditions && (
            <>
              <SectionLabel>Bedingungen</SectionLabel>
              <View style={[s.card, { padding: 16, marginBottom: 16 }]}>
                {condStats.length > 0 && (
                  <View style={s.condGrid}>
                    {condStats.map((cnd, i) => (
                      <View key={i} style={s.condItem}>
                        <View style={s.condIcon}><Ionicons name={cnd.icon} size={17} color={C.trackPrimary} /></View>
                        <View>
                          <Text style={s.condLabel}>{cnd.label}</Text>
                          <Text style={s.condValue}>{cnd.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                {condTags.length > 0 && (
                  <View style={[s.tagRow, condStats.length > 0 && { marginTop: 14 }]}>
                    {condTags.map((t, i) => <Tag key={i}>{t}</Tag>)}
                  </View>
                )}
              </View>
            </>
          )}

          {/* Bewertung pro Abschnitt */}
          <SectionLabel>Bewertung pro Abschnitt</SectionLabel>
          <View style={[s.card, { padding: 16, marginBottom: 16 }]}>
            <LegBars rows={legs} editable onChange={(i, v) => setLegs(prev => prev.map((l, j) => j === i ? { ...l, score: v } : l))} />
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>GESAMTPUNKTZAHL</Text>
              <Text style={s.totalVal}>{totalPts}<Text style={s.totalMax}>/{maxPts}</Text></Text>
            </View>
          </View>

          {/* Fährtenverlauf */}
          <SectionLabel>Fährtenverlauf</SectionLabel>
          <View style={[s.card, s.mapCard]}>
            <View style={StyleSheet.absoluteFill}>
              {map?.hasGps ? (
                <TrackingMap layPoints={map.lay} runPoints={map.run} markers={map.markers} currentPosition={map.center} follow={false} mapType="hybrid" />
              ) : (
                <TrackSketch legs={corners} objects={aTotal} w={320} h={190} progress={1} />
              )}
            </View>
            <View style={s.legend}>
              <Legend color={C.trackPrimary} label="Fährte" />
              <Legend color="#fff" label="Gegenstand" square />
              <Legend color={C.trackWarning} label="Korrektur" />
            </View>
          </View>

          {/* Notiz */}
          <SectionLabel>Notiz</SectionLabel>
          <View style={[s.card, { padding: 16 }]}>
            <TextInput
              style={s.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Beobachtungen zur Ausarbeitung… (#hashtags möglich)"
              placeholderTextColor={C.trackTextMut}
              multiline
            />
            {tags.length > 0 && (
              <View style={s.tagRow}>{tags.map(t => <Tag key={t}>{t}</Tag>)}</View>
            )}
          </View>

          <View style={{ height: 18 }} />
          <SmartFeedbackSection dogId={data.dog_id} />

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Footer */}
        <View style={s.footer}>
          <AnyvoButton label="Logbuch" variant="secondary" icon="layers-outline" onPress={() => router.push('/track/historie' as never)} style={{ flex: 1 }} />
          <AnyvoButton label="Speichern" icon="checkmark" onPress={onSave} loading={saving} style={{ flex: 1.4 }} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <View style={s.tag}><Text style={s.tagTxt}>{children}</Text></View>;
}

function Legend({ color, label, square }: { color: string; label: string; square?: boolean }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color, borderRadius: square ? 2 : 5, transform: square ? [{ rotate: '45deg' }] : undefined }]} />
      <Text style={s.legendTxt}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.trackBg },
  center:  { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center' },
  muted:   { color: C.trackTextMut, fontSize: 14 },
  content: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 },

  card:     { backgroundColor: C.trackCard, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder },
  cardGlow: { borderColor: C.trackPrimaryDk + '38', shadowColor: C.trackPrimary, shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 5 },

  hero:        { flexDirection: 'row', alignItems: 'center', gap: 18, padding: 20, marginBottom: 14 },
  eyebrow:     { fontSize: 11, color: C.trackTextMut, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  heroHeadline:{ fontSize: 26, color: C.trackText, fontWeight: '900', letterSpacing: -0.5, lineHeight: 26, marginBottom: 10 },

  tagRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag:     { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  tagTxt:  { fontSize: 11, color: C.trackTextSec, fontWeight: '600' },

  highlightRow:  { flexDirection: 'row', gap: 10, marginBottom: 16 },
  highlight:     { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, gap: 6 },
  highlightVal:  { fontSize: 16, color: C.trackText, fontWeight: '900' },
  highlightLabel:{ fontSize: 8, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },

  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.trackBorder },
  totalLabel:{ fontSize: 10, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1.4 },
  totalVal:  { fontSize: 22, color: C.trackPrimary, fontWeight: '900' },
  totalMax:  { fontSize: 14, color: C.trackTextMut, fontWeight: '700' },

  condGrid:  { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 12 },
  condItem:  { width: '46%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  condIcon:  { width: 38, height: 38, borderRadius: 12, backgroundColor: C.trackPrimaryDk + '24', alignItems: 'center', justifyContent: 'center' },
  condLabel: { fontSize: 9, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  condValue: { fontSize: 15, color: C.trackText, fontWeight: '800', marginTop: 1 },

  mapCard: { height: 190, overflow: 'hidden', marginBottom: 16, padding: 0 },
  legend:  { position: 'absolute', left: 14, bottom: 12, flexDirection: 'row', gap: 14 },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9 },
  legendTxt: { fontSize: 10, color: C.trackTextSec, fontWeight: '600' },

  notesInput:{ fontSize: 14, color: C.trackText, lineHeight: 21, minHeight: 70, textAlignVertical: 'top' },

  footer:  { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26, borderTopWidth: 1, borderTopColor: C.trackBorder, backgroundColor: C.trackBg },
});
