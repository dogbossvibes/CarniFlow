import { DogCard } from "@/components/dogs/DogCard";
import { QuickAddSheet } from "@/components/QuickAddSheet";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { DogIcon } from "@/components/ui/DogIcon";
import { C } from "@/constants/colors";
import { useDogs } from "@/hooks/useDogs";
import { usePlan } from "@/hooks/usePlan";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HundeScreen() {
  const router = useRouter();
  const { dogs, loading, error, refresh } = useDogs();
  const { isPremium } = usePlan();

  const handleHinzufuegen = () => {
    if (!isPremium && dogs.length >= 1) {
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
          <Text style={s.augenbraue}>DEINE HUNDE</Text>
          <Text style={s.titel}>Meine Hunde</Text>
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

      {loading ? (
        <View style={s.mitte}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : error ? (
        <View style={s.mitte}>
          <View style={s.fehlerIcon}>
            <Ionicons name="cloud-offline-outline" size={28} color={C.muted} />
          </View>
          <Text style={s.fehlerTitel}>Hunde konnten nicht geladen werden</Text>
          <Text style={s.fehlerUnter}>{error}</Text>
          <AnimatedPressable style={s.wiederholBtn} onPress={refresh}>
            <Text style={s.wiederholText}>Erneut versuchen</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.inhalt, dogs.length === 0 && s.inhaltLeer]}
          showsVerticalScrollIndicator={false}
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
                <DogCard key={hund.id} dog={hund} />
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
                Füge deinen ersten Vierbeiner hinzu! 🐾
              </Text>
              <Text style={s.leerText}>
                Registriere deinen Hund und fange an, Trainings und Fortschritte
                zu tracken.
              </Text>
              <AnimatedPressable style={s.leerBtn} onPress={handleHinzufuegen}>
                <LinearGradient
                  colors={["#00FFCC", "#00FFCC"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="add" size={18} color={C.accentText} />
                <Text style={s.leerBtnText}>Hund hinzufügen</Text>
              </AnimatedPressable>
            </View>
          )}
        </ScrollView>
      )}
      <QuickAddSheet />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
