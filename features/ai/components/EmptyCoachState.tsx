import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

export function EmptyCoachState({ onStart }: { onStart?: () => void }) {
  return (
    <View style={s.wrap}>
      <View style={s.icon}><Ionicons name="sparkles-outline" size={30} color={C.accent} /></View>
      <Text style={s.title}>Sammle Trainings und entdecke Muster</Text>
      <Text style={s.txt}>Je mehr du dokumentierst, desto besser erkennt Anyvo Trends, Belastung, Trainingsbalance und Fortschritte.</Text>
      {onStart && (
        <TouchableOpacity style={s.btn} onPress={onStart} activeOpacity={0.85}>
          <Ionicons name="play" size={15} color={C.accentText} />
          <Text style={s.btnTxt}>Training starten</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 30, gap: 10 },
  icon:  { width: 60, height: 60, borderRadius: 18, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 16, color: C.white, fontWeight: '800' },
  txt:   { fontSize: 13, color: '#8B8B8B', textAlign: 'center', lineHeight: 19 },
  btn:   { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, backgroundColor: C.accent },
  btnTxt:{ fontSize: 14, color: C.accentText, fontWeight: '800' },
});
