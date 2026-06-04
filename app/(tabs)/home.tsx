import { DogCard } from "@/components/dogs/DogCard";
import { QuickAddSheet } from "@/components/QuickAddSheet";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Glass, isGlass } from "@/components/ui/Glass";
import { ApportIcon } from "@/components/ui/ApportIcon";
import { UnitListCard } from "@/components/training/UnitListCard";
import { C } from "@/constants/colors";
import { useDogs } from "@/hooks/useDogs";
import { useSession } from "@/hooks/useSession";
import { useTrainingFeed } from "@/hooks/useTrainingFeed";
import type { FeedItem } from "@/services/trainingFeed";
import { useHomeLayout } from "@/stores/homeLayout";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function berechneSerie(sessions: { session_date: string }[]): string {
  if (sessions.length === 0) return "0";
  const tage = new Set(sessions.map((s) => s.session_date));
  let serie = 0;
  const heute = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(heute);
    d.setDate(heute.getDate() - i);
    const key = d.toISOString().split("T")[0];
    if (tage.has(key)) serie++;
    else if (i > 0) break;
  }
  return String(serie);
}

function begruessung(): string {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

function heutigenWochentag(): number {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

function hatEinheitAnTag(
  sessions: { session_date: string }[],
  offset: number,
): boolean {
  const heute = new Date();
  const heuteIdx = heutigenWochentag();
  const d = new Date(heute);
  d.setDate(heute.getDate() - (heuteIdx - offset));
  const key = d.toISOString().split("T")[0];
  return sessions.some((s) => s.session_date === key);
}

function SchnellAktion({
  icon,
  label,
  farbe,
  onPress,
  customIcon,
}: {
  icon?: IconName;
  label: string;
  farbe: string;
  onPress?: () => void;
  customIcon?: React.ReactNode;
}) {
  return (
    <AnimatedPressable style={s.aktion} onPress={onPress}>
      <View style={[s.aktionIcon, { backgroundColor: `${farbe}12` }]}>
        {customIcon ?? <Ionicons name={icon!} size={22} color={farbe} />}
      </View>
      <Text style={s.aktionLabel}>{label}</Text>
    </AnimatedPressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { dogs, loading: hundeLoading, refresh: refreshDogs } = useDogs();
  const { feed, loading: feedLoading, refresh: refreshFeed } = useTrainingFeed();
  const layout = useHomeLayout();

  useFocusEffect(
    useCallback(() => {
      refreshDogs();
      refreshFeed();
    }, [refreshDogs, refreshFeed]),
  );

  const openFeedItem = (item: FeedItem) => {
    if      (item.source === 'unit')  router.push({ pathname: '/unit/detail', params: { id: item.id } });
    else if (item.source === 'track') router.push(`/track/${item.id}` as never);
    else                              router.push(`/training/${item.id}` as never);
  };

  const anzeigeName =
    user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "du";
  const vorname = anzeigeName.split(" ")[0];
  const heuteIdx = heutigenWochentag();
  const letzteHunde = dogs.slice(0, 3);
  // Vereinheitlichte Zeitleiste (alt + neu) als Aktivitätsbasis.
  const serie = berechneSerie(feed);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.inhalt}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ── */}
        <View style={s.header}>
          <View style={s.logoReihe}>
            <Image
              source={require("@/assets/images/icon.png")}
              style={s.logoIcon}
              contentFit="contain"
            />
            <Text style={s.logoText}>ANYVO</Text>
          </View>
        </View>

        {/* ── HERO-BANNER ── */}
        <View style={s.hero}>
          {/* Hund-Kopf: contentPosition="top" zeigt oberen Bildbereich */}
          <Image
            source={require("@/assets/images/yam20.jpg")}
            style={s.heroImg}
            contentFit="cover"
            contentPosition="top"
          />

          {/* Vignette oben */}
          <LinearGradient
            colors={["rgba(9,9,15,0.85)", "transparent"]}
            style={s.vignOben}
            pointerEvents="none"
          />
          {/* Vignette links */}
          <LinearGradient
            colors={["rgba(9,9,15,0.5)", "transparent"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={s.vignLinks}
            pointerEvents="none"
          />
          {/* Vignette rechts */}
          <LinearGradient
            colors={["transparent", "rgba(9,9,15,0.5)"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={s.vignRechts}
            pointerEvents="none"
          />
          {/* Goldener Glow */}
          <LinearGradient
            colors={["transparent", "rgba(196,168,0,0.08)"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          {/* Starker Fade nach unten */}
          <LinearGradient
            colors={["transparent", "rgba(9,9,15,0.7)", "#09090F"]}
            style={s.vignUnten}
            pointerEvents="none"
          />

          {/* ── SLOGAN ── */}
          <View style={s.slogan} pointerEvents="none">
            <Text style={s.sloganZeile}>TRAIN.</Text>
            <Text style={[s.sloganZeile, s.sloganGrau]}>ANALYZE.</Text>
            <Text style={[s.sloganZeile, s.sloganGold]}>IMPROVE.</Text>
          </View>

          <View style={s.heroKopf}>
            <View>
              <Text style={s.heroBegruessung}>{begruessung()}</Text>
              <Text style={s.heroName}>{vorname}</Text>
            </View>
          </View>

          <View style={s.heroStats}>
            <View style={s.heroStatElement}>
              <Text style={s.heroStatWert}>
                {hundeLoading ? "—" : dogs.length}
              </Text>
              <Text style={s.heroStatLabel}>HUNDE</Text>
            </View>
            <View style={s.heroStatTrenner} />
            <View style={s.heroStatElement}>
              <Text style={s.heroStatWert}>
                {feedLoading ? "—" : feed.length}
              </Text>
              <Text style={s.heroStatLabel}>EINHEITEN</Text>
            </View>
            <View style={s.heroStatTrenner} />
            <View style={s.heroStatElement}>
              <Text
                style={[
                  s.heroStatWert,
                  parseInt(serie) > 0 && s.heroStatAkzent,
                ]}
              >
                {serie}
              </Text>
              <Text style={s.heroStatLabel}>SERIE</Text>
            </View>
          </View>
        </View>

        {/* ── WOCHENSTREIFEN ── */}
        {layout.woche && (
        <View style={[s.wocheKarte, isGlass && s.cardGlass]}>
          {isGlass && <Glass style={s.glassBg} />}
          <Text style={s.wocheLabel}>DIESE WOCHE</Text>
          <View style={s.wocheReihe}>
            {TAGE.map((t, i) => {
              const istHeute = i === heuteIdx;
              const hatEinheit = hatEinheitAnTag(feed, i);
              return (
                <View key={t} style={s.tagSpalte}>
                  <Text style={[s.tagText, istHeute && s.tagTextAktiv]}>
                    {t}
                  </Text>
                  <View
                    style={[
                      s.tagPunkt,
                      istHeute && s.tagPunktHeute,
                      hatEinheit && s.tagPunktGefuellt,
                    ]}
                  />
                </View>
              );
            })}
          </View>
        </View>
        )}

        {/* ── HAUPTAKTIONEN ── */}
        {layout.hauptaktionen && (
        <View style={s.mainActions}>
          <AnimatedPressable style={s.mainCard} scale={0.96} onPress={() => router.push("/unit/start")}>
            <LinearGradient
              colors={["#00FFCC", "#00FFCC"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="play-circle" size={26} color={C.accentText} />
            <Text style={s.mainTitelDark}>Training starten</Text>
            <Text style={s.mainSubDark}>Live mittracken</Text>
          </AnimatedPressable>

          <AnimatedPressable style={[s.mainCard, s.mainCardAlt]} scale={0.96} onPress={() => router.push("/unit/document")}>
            <Ionicons name="create" size={24} color={C.accent} />
            <Text style={s.mainTitel}>Dokumentieren</Text>
            <Text style={s.mainSub}>Nachträglich erfassen</Text>
          </AnimatedPressable>
        </View>
        )}

        {/* ── LETZTE EINHEITEN ── */}
        {layout.letzteEinheiten && feed.length > 0 && (
          <View style={s.sektion}>
            <View style={s.sektionKopf}>
              <Text style={s.sektionTitel}>Letzte Einheiten</Text>
              <TouchableOpacity
                onPress={() => router.push("/unit/history")}
                activeOpacity={0.7}
              >
                <Text style={s.sektionLink}>Verlauf</Text>
              </TouchableOpacity>
            </View>
            {feed.slice(0, 3).map((item) => (
              <UnitListCard
                key={`${item.source}-${item.id}`}
                unit={item}
                onPress={() => openFeedItem(item)}
              />
            ))}
          </View>
        )}

        {/* ── MEINE HUNDE ── */}
        {layout.hunde && (
        <View style={s.sektion}>
          <View style={s.sektionKopf}>
            <Text style={s.sektionTitel}>Meine Hunde</Text>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/dogs")}
              activeOpacity={0.7}
            >
              <Text style={s.sektionLink}>Alle sehen</Text>
            </TouchableOpacity>
          </View>

          {hundeLoading ? (
            <ActivityIndicator
              color={C.accent}
              style={{ marginVertical: 20 }}
            />
          ) : letzteHunde.length > 0 ? (
            <View style={s.hundeListe}>
              {letzteHunde.map((hund) => (
                <DogCard key={hund.id} dog={hund} />
              ))}
            </View>
          ) : (
            <AnimatedPressable
              style={s.leerKarte}
              onPress={() => router.push("/add-dog")}
            >
              <View style={s.leerIcon}>
                <Ionicons name="add" size={24} color={C.accent} />
              </View>
              <View>
                <Text style={s.leerTitel}>Ersten Hund hinzufügen</Text>
                <Text style={s.leerUnter}>Tippe hier, um loszulegen</Text>
              </View>
            </AnimatedPressable>
          )}
        </View>
        )}

        {/* ── SCHNELLZUGRIFF ── */}
        {layout.schnellzugriff && (
        <View style={[s.sektion, { marginBottom: 120 }]}>
          <Text style={s.sektionTitel}>Schnellzugriff</Text>
          <View style={s.aktionen}>
            <SchnellAktion
              icon="add-circle-outline"
              label="Hund"
              farbe="#ff5f00"
              onPress={() => router.push("/add-dog")}
            />
            <SchnellAktion
              label="Training"
              farbe="#b34300"
              onPress={() => router.push("/unit/start")}
              customIcon={<ApportIcon color="#b34300" size={22} />}
            />
            <SchnellAktion
              icon="map-outline"
              label="Fährte"
              farbe="#ffaf80"
              onPress={() => router.push("/track/setup" as never)}
            />
            <SchnellAktion
              icon="stats-chart-outline"
              label="Fortschritt"
              farbe="#ffd7bf"
              onPress={() => router.push("/(tabs)/analytics")}
            />
          </View>
        </View>
        )}

        {!layout.schnellzugriff && <View style={{ height: 120 }} />}
      </ScrollView>
      <QuickAddSheet />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  inhalt: { paddingBottom: 0 },

  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: 20,
    paddingTop:        8,
    paddingBottom:     12,
  },
  logoReihe: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },
  logoIcon: {
    width:        36,
    height:       36,
    borderRadius: 8,
  },
  logoText: {
    color:         '#00FFCC',
    fontSize:      16,
    fontWeight:    '800',
    letterSpacing: 2.5,
  },
  bellBtn: {
    width:           38,
    height:          38,
    borderRadius:    19,
    backgroundColor: '#13131E',
    borderWidth:     1,
    borderColor:     '#1C1C2C',
    alignItems:      'center',
    justifyContent:  'center',
  },

  hero: {
    height: 380,
    marginBottom: 20,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  heroImg: { ...StyleSheet.absoluteFillObject },

  slogan: {
    position: "absolute",
    bottom: 80,
    left: 20,
    zIndex: 10,
  },
  sloganZeile: {
    fontSize: 24,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 1.5,
    lineHeight: 30,
  },
  sloganGrau: { color: "#888888" },
  sloganGold: { color: "#00FFCC" },

  vignOben: { position: "absolute", top: 0, left: 0, right: 0, height: 120 },
  vignUnten: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  vignLinks: { position: "absolute", top: 0, bottom: 0, left: 0, width: 80 },
  vignRechts: { position: "absolute", top: 0, bottom: 0, right: 0, width: 80 },

  heroKopf: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  heroBegruessung: {
    fontSize: 11,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  heroName: {
    fontSize: 28,
    color: C.white,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  benachrichtigungBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  heroStats: { flexDirection: "row", paddingHorizontal: 20, paddingBottom: 22 },
  heroStatElement: { flex: 1, alignItems: "center" },
  heroStatTrenner: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginVertical: 4,
  },
  heroStatWert: {
    fontSize: 22,
    color: C.white,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  heroStatAkzent: { color: C.accent },
  heroStatLabel: {
    fontSize: 9,
    color: "rgba(255,255,255,0.55)",
    fontWeight: "700",
    letterSpacing: 1.2,
  },

  wocheKarte: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  cardGlass: { backgroundColor: "transparent", overflow: "hidden" },
  glassBg:   { ...StyleSheet.absoluteFillObject },
  wocheLabel: {
    fontSize: 9,
    color: C.muted,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  wocheReihe: { flexDirection: "row", justifyContent: "space-between" },
  tagSpalte: { alignItems: "center", gap: 8 },
  tagText: { fontSize: 11, color: C.muted, fontWeight: "600" },
  tagTextAktiv: { color: C.white, fontWeight: "800" },
  tagPunkt: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  tagPunktHeute: {
    borderWidth: 1.5,
    borderColor: C.accent,
    backgroundColor: "transparent",
  },
  tagPunktGefuellt: { backgroundColor: C.accent },

  ctaBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 20,
    padding: 22,
    marginHorizontal: 20,
    marginBottom: 28,
    overflow: "hidden",
  },
  ctaTitel: {
    fontSize: 18,
    color: C.accentText,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  ctaUnter: { fontSize: 13, color: `${C.accentText}80` },
  ctaIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  mainActions: { flexDirection: "row", gap: 12, paddingHorizontal: 20, marginBottom: 28 },
  mainCard: {
    flex: 1, minHeight: 120, borderRadius: 22, padding: 16,
    justifyContent: "space-between", gap: 8, overflow: "hidden",
  },
  mainCardAlt:   { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  mainTitelDark: { fontSize: 16, color: C.accentText, fontWeight: "900", letterSpacing: -0.3 },
  mainSubDark:   { fontSize: 12, color: `${C.accentText}99`, fontWeight: "600" },
  mainTitel:     { fontSize: 16, color: C.white, fontWeight: "900", letterSpacing: -0.3 },
  mainSub:       { fontSize: 12, color: C.muted, fontWeight: "600" },

  sektion: { marginBottom: 28, paddingHorizontal: 20 },
  sektionKopf: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sektionTitel: {
    fontSize: 15,
    color: C.white,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  sektionLink: { fontSize: 13, color: C.accent, fontWeight: "700" },

  hundeListe: { gap: 10 },

  leerKarte: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: "dashed",
    padding: 18,
  },
  leerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.accentDim,
    alignItems: "center",
    justifyContent: "center",
  },
  leerTitel: {
    fontSize: 15,
    color: C.white,
    fontWeight: "700",
    marginBottom: 2,
  },
  leerUnter: { fontSize: 13, color: C.muted },

  aktionen: { flexDirection: "row", gap: 10, marginTop: 12 },
  aktion: { flex: 1, alignItems: "center", gap: 8 },
  aktionIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  aktionLabel: {
    fontSize: 10,
    color: C.muted,
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});
