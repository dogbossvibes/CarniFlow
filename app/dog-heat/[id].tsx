import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { DateField } from '@/components/ui/DateField';
import { toISODate } from '@/features/dogs/dateInput';
import { addHeatCycle } from '@/features/dogs/heatCycles';
import { useT } from '@/i18n';
import { useCapabilities } from '@/hooks/useCapabilities';

const PINK = '#F472B6';
const PHASES = ['Proöstrus', 'Östrus', 'Diöstrus', 'Anöstrus'];

// Editor: Läufigkeit eintragen (lokal, AsyncStorage über addHeatCycle).
export default function DogHeatEditor() {
  const router = useRouter();
  const { isPro, loading: capLoading } = useCapabilities();
  const { id: dogId } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const insets = useSafeAreaInsets();

  // NEWBIE (Nicht-Pro) hat kein Läufigkeits-/Heat-Tracking (Premium): auf die bestehende
  // Upgrade-Ansicht (Active) leiten. Allgemeine Gesundheit (dog-health) bleibt erlaubt.
  useEffect(() => {
    if (!capLoading && !isPro) router.replace('/premium' as never);
  }, [capLoading, isPro, router]);

  const [start, setStart] = useState<Date | null>(new Date());
  const [end, setEnd]     = useState<Date | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!dogId || saving || !start) return;
    setSaving(true);
    try {
      const { error } = await addHeatCycle(dogId, {
        startDate: toISODate(start),
        endDate:   end ? toISODate(end) : null,
        phase,
        notes:     notes.trim() || null,
      });
      if (error) { haptic.error(); Alert.alert(t('common.error'), t('dog.heatSaveFailedTable')); return; }
      haptic.success();
      router.back();
    } catch {
      haptic.error();
      Alert.alert(t('common.error'), t('calendar.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!capLoading && !isPro) return null;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity>
          <Text style={s.barTitle}>{t('dog.addHeat')}</Text>
          <View style={{ width: 38 }} />
        </View>

        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            <Text style={s.label}>{t('dog.heatStart')}</Text>
            <DateField value={start} onChange={setStart} maximumDate={new Date()} />

            <Text style={s.label}>{t('dog.heatEndOptional')}</Text>
            <DateField value={end} onChange={setEnd} onClear={() => setEnd(null)} placeholder={t('dog.stillOpen')} maximumDate={new Date()} />

            <Text style={s.label}>{t('dog.heatPhaseOptional')}</Text>
            <View style={s.chips}>
              {PHASES.map(ph => {
                const on = phase === ph;
                return (
                  <TouchableOpacity key={ph} style={[s.chip, on && s.chipOn]} onPress={() => setPhase(on ? null : ph)} activeOpacity={0.85}>
                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>{ph}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.label}>{t('dog.observationsOptional')}</Text>
            <TextInput
              value={notes} onChangeText={setNotes} multiline
              placeholder={t('dog.heatNotesPlaceholder')}
              placeholderTextColor={C.trackTextMut} style={[s.input, s.multiline]}
            />

            <View style={{ height: 16 }} />
            <AnyvoButton label={t('common.save')} icon="checkmark" onPress={save} loading={saving} />
            <Text style={s.disclaimer}>{t('dog.heatDisclaimer')}</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.trackBg },
  flex:      { flex: 1 },
  bar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn:   { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitle:  { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  scroll:    { padding: 16, gap: 8 },
  label:     { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 12, marginBottom: 2 },
  input:     { backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.trackText },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:      { backgroundColor: C.trackCard, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 13, paddingVertical: 9 },
  chipOn:    { backgroundColor: PINK, borderColor: PINK },
  chipTxt:   { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
  chipTxtOn: { color: '#2a0a1c', fontWeight: '800' },
  disclaimer:{ fontSize: 11, color: C.trackTextMut, lineHeight: 15, textAlign: 'center', marginTop: 12 },
});
