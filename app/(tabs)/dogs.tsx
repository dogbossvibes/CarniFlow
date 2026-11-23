import { resolveTrackOverlayColorKey, trackOverlayColor, trackOverlayColorNameKey } from '@/features/tracking/utils/trackOverlayColors';
import { DogCompactCard } from "@/components/dogs/DogCompactCard";
import { AnyvoActionMenu, type AnyvoMenuAction } from "@/components/ui/AnyvoActionMenu";
import { dogToIdentity } from "@/components/dogs/types";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { DogIcon } from "@/components/ui/DogIcon";
import { reportScroll } from "@/stores/liveBarScroll";
import { C } from "@/constants/colors";
import { useT } from "@/i18n";
import { useDogs } from "@/hooks/useDogs";
import { useCapabilities } from "@/hooks/useCapabilities";
import { quotaAllowsNew } from "@/features/subscription/plans";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useTabScrollToTop } from "@/hooks/useTabScrollToTop";
import { useCallback, useState } from "react";
import { SharedDogsInbox } from "@/components/dogs/SharedDogsInbox";
import {
    ActivityIndicator,
    TouchableOpacity,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDogTrainingSummary } from '@/hooks/useDogTrainingSummary';
import { lastTrainingText } from '@/features/training/continue/labels';

export default function HundeScreen() {
  const router = useRouter();
  const scrollRef = useTabScrollToTop();
  const [section, setSection] = useState<"owned" | "shared">("owned");
  const { t } = useT();
  const { dogs, loading, error, refresh } = useDogs();
  const { isPro, loading: capLoading } = useCapabilities();

  const handleHinzufuegen = () => {
    // Autoritatives Gate wie in /add-dog: useCapabilities().isPro (inkl. Lifetime)
    // + zentrale Quota-Regel. Nur bei tatsächlich erreichtem Hundelimit den
    // bestehenden Upgrade-Flow zeigen; sonst direkt zum Anlege-Flow. Solange die
    // Capabilities noch laden, nicht vorschnell blocken — /add-dog + Server gaten
    // ohnehin autoritativ.
    if (!capLoading && !quotaAllowsNew(isPro, "dog", dogs.length)) {
      router.push("/premium");
      return;
    }
    router.push("/add-dog");
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.kopf}>
        <View>
          <Text style={s.augenbraue}>{t('dogs.yourDogs')}</Text>
          <Text style={s.titel}>{t('dogs.title')}</Text>
        </View>
        <AnimatedPressable style={s.hinzufuegenBtn} onPress={handleHinzufuegen}>
          <LinearGradient
            colors={["#00FFCC", "#00FFCC"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="add" size={22} color={C.accentText} />
        </AnimatedPressable>
      </View>

      <View style={s.segments}>
        {(['owned', 'shared'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected: section === value }} style={[s.segment, section === value && s.segmentActive]} onPress={() => setSection(value)}><Text style={[s.segmentText, section === value && s.segmentTextActive]}>{t(value === 'owned' ? 'sharing.myDogs' : 'sharing.withMe')}</Text></TouchableOpacity>)}
      </View>
      {section === 'shared' ? <SharedDogsInbox /> : loading ? (
        <View style={s.mitte}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : error ? (
        <View style={s.mitte}>
          <View style={s.fehlerIcon}>
            <Ionicons name="cloud-offline-outline" size={28} color={C.muted} />
          </View>
          <Text style={s.fehlerTitel}>{t('dogs.loadError')}</Text>
          <Text style={s.fehlerUnter}>{error}</Text>
          <AnimatedPressable style={s.wiederholBtn} onPress={refresh}>
            <Text style={s.wiederholText}>{t('connect.retry')}</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={[s.inhalt, dogs.length === 0 && s.inhaltLeer]}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => reportScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={C.accent}
            />
          }
        >
          {dogs.length > 0 ? (
            <View style={s.liste}>
              {dogs.map((hund) => (
                <DogCardWithLastTraining
                  key={hund.id}
                  dogId={hund.id}
                  identity={dogToIdentity(hund)}
                  trackColor={trackOverlayColor(resolveTrackOverlayColorKey(hund.id, hund.track_overlay_color_key))}
                  trackColorLabel={`${t('dog.trackColor.title')}: ${t(trackOverlayColorNameKey(resolveTrackOverlayColorKey(hund.id, hund.track_overlay_color_key)))}`}
                  onOpen={() => router.push(`/dog/${hund.id}` as never)}
                  onTrainingFor={(discipline?: string) => router.push({ pathname: '/unit/document', params: { dogId: hund.id, ...(discipline ? { discipline } : {}) } })}
                  onTrainingPage={() => router.push({ pathname: '/unit/progress', params: { dogId: hund.id } })}
                  onFaehrte={() => router.push(`/track/legen?dogId=${hund.id}` as never)}
                  onStats={() => router.push(`/dog/${hund.id}` as never)}
                  onEdit={() => router.push({ pathname: '/edit-dog', params: { id: hund.id } } as never)}
                />
              ))}
            </View>
          ) : (
            <View style={s.leer}>
              <View style={s.leerRing}>
                <View style={s.leerIcon}>
                  <DogIcon size={36} color={C.accent} />
                </View>
              </View>
              <Text style={s.leerTitel}>
                {t('dogs.addFirstTitle')}
              </Text>
              <Text style={s.leerText}>
                {t('dogs.addFirstBody')}
              </Text>
              <AnimatedPressable style={s.leerBtn} onPress={handleHinzufuegen}>
                <LinearGradient
                  colors={["#00FFCC", "#00FFCC"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="add" size={18} color={C.accentText} />
                <Text style={s.leerBtnText}>{t('dog.add')}</Text>
              </AnimatedPressable>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  segments: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 16, padding: 5, borderRadius: 18, backgroundColor: C.card, gap: 6 },
  segment: { flex: 1, minHeight: 48, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: C.accent },
  segmentText: { color: C.muted, fontWeight: '700', textAlign: 'center' },
  segmentTextActive: { color: C.accentText },
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },

  kopf: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  augenbraue: {
    fontSize: 10,
    color: C.muted,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  titel: {
    fontSize: 28,
    color: C.white,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  hinzufuegenBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  inhalt: { paddingHorizontal: 20, paddingBottom: 120 },
  inhaltLeer: { flex: 1 },
  liste: { gap: 10 },

  mitte: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  fehlerIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  fehlerTitel: {
    fontSize: 16,
    color: C.white,
    fontWeight: "700",
    marginBottom: 6,
    textAlign: "center",
  },
  fehlerUnter: {
    fontSize: 13,
    color: C.muted,
    textAlign: "center",
    marginBottom: 24,
  },
  wiederholBtn: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  wiederholText: { fontSize: 14, color: C.accent, fontWeight: "700" },

  leer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  leerRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: `${C.accent}30`,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  leerIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  leerTitel: {
    fontSize: 22,
    color: C.white,
    fontWeight: "800",
    marginBottom: 10,
    textAlign: "center",
  },
  leerText: {
    fontSize: 14,
    color: C.muted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  leerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 16,
    overflow: "hidden",
  },
  leerBtnText: { fontSize: 15, color: C.accentText, fontWeight: "800" },
});

// T-184 Etappe 2: Hundekarte zeigt das letzte Training und den offenen Hinweis
// (nur lesend). Ladefehler lassen die Karte unverändert.
//
// Schnellmenü (langer Druck): dieselben Wege wie die sichtbaren Knöpfe der Karte
// plus «Bearbeiten» (sonst über das Profil erreichbar). Kein Löschen.
function DogCardWithLastTraining({ dogId, onTrainingFor, onEdit, ...props }: Omit<React.ComponentProps<typeof DogCompactCard>, 'lastTrainingLabel' | 'openHintLabel' | 'onTraining' | 'onLongPress' | 'extraAccessibilityActions' | 'onExtraAccessibilityAction'> & { dogId: string; onTrainingFor: (discipline?: string) => void; onEdit: () => void }) {
  const { t } = useT();
  const { data } = useDogTrainingSummary(dogId);
  const [menuOpen, setMenuOpen] = useState(false);
  const onTraining = () => onTrainingFor(data?.last?.disciplines[0]);
  const lastTrainingLabel = data?.last ? lastTrainingText(t, data.last.daysAgo, data.last.disciplines) : null;
  const name = props.identity.name;
  const actions: AnyvoMenuAction[] = [
    { key: 'open', label: t('common.open'), icon: 'open-outline', onPress: props.onOpen },
    ...(props.onTrainingPage ? [{ key: 'trainingPage', label: t('dogTraining.open', { name }), icon: 'list-outline' as const, onPress: props.onTrainingPage }] : []),
    { key: 'training', label: lastTrainingLabel ? t('continueTraining.next') : 'Training', icon: 'barbell-outline', onPress: onTraining },
    { key: 'faehrte', label: 'Fährte', icon: 'footsteps-outline', onPress: props.onFaehrte },
    { key: 'stats', label: 'Statistik', icon: 'stats-chart-outline', onPress: props.onStats },
    { key: 'edit', label: t('common.edit'), icon: 'create-outline', onPress: onEdit },
  ];
  return (
    <>
      <DogCompactCard {...props} onTraining={onTraining}
        lastTrainingLabel={lastTrainingLabel}
        openHintLabel={data?.openHint ? t('continueTraining.openHint', { text: data.openHint.text }) : null}
        onLongPress={() => setMenuOpen(true)}
        // Nur was der Vorlese-Funktion sonst fehlt: die übrigen Punkte sind
        // als eigene Knöpfe der Karte bereits einzeln erreichbar.
        extraAccessibilityActions={[{ name: 'edit', label: t('common.edit') }]}
        onExtraAccessibilityAction={n => { if (n === 'edit') onEdit(); }} />
      <AnyvoActionMenu visible={menuOpen} onClose={() => setMenuOpen(false)} title={name} actions={actions} />
    </>
  );
}
