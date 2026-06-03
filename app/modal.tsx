import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const BG = "#0F1115";
const CARD = "#13161C";
const BORDER = "#1E2230";
const WHITE = "#FFFFFF";
const MUTED = "#6B7280";

export default function ModalScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.handle} />
      <View style={styles.container}>
        <Text style={styles.title}>Modal</Text>
        <Text style={styles.body}>This is a modal screen.</Text>
        <Link href="/(tabs)/home" dismissTo asChild>
          <TouchableOpacity style={styles.btn} activeOpacity={0.7}>
            <Ionicons name="close" size={18} color={WHITE} />
            <Text style={styles.btnText}>Dismiss</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
    marginTop: 12,
    marginBottom: 8,
  },
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 24, color: WHITE, fontWeight: "700", marginBottom: 8 },
  body: { fontSize: 15, color: MUTED, marginBottom: 32 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  btnText: { fontSize: 15, color: WHITE, fontWeight: "600" },
});
