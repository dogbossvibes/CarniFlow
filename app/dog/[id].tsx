import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SignedImage } from '@/components/ui/SignedImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';
import { getDogById } from '@/services/dogs';
import { useTrainingSessions } from '@/hooks/useTrainingSessions';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import type { Dog, TrainingSession } from '@/types';

const KATEGORIE_FARBEN: Record<string, string> = {
  IGP:             C.accent,
  IBGH:            C.success,
  Mondioring:      C.warning,
  Alltagstraining: '#60A5FA',
};

function altersAnzeige(geburtsDatum: string | null): string {
  if (!geburtsDatum) return '—';
  const monate = Math.floor((Date.now() - new Date(geburtsDatum).getTime()) / (30 * 24 * 3600 * 1000));
  return monate < 12 ? `${monate} Mon.` : `${Math.floor(monate / 12)} J.`;
}

function formatiereDatum(datumStr: string): string {
  const [y, m, d] = datumStr.split('-');
  if (y && m && d) return `${d}.${m}.${y}`;
  return datumStr;
}

function SternReihe({ performance }: { performance: number | null }) {
  if (!performance) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= performance ? 'star' : 'star-outline'} size={12} color={n <= performance ? C.star : C.subtle} />
      ))}
    </View>
  );
}

function EinheitElement({
  einheit, istLetztes, onPress, onPressEdit,
}: {
  einheit: TrainingSession;
  istLetztes: boolean;
  onPress: () => void;
  onPressEdit: () => void;
}) {
  const farbe = KATEGORIE_FARBEN[einheit.category] ?? C.muted;
  return (
    <View>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <View style={ee.zeile}>
          <View style={[ee.punktWrap, { backgroundColor: `${farbe}15` }]}>
            <View style={[ee.punkt, { backgroundColor: farbe }]} />
          </View>
          <View style={ee.info}>
            <Text style={ee.kategorie}>{einheit.category}</Text>
            <Text style={ee.meta}>
              {formatiereDatum(einheit.session_date)}
              {einheit.duration_minutes ? ` · ${einheit.duration_minutes} Min.` : ''}
            </Text>
            {einheit.notes ? <Text style={ee.notiz} numberOfLines={2}>{einheit.notes}</Text> : null}
          </View>
          <View style={ee.rechts}>
            {einheit.rating ? (
              <Text style={ee.score}>{einheit.rating * 20}%</Text>
            ) : null}
            <TouchableOpacity style={ee.editBtn} onPress={onPressEdit} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="pencil-outline" size={13} color={C.muted} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
      {!istLetztes && <View style={ee.trenner} />}
    </View>
  );
}
const ee = StyleSheet.create({
  zeile:    { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  punktWrap:{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  punkt:    { width: 10, height: 10, borderRadius: 5 },
  info:     { flex: 1, gap: 3 },
  kategorie:{ fontSize: 14, color: C.white, fontWeight: '700' },
  meta:     { fontSize: 12, color: C.muted },
  notiz:    { fontSize: 12, color: C.subtle, lineHeight: 17, marginTop: 2 },
  trenner:  { height: 1, backgroundColor: C.border, marginLeft: 64 },
  rechts:   { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  score: {
    backgroundColor: C.successDim,
    color:           C.success,
    fontSize:        11,
    fontWeight:      '600',
    borderRadius:    6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  editBtn: {
    width:           30,
    height:          30,
    backgroundColor: C.cardAlt,
    borderRadius:    8,
    borderWidth:     1,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
});

export default function HundDetailScreen() {
  const router    = useRouter();
  const { id }    = useLocalSearchParams<{ id: string }>();
  const [hund,      setHund]     = useState<Dog | null>(null);
  const [hundLaden, setHundLaden]= useState(true);
  const [hundFehler,setHundFehler]=useState<string | null>(null);

  const { sessions, loading: einheitenLaden } = useTrainingSessions(id);

  useEffect(() => {
    if (!id) return;
    getDogById(id).then(({ data, error }) => {
      setHundLaden(false);
      if (error) { setHundFehler(error.message); return; }
      setHund(data as Dog);
    });
  }, [id]);

  const gesamtEinheiten = sessions.length;
  const bewerteteSessions = sessions.filter(s => s.rating);
  const durchschnittPerformance = bewerteteSessions.length
    ? (bewerteteSessions.reduce((sum, s) => sum + (s.rating ?? 0), 0) / bewerteteSessions.length).toFixed(1)
    : '—';
  const letzteEinheit = sessions[0] ? formatiereDatum(sessions[0].session_date) : '—';

  if (hundLaden) {
    return <View style={s.mitte}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  if (hundFehler || !hund) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.mitte}>
          <Text style={s.fehlerText}>{hundFehler ?? 'Hund nicht gefunden — bitte zurückgehen'}</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.zurueckLink}>
            <Text style={s.zurueckLinkText}>Zurück</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.inhalt} showsVerticalScrollIndicator={false}>

        {/* ── CINEMATIC HERO ── */}
        <View style={s.hero}>
          {hund.photo_url ? (
            <SignedImage url={hund.photo_url} style={s.heroImg} contentFit="cover" transition={200} />
          ) : (
            <Image source={require('@/assets/images/yam20.jpg')} style={s.heroImg} resizeMode="cover" />
          )}
          <LinearGradient
            colors={['rgba(5,5,5,0.3)', 'transparent']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 100 }}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['transparent', 'rgba(5,5,5,0.7)', '#050505']}
            locations={[0.4, 0.78, 1]}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 220 }}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['rgba(5,5,5,0.45)', 'transparent']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 80 }}
            pointerEvents="none"
          />
          <LinearGradient
            colors={['transparent', 'rgba(5,5,5,0.45)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 80 }}
            pointerEvents="none"
          />

          <SafeAreaView edges={['top']} style={s.heroNav}>
            <TouchableOpacity style={s.zurueckBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={20} color={C.white} />
            </TouchableOpacity>
          </SafeAreaView>

          <View style={s.heroUnten}>
            <View style={s.heroBadges}>
              {hund.gender ? (
                <View style={s.heroBadge}>
                  <Text style={s.heroBadgeText}>{hund.gender === 'male' ? '♂ Rüde' : '♀ Hündin'}</Text>
                </View>
              ) : null}
              {hund.birth_date ? (
                <View style={s.heroBadge}>
                  <Text style={s.heroBadgeText}>{altersAnzeige(hund.birth_date)}</Text>
                </View>
              ) : null}
              {hund.weight_kg ? (
                <View style={s.heroBadge}>
                  <Text style={s.heroBadgeText}>{hund.weight_kg} kg</Text>
                </View>
              ) : null}
            </View>
            <Text style={s.heroHundName}>{hund.name}</Text>
            {hund.breed ? <Text style={s.heroRasse}>{hund.breed}</Text> : null}
          </View>
        </View>

        {/* ── STATISTIKEN ── */}
        <View style={s.statsReihe}>
          {[
            { label: 'EINHEITEN',      wert: String(gesamtEinheiten) },
            { label: 'Ø PERFORMANCE',    wert: durchschnittPerformance },
            { label: 'LETZTE EINHEIT', wert: letzteEinheit },
          ].map(({ label, wert }, i, arr) => (
            <View key={label} style={[s.stat, i < arr.length - 1 && s.statTrenner]}>
              <Text style={s.statWert} numberOfLines={1} adjustsFontSizeToFit>{wert}</Text>
              <Text style={s.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── EINHEIT ERFASSEN ── */}
        <AnimatedPressable style={s.einheitCta} onPress={() => router.push('/(tabs)/training')} scale={0.97}>
          <LinearGradient
            colors={['#00FFCC', '#00FFCC']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="add-circle" size={20} color={C.accentText} />
          <Text style={s.einheitCtaText}>Trainingseinheit erfassen</Text>
        </AnimatedPressable>

        {/* ── TRAININGSHISTORIE ── */}
        <Text style={s.abschnittLabel}>TRAININGSHISTORIE</Text>
        {einheitenLaden ? (
          <ActivityIndicator color={C.accent} style={{ marginVertical: 24 }} />
        ) : sessions.length > 0 ? (
          <View style={s.einheitenListe}>
            {sessions.map((einheit, i) => (
              <EinheitElement
                key={einheit.id}
                einheit={einheit}
                istLetztes={i === sessions.length - 1}
                onPress={() => router.push(`/training/${einheit.id}` as never)}
                onPressEdit={() => router.push(`/training/${einheit.id}?edit=true` as never)}
              />
            ))}
          </View>
        ) : (
          <View style={s.leerZustand}>
            <Ionicons name="barbell-outline" size={28} color={C.subtle} style={{ marginBottom: 8 }} />
            <Text style={s.leerText}>Noch kein Training — fang heute an! 🐕</Text>
            <TouchableOpacity style={s.leerAddBtn} onPress={() => router.push('/(tabs)/training' as never)} activeOpacity={0.8}>
              <Text style={s.leerAddBtnText}>+ Training hinzufügen</Text>
            </TouchableOpacity>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  inhalt:  { paddingBottom: 60 },
  mitte:   { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  fehlerText:   { fontSize: 15, color: C.muted, textAlign: 'center', marginBottom: 16 },
  zurueckLink:  { paddingVertical: 10, paddingHorizontal: 20 },
  zurueckLinkText: { fontSize: 14, color: C.accent, fontWeight: '700' },

  hero:    { height: 360, justifyContent: 'space-between', overflow: 'hidden', position: 'relative' },
  heroImg: { position: 'absolute', width: '100%', height: 560, top: -100 },
  heroNav: { paddingHorizontal: 16, paddingTop: 8 },
  zurueckBtn: {
    width:          42,
    height:         42,
    borderRadius:   21,
    backgroundColor:'rgba(0,0,0,0.45)',
    borderWidth:    1,
    borderColor:    'rgba(255,255,255,0.12)',
    alignItems:     'center',
    justifyContent: 'center',
  },
  heroUnten:  { paddingHorizontal: 20, paddingBottom: 22 },
  heroBadges: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  heroBadge: {
    backgroundColor:   'rgba(255,255,255,0.12)',
    borderRadius:      8,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.08)',
  },
  heroBadgeText: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  heroHundName: {
    fontSize:    32,
    color:       C.white,
    fontWeight:  '900',
    letterSpacing: -0.5,
  },
  heroRasse: { fontSize: 14, color: 'rgba(255,255,255,0.55)', fontWeight: '500', marginTop: 3 },

  statsReihe: {
    flexDirection:     'row',
    backgroundColor:   C.card,
    borderRadius:      18,
    borderWidth:       1,
    borderColor:       C.border,
    marginHorizontal:  20,
    marginBottom:      16,
    overflow:          'hidden',
  },
  stat:       { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 4 },
  statTrenner:{ borderRightWidth: 1, borderRightColor: C.border },
  statWert:   { fontSize: 17, color: C.white, fontWeight: '800', marginBottom: 3 },
  statLabel:  { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1, textAlign: 'center' },

  einheitCta: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               10,
    borderRadius:      16,
    paddingVertical:   16,
    marginHorizontal:  20,
    marginBottom:      28,
    overflow:          'hidden',
  },
  einheitCtaText: { fontSize: 15, color: C.accentText, fontWeight: '900' },

  abschnittLabel: {
    fontSize:          10,
    color:             C.muted,
    fontWeight:        '700',
    letterSpacing:     1.5,
    marginBottom:      12,
    paddingHorizontal: 20,
  },
  einheitenListe: {
    backgroundColor:  C.card,
    borderRadius:     18,
    borderWidth:      1,
    borderColor:      C.border,
    overflow:         'hidden',
    marginHorizontal: 20,
  },
  leerZustand: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20 },
  leerText:    { fontSize: 14, color: C.muted, fontWeight: '600', marginBottom: 12 },
  leerAddBtn: {
    backgroundColor:  C.cardAlt,
    borderRadius:     10,
    paddingHorizontal:20,
    paddingVertical:  10,
    borderWidth:      1,
    borderColor:      `${C.accent}40`,
  },
  leerAddBtnText: { color: C.accent, fontSize: 13, fontWeight: '600' },
});
