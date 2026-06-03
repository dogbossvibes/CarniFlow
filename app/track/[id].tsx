import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet,
  Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import {
  getTrackSessionById, getTrackPoints, getTrackArticles, deleteTrackSession,
} from '@/services/trackingService';
import { TrackPath } from '@/components/tracking/TrackPath';
import { Glass, isGlass } from '@/components/ui/Glass';
import type { TrackSession, TrackPoint, TrackArticle } from '@/types/tracking';

function fmtDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(d: string): string {
  const [y, mo, day] = d.split('-');
  return `${day}.${mo}.${y}`;
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={sc.statCard}>
      <Text style={sc.statIcon}>{icon}</Text>
      <Text style={sc.statVal}>{value}</Text>
      <Text style={sc.statLbl}>{label}</Text>
    </View>
  );
}

export default function TrackDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();

  const [track,    setTrack]    = useState<TrackSession | null>(null);
  const [points,   setPoints]   = useState<TrackPoint[]>([]);
  const [articles, setArticles] = useState<TrackArticle[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [trackRes, ptsRes, artRes] = await Promise.all([
        getTrackSessionById(id),
        getTrackPoints(id),
        getTrackArticles(id),
      ]);
      setTrack(trackRes.data as TrackSession);
      setPoints((ptsRes.data as TrackPoint[]) ?? []);
      setArticles((artRes.data as TrackArticle[]) ?? []);
      setLoading(false);
    })();
  }, [id]);

  const handleDelete = () => {
    Alert.alert('Fährte löschen?', 'Diese Aktion kann nicht rückgängig gemacht werden.', [
      { text: 'Zurück', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        await deleteTrackSession(id);
        router.back();
      }},
    ]);
  };

  const pathSize = Math.min(width - 40, 400);

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.loader}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!track) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.loader}>
          <Text style={s.errTxt}>Fährte nicht gefunden.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const gegenstände = articles.filter(a => a.typ === 'gegenstand');
  const verleitungen = articles.filter(a => a.typ === 'verleitung');
  const pathPoints = points.map(p => ({ lat: p.lat, lng: p.lng }));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.eyebrow}>FÄHRTE · {fmtDate(track.session_date)}</Text>
          <Text style={s.title} numberOfLines={1}>
            {track.dog?.name ?? 'Unbekannter Hund'}
          </Text>
        </View>
        <TouchableOpacity style={s.deleteBtn} onPress={handleDelete} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={18} color={C.danger} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Map / Path */}
        <View style={s.pathCard}>
          <LinearGradient colors={['#0A0A10', '#080810']} style={StyleSheet.absoluteFill} />
          <TrackPath
            points={pathPoints}
            articles={articles.map(a => ({ lat: a.lat, lng: a.lng, typ: a.typ, gefunden: a.gefunden }))}
            width={pathSize}
            height={pathSize}
            padding={28}
            bgColor="transparent"
          />
          {pathPoints.length === 0 && (
            <View style={s.noPath}>
              <Ionicons name="map-outline" size={28} color={C.subtle} />
              <Text style={s.noPathTxt}>Keine GPS-Daten</Text>
            </View>
          )}
        </View>

        {/* Metadata chips */}
        {((track.surface_types?.length ?? 0) > 0 || (track.terrain_conditions?.length ?? 0) > 0 || track.wetter || track.windrichtung) && (
          <View style={s.metaRow}>
            {track.surface_types?.map(t => <View key={`s-${t}`} style={s.metaChip}><Text style={s.metaChipTxt}>🌍 {t}</Text></View>)}
            {track.terrain_conditions?.map(t => <View key={`c-${t}`} style={s.metaChip}><Text style={s.metaChipTxt}>{t}</Text></View>)}
            {track.wetter       && <View style={s.metaChip}><Text style={s.metaChipTxt}>{track.wetter}</Text></View>}
            {track.windrichtung && <View style={s.metaChip}><Text style={s.metaChipTxt}>💨 Wind {track.windrichtung}</Text></View>}
            {track.liegezeit_min != null && <View style={s.metaChip}><Text style={s.metaChipTxt}>⏱ {track.liegezeit_min} min Liegezeit</Text></View>}
          </View>
        )}

        {/* Stats grid */}
        <View style={s.statsGrid}>
          <StatCard label="DISTANZ"  value={track.distanz_m ? `${Math.round(track.distanz_m)} m` : '—'} icon="📏" />
          <StatCard label="DAUER"    value={fmtDuration(track.dauer_sec ?? null)} icon="⏱" />
          <StatCard label="GEGENSTÄNDE" value={String(gegenstände.length)} icon="📦" />
          <StatCard label="PUNKTE"   value={String(points.length)} icon="📍" />
        </View>

        {/* Rating */}
        {track.rating != null && (
          <>
            <Text style={s.sectionTitle}>BEWERTUNG</Text>
            <View style={s.ratingRow}>
              {[1,2,3,4,5].map(n => (
                <Ionicons
                  key={n}
                  name={n <= track.rating! ? 'star' : 'star-outline'}
                  size={26}
                  color={n <= track.rating! ? C.star : C.border}
                />
              ))}
            </View>
          </>
        )}

        {/* Articles */}
        {articles.length > 0 && (
          <>
            <Text style={s.sectionTitle}>GEGENSTÄNDE & VERLEITUNGEN</Text>
            <View style={[s.card, isGlass && s.cardGlass]}>{isGlass && <Glass style={s.glassBg} />}
              {articles.map((a, i) => (
                <View key={i} style={[s.articleRow, i < articles.length - 1 && s.articleBorder]}>
                  <View style={[s.articleDot, { backgroundColor: a.typ === 'verleitung' ? `${C.danger}20` : `${C.warning}20` }]}>
                    <Ionicons
                      name={a.typ === 'verleitung' ? 'warning' : 'cube'}
                      size={14}
                      color={a.typ === 'verleitung' ? C.danger : C.warning}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.articleLabel}>
                      {a.typ === 'verleitung' ? 'Verleitung' : 'Gegenstand'} #{i + 1}
                    </Text>
                    {a.notiz ? <Text style={s.articleNotiz}>{a.notiz}</Text> : null}
                  </View>
                  {a.gefunden && (
                    <Ionicons name="checkmark-circle" size={16} color={C.success} />
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Notes */}
        {track.notizen && (
          <>
            <Text style={s.sectionTitle}>NOTIZEN</Text>
            <View style={[s.card, isGlass && s.cardGlass]}>{isGlass && <Glass style={s.glassBg} />}
              <Text style={s.notesTxt}>{track.notizen}</Text>
            </View>
          </>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errTxt: { color: C.muted, fontSize: 14 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  backBtn:  { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  deleteBtn:{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.dangerDim, borderWidth: 1, borderColor: `${C.danger}30`, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 2, marginBottom: 2 },
  title:   { fontSize: 20, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },

  pathCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.border, marginBottom: 14, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  noPath:   { position: 'absolute', alignItems: 'center', gap: 8 },
  noPathTxt:{ fontSize: 13, color: C.subtle },

  metaRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  metaChip:    { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6 },
  metaChipTxt: { fontSize: 12, color: C.muted, fontWeight: '600' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },

  sectionTitle: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 8 },

  ratingRow: { flexDirection: 'row', gap: 6, marginBottom: 16 },

  card: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 4, marginBottom: 16, overflow: 'hidden' },
  cardGlass: { backgroundColor: 'transparent' },
  glassBg:   { ...StyleSheet.absoluteFillObject },

  articleRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  articleBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  articleDot:    { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  articleLabel:  { fontSize: 14, color: C.white, fontWeight: '600' },
  articleNotiz:  { fontSize: 12, color: C.muted, marginTop: 2 },

  notesTxt: { fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 21, padding: 16 },
});

const sc = StyleSheet.create({
  statCard: { width: '47%', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 16, alignItems: 'center', gap: 4 },
  statIcon: { fontSize: 20 },
  statVal:  { fontSize: 18, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  statLbl:  { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1.2 },
});
