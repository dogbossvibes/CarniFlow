import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SignedImage } from '@/components/ui/SignedImage';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { useTrainingFeed } from '@/hooks/useTrainingFeed';
import { getDogById } from '@/services/dogs';
import type { Dog } from '@/types';
import type { FeedItem } from '@/services/trainingFeed';

// ── Design-System (Variante 3 – Athletenprofil) ──────────────────────────────
const P = {
  bg:          '#000000',
  surface:     '#121316',
  surfaceAlt:  '#1A1B1F',
  primary:     '#14E8D1',
  text:        '#FFFFFF',
  sub:         '#8A8A8F',
  border:      'rgba(255,255,255,0.08)',
  faehrte:     '#FFAF80',
  schutz:      '#FF5F00',
  uo:          '#14E8D1',
  fortschritt: '#FFD7BF',
};

const MONAT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const DISC_META: Record<string, { emoji: string; color: string }> = {
  'Fährte':       { emoji: '🐾', color: P.faehrte },
  'Schutzdienst': { emoji: '🛡', color: P.schutz },
  'Unterordnung': { emoji: '🎯', color: P.uo },
};
function discMeta(disc: string | undefined) {
  return (disc && DISC_META[disc]) || { emoji: '⭐', color: P.primary };
}

// ── Helfer ───────────────────────────────────────────────────────────────────
function alterText(birth: string | null): { wert: string; einheit: string } {
  if (!birth) return { wert: '—', einheit: 'Alter' };
  const years = (Date.now() - new Date(birth).getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return { wert: String(Math.max(0, Math.round(years * 12))), einheit: 'Monate' };
  return { wert: years.toFixed(1), einheit: 'Jahre' };
}

function serieTage(dates: string[]): number {
  const set = new Set(dates);
  let s = 0;
  const heute = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(heute);
    d.setDate(heute.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (set.has(key)) s++;
    else if (i > 0) break;
  }
  return s;
}

function datumKurz(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

// Item-Punkte 0–100: Doku-Score (1–10 → ×10), sonst Sterne/Übungs-Ø (1–5 → ×20).
function punkte(it: FeedItem): number | null {
  if (it.score != null) return Math.round(it.score * 10);
  const exRatings = (it.exercises ?? []).map(e => e.rating).filter((r): r is number => r != null);
  const r = it.rating ?? (exRatings.length ? exRatings.reduce((a, b) => a + b, 0) / exRatings.length : null);
  return r != null ? Math.round(r * 20) : null;
}

function primaryDisc(it: FeedItem): string {
  return it.exercises?.[0]?.discipline ?? 'Training';
}

// ── Animierter Timeline-Balken ───────────────────────────────────────────────
function Bar({ ziel, grow, aktiv }: { ziel: number; grow: SharedValue<number>; aktiv: boolean }) {
  const st = useAnimatedStyle(() => ({ height: Math.max(aktiv ? 4 : 2, grow.value * ziel) }));
  return <Animated.View style={[bar.fill, aktiv ? bar.fillAktiv : bar.fillLeer, st]} />;
}

export default function HundProfilScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [hund, setHund]       = useState<Dog | null>(null);
  const [laden, setLaden]     = useState(true);
  const [fehler, setFehler]   = useState<string | null>(null);
  const [fabOffen, setFabOffen] = useState(false);
  const [ahnenOffen, setAhnenOffen] = useState(false);

  const { feed, loading: feedLaden } = useTrainingFeed(id);

  useEffect(() => {
    if (!id) return;
    getDogById(id).then(({ data, error }) => {
      setLaden(false);
      if (error || !data) { setFehler(error?.message ?? 'Hund nicht gefunden'); return; }
      setHund(data as Dog);
    });
  }, [id]);

  // ── Abgeleitete Werte ──
  const stats = useMemo(() => {
    const trainings = feed.length;
    const serie     = serieTage(feed.map(f => f.session_date));
    const alter     = alterText(hund?.birth_date ?? null);
    return { trainings, serie, alter };
  }, [feed, hund]);

  const monate = useMemo(() => {
    const now = new Date();
    const arr = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      arr.push({ key, label: MONAT[d.getMonth()], count: feed.filter(f => f.session_date.slice(0, 7) === key).length });
    }
    return arr;
  }, [feed]);
  const maxCount = Math.max(1, ...monate.map(m => m.count));

  const fortschritt = useMemo(() => {
    const calc = (disc: string) => {
      const r: number[] = [];
      for (const it of feed) for (const ex of it.exercises ?? []) {
        if (ex.discipline === disc && ex.rating != null) r.push(ex.rating);
      }
      return r.length ? (r.reduce((a, b) => a + b, 0) / r.length) / 5 : 0;
    };
    return [
      { label: 'Fährte',       progress: calc('Fährte'),       color: P.faehrte },
      { label: 'Schutzdienst', progress: calc('Schutzdienst'), color: P.schutz },
      { label: 'Unterordnung', progress: calc('Unterordnung'), color: P.uo },
    ];
  }, [feed]);

  const medien = useMemo(() => {
    const m: { type: 'photo' | 'video'; url: string; it: FeedItem }[] = [];
    for (const it of feed) {
      for (const p of it.photos ?? []) m.push({ type: 'photo', url: p, it });
      for (const v of it.videos ?? []) m.push({ type: 'video', url: v, it });
    }
    return m.slice(0, 12);
  }, [feed]);

  const hatAbstammung = !!(hund?.sire || hund?.dam || hund?.kennel);

  // ── Animationen ──
  const grow  = useSharedValue(0);
  const mount = useSharedValue(0);
  useEffect(() => {
    grow.value  = withDelay(150, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    mount.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.exp) });
  }, []);
  const statsStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateY: (1 - mount.value) * 16 }],
  }));

  const openItem = (it: FeedItem) => {
    if      (it.source === 'unit')  router.push({ pathname: '/unit/detail', params: { id: it.id } });
    else if (it.source === 'track') router.push(`/track/${it.id}` as never);
    else                            router.push(`/training/${it.id}` as never);
  };

  const fabAktion = (fn: () => void) => { setFabOffen(false); fn(); };

  if (laden) {
    return <View style={s.mitte}><ActivityIndicator size="large" color={P.primary} /></View>;
  }
  if (fehler || !hund) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.mitte}>
          <Text style={s.fehlerText}>{fehler ?? 'Hund nicht gefunden'}</Text>
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

        {/* ── 1. HERO ── */}
        <View style={s.hero}>
          {hund.photo_url ? (
            <SignedImage url={hund.photo_url} style={s.heroImg} contentFit="cover" transition={200} />
          ) : (
            <Image source={require('@/assets/images/yam20.jpg')} style={s.heroImg} resizeMode="cover" />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent', 'rgba(0,0,0,0.55)', '#000000']}
            locations={[0, 0.35, 0.75, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <SafeAreaView edges={['top']} style={s.heroNav}>
            <TouchableOpacity style={s.navBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <Ionicons name="chevron-back" size={20} color={P.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.navBtn}
              onPress={() => router.push({ pathname: '/edit-dog', params: { id: hund.id } })}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={18} color={P.text} />
            </TouchableOpacity>
          </SafeAreaView>

          <View style={s.heroUnten}>
            <Text style={s.heroName}>{hund.name}</Text>
            <View style={s.heroMetaRow}>
              {hund.breed ? <Text style={s.heroBreed}>{hund.breed}</Text> : null}
              {hund.gender ? (
                <Text style={s.heroBreed}>{hund.breed ? ' · ' : ''}{hund.gender === 'male' ? '♂ Rüde' : '♀ Hündin'}</Text>
              ) : null}
            </View>
            {hund.titles && hund.titles.length > 0 && (
              <View style={s.badgeRow}>
                {hund.titles.map((t, i) => (
                  <View key={`${t}-${i}`} style={s.badge}>
                    <Text style={s.badgeText}>{t}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* ── 2. PERFORMANCE STATS (2x2) ── */}
        <Animated.View style={[s.statsGrid, statsStyle]}>
          <StatCard wert={String(stats.trainings)} label="Trainings" />
          <StatCard wert={String(stats.serie)} label="Tage Serie" akzent />
          <StatCard wert={stats.alter.wert} label={stats.alter.einheit} />
          <StatCard wert={hund.weight_kg != null ? String(hund.weight_kg) : '—'} label="kg" />
        </Animated.View>

        {/* ── 3. TRAININGS-TIMELINE ── */}
        <Text style={s.sektionTitel}>Trainingsaktivität</Text>
        <View style={s.card}>
          <View style={s.chart}>
            {monate.map(m => (
              <View key={m.key} style={s.chartSpalte}>
                <View style={s.chartBarWrap}>
                  <Bar ziel={(m.count / maxCount) * 120} grow={grow} aktiv={m.count > 0} />
                </View>
                <Text style={s.chartLabel}>{m.label}</Text>
                <Text style={s.chartCount}>{m.count > 0 ? m.count : ''}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 4. LETZTE AKTIVITÄTEN ── */}
        <Text style={s.sektionTitel}>Letzte Aktivitäten</Text>
        {feedLaden ? (
          <ActivityIndicator color={P.primary} style={{ marginVertical: 20 }} />
        ) : feed.length > 0 ? (
          <View style={s.card}>
            {feed.slice(0, 6).map((it, i, arr) => {
              const disc = primaryDisc(it);
              const meta = discMeta(disc);
              const pkt = punkte(it);
              return (
                <TouchableOpacity
                  key={`${it.source}-${it.id}`}
                  style={[s.aktZeile, i < arr.length - 1 && s.aktTrenner]}
                  onPress={() => openItem(it)}
                  activeOpacity={0.7}
                >
                  <View style={[s.aktIcon, { backgroundColor: `${meta.color}1A` }]}>
                    <Text style={{ fontSize: 18 }}>{meta.emoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.aktTitel}>{disc}</Text>
                    <Text style={s.aktDatum}>{datumKurz(it.session_date)}</Text>
                  </View>
                  {pkt != null ? (
                    <View style={[s.punktePill, { borderColor: `${meta.color}55` }]}>
                      <Text style={[s.punkteText, { color: meta.color }]}>{pkt} Pkt</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={P.sub} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={[s.card, s.leer]}>
            <Text style={s.leerText}>Noch kein Training erfasst.</Text>
          </View>
        )}

        {/* ── 5. TRAININGSFORTSCHRITT ── */}
        <Text style={s.sektionTitel}>Trainingsfortschritt</Text>
        <View style={[s.card, s.ringeRow]}>
          {fortschritt.map(r => (
            <ProgressRing key={r.label} progress={r.progress} color={r.color} label={r.label} />
          ))}
        </View>

        {/* ── 6. MEDIATHEK ── */}
        {medien.length > 0 && (
          <>
            <View style={s.sektionKopf}>
              <Text style={s.sektionTitel0}>Mediathek</Text>
              <TouchableOpacity onPress={() => router.push('/unit/history' as never)} activeOpacity={0.7}>
                <Text style={s.alleLink}>Alle anzeigen</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.medienRow}
            >
              {medien.map((m, i) => (
                <TouchableOpacity key={i} style={s.medienTile} onPress={() => openItem(m.it)} activeOpacity={0.85}>
                  {m.type === 'photo' ? (
                    <SignedImage url={m.url} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={s.videoTile}>
                      <Ionicons name="play-circle" size={32} color={P.text} />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── 7. ABSTAMMUNG ── */}
        {hatAbstammung && (
          <>
            <Text style={s.sektionTitel}>Abstammung</Text>
            <View style={s.card}>
              <TouchableOpacity style={s.ahnenKopf} onPress={() => setAhnenOffen(o => !o)} activeOpacity={0.7}>
                <Ionicons name="git-network-outline" size={18} color={P.primary} />
                <Text style={s.ahnenKopfText}>Ahnentafel anzeigen</Text>
                <Ionicons name={ahnenOffen ? 'chevron-up' : 'chevron-down'} size={16} color={P.sub} />
              </TouchableOpacity>
              {ahnenOffen && (
                <View style={s.ahnenBody}>
                  {hund.sire   ? <AhnenZeile label="Vater"       wert={hund.sire} /> : null}
                  {hund.dam    ? <AhnenZeile label="Mutter"      wert={hund.dam} /> : null}
                  {hund.kennel ? <AhnenZeile label="Zuchtstätte" wert={hund.kennel} /> : null}
                </View>
              )}
            </View>
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── FLOATING ACTION BUTTON ── */}
      {fabOffen && (
        <Pressable style={s.fabBackdrop} onPress={() => setFabOffen(false)} />
      )}
      <View style={s.fabWrap} pointerEvents="box-none">
        {fabOffen && (
          <View style={s.fabMenu}>
            <FabAktion icon="play-circle" label="Training starten" onPress={() => fabAktion(() => router.push('/unit/start'))} />
            <FabAktion icon="create" label="Dokumentieren" onPress={() => fabAktion(() => router.push('/unit/document'))} />
            <FabAktion icon="image" label="Foto hinzufügen" onPress={() => fabAktion(() => router.push({ pathname: '/edit-dog', params: { id: hund.id } }))} />
          </View>
        )}
        <TouchableOpacity style={s.fab} onPress={() => setFabOffen(o => !o)} activeOpacity={0.9}>
          <Ionicons name={fabOffen ? 'close' : 'add'} size={28} color="#001210" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Subkomponenten ───────────────────────────────────────────────────────────
function StatCard({ wert, label, akzent }: { wert: string; label: string; akzent?: boolean }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statWert, akzent && { color: P.primary }]} numberOfLines={1} adjustsFontSizeToFit>{wert}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function AhnenZeile({ label, wert }: { label: string; wert: string }) {
  return (
    <View style={s.ahnenZeile}>
      <Text style={s.ahnenLabel}>{label}</Text>
      <Text style={s.ahnenWert}>{wert}</Text>
    </View>
  );
}

function FabAktion({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.fabAktion} onPress={onPress} activeOpacity={0.85}>
      <Text style={s.fabAktionText}>{label}</Text>
      <View style={s.fabAktionIcon}>
        <Ionicons name={icon} size={18} color={P.primary} />
      </View>
    </TouchableOpacity>
  );
}

const bar = StyleSheet.create({
  fill:      { width: '70%', borderRadius: 5, alignSelf: 'center' },
  fillAktiv: { backgroundColor: P.primary },
  fillLeer:  { backgroundColor: 'rgba(255,255,255,0.08)' },
});

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: P.bg },
  scroll: { flex: 1 },
  inhalt: { paddingBottom: 40 },
  mitte:  { flex: 1, backgroundColor: P.bg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  fehlerText:      { fontSize: 15, color: P.sub, textAlign: 'center', marginBottom: 16 },
  zurueckLink:     { paddingVertical: 10, paddingHorizontal: 20 },
  zurueckLinkText: { fontSize: 14, color: P.primary, fontWeight: '700' },

  // Hero
  hero:    { height: 340, justifyContent: 'space-between', overflow: 'hidden' },
  heroImg: { position: 'absolute', width: '100%', height: '100%' },
  heroNav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  navBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroUnten:  { paddingHorizontal: 20, paddingBottom: 20 },
  heroName:   { fontSize: 38, color: P.text, fontWeight: '900', letterSpacing: -1 },
  heroMetaRow:{ flexDirection: 'row', marginTop: 2 },
  heroBreed:  { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  badgeRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  badge: {
    backgroundColor: 'rgba(20,232,209,0.14)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(20,232,209,0.4)',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  badgeText: { fontSize: 12, color: P.primary, fontWeight: '800', letterSpacing: 0.3 },

  // Stats 2x2
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 20, marginTop: 18, marginBottom: 8,
  },
  statCard: {
    width: '47.5%', flexGrow: 1,
    backgroundColor: P.surface, borderRadius: 18, borderWidth: 1, borderColor: P.border,
    paddingVertical: 18, paddingHorizontal: 16, gap: 4,
  },
  statWert:  { fontSize: 30, color: P.text, fontWeight: '900', letterSpacing: -1 },
  statLabel: { fontSize: 12, color: P.sub, fontWeight: '600' },

  // Sektionen
  sektionTitel:  { fontSize: 18, color: P.text, fontWeight: '800', letterSpacing: -0.3, paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  sektionTitel0: { fontSize: 18, color: P.text, fontWeight: '800', letterSpacing: -0.3 },
  sektionKopf:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 24, marginBottom: 12 },
  alleLink:      { fontSize: 13, color: P.primary, fontWeight: '700' },

  card: {
    backgroundColor: P.surface, borderRadius: 20, borderWidth: 1, borderColor: P.border,
    marginHorizontal: 20, overflow: 'hidden',
  },

  // Timeline
  chart:       { flexDirection: 'row', alignItems: 'flex-end', height: 168, paddingHorizontal: 10, paddingTop: 16 },
  chartSpalte: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  chartBarWrap:{ height: 120, justifyContent: 'flex-end', width: '100%' },
  chartLabel:  { fontSize: 10, color: P.sub, fontWeight: '700' },
  chartCount:  { fontSize: 10, color: P.text, fontWeight: '800', height: 12 },

  // Aktivitäten
  aktZeile:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  aktTrenner: { borderBottomWidth: 1, borderBottomColor: P.border },
  aktIcon:    { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  aktTitel:   { fontSize: 15, color: P.text, fontWeight: '700' },
  aktDatum:   { fontSize: 12, color: P.sub, marginTop: 2 },
  punktePill: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  punkteText: { fontSize: 12, fontWeight: '800' },

  leer:     { padding: 24, alignItems: 'center' },
  leerText: { fontSize: 14, color: P.sub },

  // Fortschritt
  ringeRow: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 22, paddingHorizontal: 10 },

  // Mediathek
  medienRow:  { paddingHorizontal: 20, gap: 10 },
  medienTile: { width: 110, height: 140, borderRadius: 14, overflow: 'hidden', backgroundColor: P.surfaceAlt, borderWidth: 1, borderColor: P.border },
  videoTile:  { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: P.surfaceAlt },

  // Abstammung
  ahnenKopf:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  ahnenKopfText: { flex: 1, fontSize: 15, color: P.text, fontWeight: '600' },
  ahnenBody:     { paddingHorizontal: 16, paddingBottom: 8, borderTopWidth: 1, borderTopColor: P.border, paddingTop: 4 },
  ahnenZeile:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  ahnenLabel:    { fontSize: 13, color: P.sub, fontWeight: '600' },
  ahnenWert:     { fontSize: 14, color: P.text, fontWeight: '700', flexShrink: 1, textAlign: 'right', marginLeft: 16 },

  // FAB
  fabBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  fabWrap:     { position: 'absolute', right: 20, bottom: 36, alignItems: 'flex-end', gap: 12 },
  fab: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: P.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: P.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabMenu:    { gap: 10, alignItems: 'flex-end', marginBottom: 4 },
  fabAktion:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fabAktionText: {
    fontSize: 14, color: P.text, fontWeight: '700',
    backgroundColor: P.surface, borderWidth: 1, borderColor: P.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden',
  },
  fabAktionIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: P.surface, borderWidth: 1, borderColor: 'rgba(20,232,209,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
});
