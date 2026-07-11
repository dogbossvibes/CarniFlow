import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FT } from '@/constants/colors';

// ─────────────────────────────────────────────────────────────────────────
// Prominente In-App-Offenlegung (Google-Play-Pflicht) für den Hintergrund-
// standort. Wird ZWINGEND VOR dem Start einer Fährtenaufnahme gezeigt und
// VOR der Android-Berechtigungsanfrage. Die Aufnahme (GPS + Timer) startet
// erst nach „Weiter". Bei „Abbrechen" passiert nichts.
//
// Der Dialog schliesst ausschliesslich über die beiden Buttons:
//   • Hardware-Back (Android) wird bewusst ignoriert (onRequestClose = no-op).
//   • Tippen ausserhalb schliesst nicht (Backdrop ist kein Touchable).
// Inhalt scrollt bei kleinen Displays / grosser Schrift; Buttons bleiben fix
// sichtbar. Accessibility nach Google Best Practices annotiert.
// ─────────────────────────────────────────────────────────────────────────
export function BackgroundLocationDisclosure({
  visible, onCancel, onContinue,
}: { visible: boolean; onCancel: () => void; onContinue: () => void }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => { /* Hardware-Back bewusst ignorieren */ }}
    >
      {/* Dunkler Hintergrund — kein Schliessen per Tap ausserhalb. */}
      <View style={s.backdrop}>
        <View style={s.card} accessibilityViewIsModal>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={s.iconWrap}
              importantForAccessibility="no"
              accessibilityElementsHidden
            >
              <Ionicons name="paw" size={26} color={FT.acc} />
            </View>

            <Text style={s.title} accessibilityRole="header">Standort im Hintergrund</Text>

            <Text style={s.body}>
              Während einer aktiven Fährtenaufnahme zeichnet Anyvo deinen Standort auch bei
              gesperrtem Display oder wenn sich die App im Hintergrund befindet auf.
            </Text>
            <Text style={s.body}>
              Dadurch wird die Fährte vollständig und lückenlos aufgezeichnet.
            </Text>
            <Text style={s.body}>
              Der Standort wird ausschliesslich während einer aktiv gestarteten
              Fährtenaufnahme verwendet.
            </Text>
          </ScrollView>

          <View style={s.actions}>
            <Pressable
              style={[s.btn, s.btnGhost]}
              onPress={onCancel}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Abbrechen"
            >
              <Text style={s.btnGhostText}>Abbrechen</Text>
            </Pressable>
            <Pressable
              style={[s.btn, s.btnPrimary]}
              onPress={onContinue}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Weiter"
            >
              <Text style={s.btnPrimaryText}>Weiter</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: FT.surface2,
    borderRadius: FT.rLg,
    borderWidth: 1,
    borderColor: FT.glassLine,
    overflow: 'hidden',
  },
  scroll: {
    flexShrink: 1,   // Inhalt darf schrumpfen → Buttons bleiben fix sichtbar
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 6,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: FT.accDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: FT.text,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: FT.muted,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: 16,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: FT.rSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: FT.lineStrong,
  },
  btnGhostText: {
    fontSize: 15,
    fontWeight: '800',
    color: FT.text,
  },
  btnPrimary: {
    backgroundColor: FT.acc,
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '900',
    color: FT.accText,
  },
});
