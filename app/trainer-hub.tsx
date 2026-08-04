import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { Glass, isGlass } from '@/components/ui/Glass';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useHubBadge } from '@/hooks/useHubBadge';
import { useSession } from '@/hooks/useSession';
import { getMyClientConnections } from '@/services/connectionService';
import { useT, type TranslationKey } from '@/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface HubCard {
  icon: IconName;
  color: string;
  titleKey: TranslationKey;
  subKey: TranslationKey;
  route: string;
  metrics?: boolean;
}

interface Tool {
  icon: IconName;
  color: string;
  titleKey: TranslationKey;
  subKey: TranslationKey;
  route?: string;
  onPress?: () => void;
}

// Farben ausschliesslich aus den zentralen C-Tokens (ruhige, dezente Töne) —
// keine neuen Hex-Farben. Die beiden Dashboard-Karten sind die schnellen
// Haupt-Einstiege, darunter folgt die Tools-Liste.
export default function TrainerHubScreen() {
  const router = useRouter();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { isTrainerModule, loading } = useCapabilities();
  const { session } = useSession();
  const uid = session?.user.id;
  const requests = useHubBadge();
  const [activeClients, setActiveClients] = useState(0);
  const [surveyOpen, setSurveyOpen] = useState(false);

  // Aktive Kund:innen live zählen (Status 'accepted'), Anfragen über den
  // bestehenden Hub-Badge (pending). Fallback 0, wenn nichts da ist.
  useEffect(() => {
    if (!uid || !isTrainerModule) return;
    let cancelled = false;
    getMyClientConnections(uid)
      .then(conns => {
        if (!cancelled) setActiveClients(conns.filter(c => c.status === 'accepted').length);
      })
      .catch(() => { /* Zähler bleibt bei 0 */ });
    return () => { cancelled = true; };
  }, [uid, isTrainerModule]);

  // Zwei grosse Dashboard-Karten (Trainerprofil + Kund:innen mit Live-Metriken).
  const CARDS: HubCard[] = [
    { icon: 'medal', color: C.accent, titleKey: 'trainer.profile', subKey: 'trainer.profileCardSub', route: '/trainer/edit' },
    { icon: 'people', color: C.trackBlue, titleKey: 'trainer.clients', subKey: 'trainer.clientsCardSub', route: '/(tabs)/clients', metrics: true },
  ];

  const openSurvey = () => setSurveyOpen(true);

  // Vertikale Tools-Liste — Umfragen bündelt die bisher verstreuten Einstiege
  // (Terminumfragen, Mini Umfragen, Neue Umfrage) in einem Dialog. Navigation
  // unverändert: alle Routen sind die bisherigen.
  const TOOLS: Tool[] = [
    { icon: 'clipboard', color: C.accent, titleKey: 'trainer.plans', subKey: 'trainer.plansToolSub', route: '/trainer/plaene' },
    { icon: 'bar-chart', color: C.trackBlue, titleKey: 'trainer.stats', subKey: 'trainer.statsToolSub', route: '/(tabs)/activity' },
    { icon: 'chatbubble-ellipses', color: C.sparteObedience, titleKey: 'profile.messages', subKey: 'trainer.messagesHubSub', route: '/chat' },
    { icon: 'list', color: C.sparteUnterordnung, titleKey: 'trainer.surveys', subKey: 'trainer.surveysToolSub', onPress: openSurvey },
    { icon: 'link', color: C.sparteSchutzdienst, titleKey: 'trainer.connections', subKey: 'trainer.connectionsToolSub', route: '/(tabs)/clients' },
  ];

  // Schliessen: zurück auf den Herkunfts-Screen; ohne History (Deep-Link) sicher
  // auf den Analyse-Tab. Funktioniert identisch auf iOS und Android; der
  // Hardware-Back auf Android schliesst das native Modal ohnehin.
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/analytics');
  };

  const closeSurvey = () => setSurveyOpen(false);
  const go = (route: string) => { closeSurvey(); router.push(route as never); };

  return (
    <View style={s.safe}>
      {/* Eigener Header — explizit unter Safe Area / Dynamic Island / Statusleiste
          (paddingTop = insets.top + Abstand, gleiches Muster wie track/legen.tsx).
          Rückweg-Button wird IMMER gerendert, auch während die Capabilities laden —
          so hängt man im Fullscreen-Modal nie ohne Rückweg fest (iOS: kein
          Swipe-Down). Nur der Inhalt wird gegated. */}
      <View style={[s.headerBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={handleBack}
          hitSlop={12}
          style={s.closeBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          testID="trainer-hub-close"
        >
          <Ionicons name="chevron-back" size={24} color={C.white} />
        </TouchableOpacity>
        <View style={s.headerTitles}>
          <Text style={s.eyebrow}>{t('trainer.workspace')}</Text>
          <Text style={s.title}>{t('trainer.hubTitle')}</Text>
          <Text style={s.subtitle} numberOfLines={2}>{t('trainer.hubSubtitle')}</Text>
        </View>
        <Image source={require('@/assets/images/anyvologo.png')} style={s.logo} contentFit="contain" />
      </View>

      {/* Capabilities laden noch → nur den Rahmen zeigen (kein Content-Flash).
          Keine Trainer-Berechtigung → sicher auf Analyse umleiten, kein Hub-Inhalt. */}
      {loading ? null : !isTrainerModule ? (
        <Redirect href="/(tabs)/analytics" />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.cards}>
            {CARDS.map(c => (
              <TouchableOpacity
                key={c.route}
                style={[s.card, isGlass && s.cardGlass]}
                onPress={() => router.push(c.route as never)}
                activeOpacity={0.85}
              >
                {isGlass && <Glass style={s.glassBg} />}
                <View style={s.cardRow}>
                  <View style={[s.cardIcon, { backgroundColor: `${c.color}1A` }]}>
                    <Ionicons name={c.icon} size={24} color={c.color} />
                  </View>
                  <View style={s.cardBody}>
                    <Text style={s.cardTitle}>{t(c.titleKey)}</Text>
                    <Text style={s.cardSub} numberOfLines={2}>{t(c.subKey)}</Text>
                  </View>
                </View>
                <View style={s.cardBottom}>
                  {c.metrics && (
                    <View style={s.metrics}>
                      <View style={s.metric}>
                        <View style={[s.metricDot, { backgroundColor: C.accent }]} />
                        <Text style={s.metricValue}>{activeClients}</Text>
                        <Text style={s.metricLabel}>{t('trainer.activeClients')}</Text>
                      </View>
                      <View style={s.metricDivider} />
                      <View style={s.metric}>
                        <View style={[s.metricDot, { backgroundColor: C.warning }]} />
                        <Text style={s.metricValue}>{requests}</Text>
                        <Text style={s.metricLabel}>{t('trainer.clientRequests')}</Text>
                      </View>
                    </View>
                  )}
                  <View style={[s.arrow, { borderColor: `${c.color}55` }]}>
                    <Ionicons name="arrow-forward" size={15} color={c.color} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.tools}>
            {TOOLS.map(tool => (
              <TouchableOpacity
                key={tool.titleKey}
                style={[s.toolRow, isGlass && s.toolGlass]}
                onPress={tool.onPress ?? (() => router.push(tool.route as never))}
                activeOpacity={0.85}
              >
                {isGlass && <Glass style={s.toolGlassBg} />}
                <View style={[s.toolIcon, { backgroundColor: `${tool.color}1A` }]}>
                  <Ionicons name={tool.icon} size={22} color={tool.color} />
                </View>
                <View style={s.toolBody}>
                  <Text style={s.toolTitle}>{t(tool.titleKey)}</Text>
                  <Text style={s.toolSub} numberOfLines={1}>{t(tool.subKey)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.subtle} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* Umfragen-Dialog: bündelt die bisherige Umfragen-Navigation (Terminumfragen,
          Mini Umfragen, Neue Umfrage). Alle Ziele sind bestehende Routen. */}
      <Modal visible={surveyOpen} transparent animationType="slide" onRequestClose={closeSurvey}>
        <View style={s.sheetWrap}>
          <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={closeSurvey} />
          <View style={[s.sheet, { paddingBottom: 20 + insets.bottom }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHead}>
              <View style={[s.sheetHeadIcon, { backgroundColor: `${C.sparteUnterordnung}1A` }]}>
                <Ionicons name="list" size={18} color={C.sparteUnterordnung} />
              </View>
              <Text style={s.sheetTitle}>{t('trainer.surveys')}</Text>
              <TouchableOpacity
                onPress={closeSurvey}
                hitSlop={10}
                style={s.sheetClose}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>

            <View style={s.sheetOptions}>
              <TouchableOpacity style={s.sheetOption} onPress={() => go('/umfrage/meine')} activeOpacity={0.8}>
                <View style={[s.sheetOptionIcon, { backgroundColor: `${C.accent}1A` }]}>
                  <Ionicons name="calendar" size={20} color={C.accent} />
                </View>
                <Text style={s.sheetOptionTxt}>{t('trainer.surveyTermPolls')}</Text>
                <Ionicons name="chevron-forward" size={16} color={C.subtle} />
              </TouchableOpacity>
              <TouchableOpacity style={s.sheetOption} onPress={() => go('/umfrage/meine')} activeOpacity={0.8}>
                <View style={[s.sheetOptionIcon, { backgroundColor: `${C.sparteUnterordnung}1A` }]}>
                  <Ionicons name="list" size={20} color={C.sparteUnterordnung} />
                </View>
                <Text style={s.sheetOptionTxt}>{t('trainer.surveyMiniPolls')}</Text>
                <Ionicons name="chevron-forward" size={16} color={C.subtle} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={s.sheetCta} onPress={() => go('/umfrage')} activeOpacity={0.85}>
              <Ionicons name="add" size={20} color={C.accentText} />
              <Text style={s.sheetCtaTxt}>{t('trainer.surveyNew')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerTitles: { flex: 1 },
  eyebrow: { fontSize: 9, color: C.accent, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  title:   { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 16 },
  logo:    { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: C.border },
  content: { paddingHorizontal: 20, paddingTop: 8 },

  cards:   { gap: 14 },
  card:    {
    minHeight: 148,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 6,
  },
  cardGlass: { backgroundColor: 'transparent', borderColor: C.glassBorder },
  glassBg: { ...StyleSheet.absoluteFillObject, borderRadius: 28 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 19, color: C.white, fontWeight: '800', letterSpacing: -0.3 },
  cardSub:   { fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 17 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  metrics: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  metric:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metricDot: { width: 8, height: 8, borderRadius: 4 },
  metricValue: { fontSize: 16, color: C.white, fontWeight: '800' },
  metricLabel: { fontSize: 12, color: C.muted, fontWeight: '600' },
  metricDivider: { width: 1, height: 16, backgroundColor: C.border },
  arrow:   { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  tools:   { marginTop: 24, gap: 10 },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    padding: 16,
    overflow: 'hidden',
  },
  toolGlass: { backgroundColor: 'transparent', borderColor: C.glassBorder },
  toolGlassBg: { ...StyleSheet.absoluteFillObject, borderRadius: 26 },
  toolIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  toolBody: { flex: 1 },
  toolTitle: { fontSize: 16, color: C.white, fontWeight: '800' },
  toolSub:   { fontSize: 12, color: C.muted, marginTop: 3 },

  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet:   {
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetHeadIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { flex: 1, fontSize: 20, color: C.white, fontWeight: '800' },
  sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  sheetOptions: { marginTop: 18, gap: 10 },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  sheetOptionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sheetOptionTxt: { flex: 1, fontSize: 15, color: C.white, fontWeight: '700' },
  sheetCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: C.accent,
    borderRadius: 18,
    paddingVertical: 14,
  },
  sheetCtaTxt: { fontSize: 15, color: C.accentText, fontWeight: '800' },
});
