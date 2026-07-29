import { C } from '@/constants/colors';
import { GUIDED_TOUR } from '@/features/help/helpRegistry';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// „ANYVO kennenlernen" — kurzer geführter Rundgang aus der Help-Registry.
// Startet KEIN echtes Training; reines Info-Overlay mit Zurück/Weiter/Fertig.
export function GuidedTour({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const total = GUIDED_TOUR.length;
  const current = GUIDED_TOUR[step];
  const isLast = step === total - 1;

  const finish = () => { setStep(0); onClose(); };
  const next = () => (isLast ? finish() : setStep((s) => Math.min(s + 1, total - 1)));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  if (!current) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={finish}>
      <View style={s.backdrop}>
        <SafeAreaView edges={['bottom']} style={s.safe}>
          <View style={s.card} accessibilityViewIsModal accessibilityLabel={`ANYVO kennenlernen, Schritt ${step + 1} von ${total}`}>
            <View style={s.kopf}>
              <Text style={s.counter}>{step + 1} / {total}</Text>
              <TouchableOpacity onPress={finish} hitSlop={10} accessibilityRole="button" accessibilityLabel="Rundgang schliessen">
                <Ionicons name="close" size={22} color={C.muted} />
              </TouchableOpacity>
            </View>

            <Text style={s.title}>{current.title}</Text>
            <Text style={s.text}>{current.text}</Text>

            {/* Fortschritts-Punkte */}
            <View style={s.dots}>
              {GUIDED_TOUR.map((_, i) => (
                <View key={i} style={[s.dot, i === step && s.dotActive]} />
              ))}
            </View>

            <View style={s.actions}>
              <TouchableOpacity
                style={[s.secondaryBtn, step === 0 && s.btnDisabled]}
                onPress={back}
                disabled={step === 0}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Zurück"
              >
                <Text style={[s.secondaryText, step === 0 && s.textDisabled]}>Zurück</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.primaryBtn}
                onPress={next}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={isLast ? 'Fertig' : 'Weiter'}
              >
                <Text style={s.primaryText}>{isLast ? 'Fertig' : 'Weiter'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  safe: { paddingHorizontal: 16 },
  card: {
    backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border,
    padding: 22, marginBottom: 8,
  },
  kopf: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  counter: { fontSize: 12, color: C.accent, fontWeight: '800', letterSpacing: 1 },
  title: { fontSize: 22, color: C.white, fontWeight: '900', letterSpacing: -0.4, marginBottom: 10 },
  text: { fontSize: 15, color: 'rgba(255,255,255,0.82)', lineHeight: 23, marginBottom: 20 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 20 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.accent, width: 18 },
  actions: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  secondaryText: { fontSize: 15, color: C.white, fontWeight: '700' },
  textDisabled: { color: C.muted },
  primaryBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 15, color: C.accentText, fontWeight: '800' },
});
