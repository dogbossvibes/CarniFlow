import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useVoiceRecorder } from '@/features/voice/hooks/useVoiceRecorder';
import { formatDuration } from '@/features/voice/services/voiceRecordingService';

// Aufnahme-Card im ANYVO-Design: großer Record-Button, Timer, Pause/Weiter,
// Speichern/Abbrechen, Türkis-Glow + kleiner roter REC-Punkt.
export function VoiceRecorderCard({
  onSave, onCancel,
}: {
  onSave: (uri: string, durationSeconds: number) => void;
  onCancel?: () => void;
}) {
  const rec = useVoiceRecorder();
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (rec.isRecording && !rec.isPaused) {
      const loop = Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]));
      loop.start();
      return () => loop.stop();
    }
    glow.setValue(0);
  }, [rec.isRecording, rec.isPaused, glow]);

  const idle = !rec.isRecording;

  const onMainPress = async () => {
    if (idle) await rec.start();
    else if (rec.isPaused) rec.resume();
    else rec.pause();
  };

  const save = async () => {
    const { uri, duration } = await rec.stop();
    if (uri) onSave(uri, duration);
  };

  return (
    <View style={s.card}>
      <View style={s.timerRow}>
        {rec.isRecording && !rec.isPaused && <View style={s.recDot} />}
        <Text style={s.timer}>{formatDuration(rec.seconds)}</Text>
      </View>
      <Text style={s.hint}>{idle ? 'Tippe zum Aufnehmen' : rec.isPaused ? 'Pausiert' : 'Aufnahme läuft…'}</Text>

      <View style={s.mainWrap}>
        <Animated.View style={[s.glow, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }]} />
        <TouchableOpacity style={[s.mainBtn, !idle && !rec.isPaused && s.mainBtnRec]} onPress={onMainPress} activeOpacity={0.85}>
          <Ionicons name={idle ? 'mic' : rec.isPaused ? 'play' : 'pause'} size={34} color={C.accentText} />
        </TouchableOpacity>
      </View>

      <View style={s.actions}>
        <TouchableOpacity style={s.ghost} onPress={() => { rec.cancel(); onCancel?.(); }} activeOpacity={0.8}>
          <Ionicons name="close" size={18} color={C.muted} />
          <Text style={s.ghostTxt}>Abbrechen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.save, (idle || rec.seconds < 1) && { opacity: 0.4 }]} onPress={save} disabled={idle || rec.seconds < 1} activeOpacity={0.85}>
          <Ionicons name="checkmark" size={18} color={C.accentText} />
          <Text style={s.saveTxt}>Speichern</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card:     { backgroundColor: C.card, borderRadius: 24, borderWidth: 1, borderColor: C.border, padding: 22, alignItems: 'center' },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  recDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: C.danger },
  timer:    { fontSize: 44, color: C.white, fontWeight: '900', letterSpacing: -1 },
  hint:     { fontSize: 12.5, color: C.muted, marginTop: 4 },
  mainWrap: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center', marginVertical: 18 },
  glow:     { position: 'absolute', width: 110, height: 110, borderRadius: 55, backgroundColor: C.accent },
  mainBtn:  { width: 84, height: 84, borderRadius: 42, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  mainBtnRec:{ backgroundColor: C.accent },
  actions:  { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  ghost:    { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 14, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  ghostTxt: { fontSize: 14, color: C.muted, fontWeight: '700' },
  save:     { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 14, backgroundColor: C.accent },
  saveTxt:  { fontSize: 14, color: C.accentText, fontWeight: '800' },
});
