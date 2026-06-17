import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useVoiceCommands } from '@/features/voice/hooks/useVoiceCommands';
import { commandLabel, type VoiceCommand } from '@/features/voice/services/voiceCommandParser';

// Sprachsteuerungs-Button für den Fährtenmodus: aktivieren/deaktivieren,
// Listening-Status, erkannter Befehl als kurzes Overlay.
export function VoiceCommandButton({ onCommand }: { onCommand: (cmd: VoiceCommand) => void }) {
  const { enabled, isListening, lastCommand, enable, disable } = useVoiceCommands(onCommand);
  const [toast, setToast] = useState<string | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  // Letzten erkannten Befehl kurz als Overlay zeigen.
  useEffect(() => {
    if (!lastCommand) return;
    setToast(commandLabel(lastCommand));
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [lastCommand]);

  useEffect(() => {
    if (isListening) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]));
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(1);
  }, [isListening, pulse]);

  return (
    <View style={s.wrap}>
      {toast && (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={14} color={C.accent} />
          <Text style={s.toastTxt}>{toast}</Text>
        </View>
      )}
      <TouchableOpacity style={[s.btn, enabled && s.btnOn]} onPress={() => (enabled ? disable() : enable())} activeOpacity={0.85}>
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <Ionicons name={enabled ? 'mic' : 'mic-outline'} size={18} color={enabled ? '#04201b' : C.white} />
        </Animated.View>
        <Text style={[s.txt, enabled && s.txtOn]}>
          {enabled ? (isListening ? 'Zuhören…' : 'Sprachsteuerung an') : 'Sprachsteuerung'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:    { alignItems: 'center' },
  toast:   { position: 'absolute', bottom: '110%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(20,22,25,0.92)', borderWidth: 1, borderColor: C.accentMid },
  toastTxt:{ fontSize: 12.5, color: C.white, fontWeight: '700' },
  btn:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: C.border },
  btnOn:   { backgroundColor: C.accent, borderColor: C.accent },
  txt:     { fontSize: 13, color: C.white, fontWeight: '700' },
  txtOn:   { color: '#04201b' },
});
