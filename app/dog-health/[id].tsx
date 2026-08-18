import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { useToast } from '@/components/ui/Toast';
import {
  addDogDewormingEntry, addDogHealthEntry, addDogVetAppointment,
  getDogWeightHistory, getRecentDogDewormings,
  type DogDewormingEntryRow, type DogHealthEntryRow,
} from '@/services/dogHub';
import { DateField } from '@/components/ui/DateField';
import { useT } from '@/i18n';
import { useCapabilities } from '@/hooks/useCapabilities';
import { PremiumInlineUpsell } from '@/components/subscription/PremiumInlineUpsell';
import { TrendLine } from '@/components/analytics/TrendLine';
import { latestDeworming, toDateKey, weightChange, weightMeasurements } from '@/features/dogs/health';

type Load = 'leicht' | 'mittel' | 'hoch';
const LOADS: Load[] = ['leicht', 'mittel', 'hoch'];

// Editor: Gesundheits-/Belastungs-Eintrag (dog_health_entries) + optional
// nächster Tierarzttermin (dog_vet_appointments).
export default function DogHealthEditor() {
  const router = useRouter();
  const { id: dogId } = useLocalSearchParams<{ id: string }>();
  const { showToast, toast } = useToast();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { can, loading: capabilitiesLoading } = useCapabilities();
  const canWeightHistory = can('dogs.weightHistory');
  const canDewormingSchedule = can('dogs.dewormingSchedule');

  const [weight, setWeight] = useState('');
  const [measurementDate, setMeasurementDate] = useState<Date | null>(new Date());
  const [load, setLoad]     = useState<Load | null>(null);
  const [rest, setRest]     = useState(false);
  const [intense, setInt]   = useState(false);
  const [note, setNote]     = useState('');
  const [vetDate, setVetDate] = useState<Date | null>(null);
  const [vetReason, setVetReason] = useState('');
  const [dewormingDate, setDewormingDate] = useState<Date | null>(null);
  const [dewormingProduct, setDewormingProduct] = useState('');
  const [nextDewormingDate, setNextDewormingDate] = useState<Date | null>(null);
  const [weightHistory, setWeightHistory] = useState<DogHealthEntryRow[]>([]);
  const [dewormings, setDewormings] = useState<DogDewormingEntryRow[]>([]);
  const [saving, setSaving] = useState(false);

  const reloadHealthData = useCallback(() => {
    if (!dogId) return;
    const weights = canWeightHistory ? getDogWeightHistory(dogId).catch(() => []) : Promise.resolve([]);
    const deworming = getRecentDogDewormings(dogId).catch(() => []);
    Promise.all([weights, deworming]).then(([nextWeights, nextDewormings]) => {
      setWeightHistory(nextWeights);
      setDewormings(nextDewormings);
    });
  }, [canWeightHistory, dogId]);

  useFocusEffect(useCallback(() => {
    reloadHealthData();
  }, [reloadHealthData]));

  const save = async () => {
    if (!dogId || saving) return;
    const weightNum = weight.trim() ? Number(weight.replace(',', '.')) : null;
    if (weightNum != null && (!Number.isFinite(weightNum) || weightNum <= 0)) { showToast(t('dog.weightNotNumber')); return; }
    const vet = vetDate;
    const hasHealthEntry = weightNum != null || load != null || rest || intense || note.trim().length > 0;

    setSaving(true);
    const { error: healthError } = hasHealthEntry
      ? await addDogHealthEntry(dogId, {
        entry_date: measurementDate ? toDateKey(measurementDate) : undefined,
        weight_kg: weightNum, load_level: load, is_rest_day: rest, is_intense: intense, note: note.trim() || null,
      })
      : { error: null };
    const { error: dewormingError } = !healthError && dewormingDate
      ? await addDogDewormingEntry(dogId, {
        treatment_date: toDateKey(dewormingDate),
        product: dewormingProduct.trim() || null,
        note: null,
        next_due_date: canDewormingSchedule && nextDewormingDate ? toDateKey(nextDewormingDate) : null,
      })
      : { error: null };
    const { error: vetError } = !healthError && !dewormingError && vet
      ? await addDogVetAppointment(dogId, vet.toISOString(), vetReason.trim() || null)
      : { error: null };
    setSaving(false);
    if (healthError || dewormingError || vetError) { haptic.error(); showToast(t('calendar.saveFailed')); return; }
    haptic.success();
    router.back();
  };

  const measurements = weightMeasurements(weightHistory);
  const trend = weightChange(weightHistory);
  const latestDewormingEntry = latestDeworming(dewormings);
  const chartWidth = Math.max(220, width - 32);

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity>
          <Text style={s.barTitle}>{t('dog.addEntry')}</Text>
          <View style={{ width: 38 }} />
        </View>

        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            <Text style={s.label}>{t('dog.weight')}</Text>
            <TextInput value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder={t('dog.weightPlaceholder')} placeholderTextColor={C.trackTextMut} style={s.input} />
            <DateField value={measurementDate} onChange={setMeasurementDate} onClear={() => setMeasurementDate(null)} label={t('health.measurementDate')} maximumDate={new Date()} />

            <Text style={s.label}>{t('dog.load')}</Text>
            <View style={s.seg}>
              {LOADS.map(l => {
                const on = load === l;
                return (
                  <TouchableOpacity key={l} style={[s.segItem, on && s.segOn]} onPress={() => setLoad(on ? null : l)} activeOpacity={0.85}>
                    <Text style={[s.segTxt, on && s.segTxtOn]}>{l.charAt(0).toUpperCase() + l.slice(1)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.toggleRow}><Text style={s.toggleLabel}>{t('dog.restDay')}</Text><Switch value={rest} onValueChange={setRest} trackColor={{ false: C.trackCardAlt, true: C.trackPrimary }} thumbColor="#fff" /></View>
            <View style={s.toggleRow}><Text style={s.toggleLabel}>{t('dog.intenseUnit')}</Text><Switch value={intense} onValueChange={setInt} trackColor={{ false: C.trackCardAlt, true: C.trackPrimary }} thumbColor="#fff" /></View>

            <Text style={s.label}>{t('common.notes')}</Text>
            <TextInput value={note} onChangeText={setNote} placeholder={t('common.optional')} placeholderTextColor={C.trackTextMut} multiline style={[s.input, s.multiline]} />

            <Text style={s.label}>{t('dog.nextVetOptional')}</Text>
            <DateField value={vetDate} onChange={setVetDate} onClear={() => setVetDate(null)} placeholder={t('dog.noAppointment')} minimumDate={new Date()} style={{ marginBottom: 8 }} />
            <TextInput value={vetReason} onChangeText={setVetReason} placeholder={t('dog.reasonOptional')} placeholderTextColor={C.trackTextMut} style={s.input} />

            <View style={s.divider} />
            <Text style={s.sectionTitle}>{t('health.deworming')}</Text>
            {latestDewormingEntry ? (
              <View style={s.summaryRow}>
                <Ionicons name="shield-checkmark-outline" size={17} color={C.trackPrimary} />
                <Text style={s.summaryText}>
                  {t('health.lastDeworming', { date: formatDate(latestDewormingEntry.treatment_date) })}
                  {latestDewormingEntry.product ? ` · ${latestDewormingEntry.product}` : ''}
                </Text>
              </View>
            ) : <Text style={s.emptyText}>{t('health.noDeworming')}</Text>}
            <DateField value={dewormingDate} onChange={setDewormingDate} onClear={() => setDewormingDate(null)} label={t('health.dewormingDate')} placeholder={t('health.noDeworming')} maximumDate={new Date()} />
            <TextInput value={dewormingProduct} onChangeText={setDewormingProduct} placeholder={t('health.productOptional')} placeholderTextColor={C.trackTextMut} style={s.input} />
            {!capabilitiesLoading && canDewormingSchedule ? (
              <DateField value={nextDewormingDate} onChange={setNextDewormingDate} onClear={() => setNextDewormingDate(null)} label={t('health.nextDewormingOptional')} placeholder={t('health.noDewormingPlanned')} minimumDate={dewormingDate ?? new Date()} />
            ) : null}

            <View style={s.divider} />
            <Text style={s.sectionTitle}>{t('health.weightHistory')}</Text>
            {!capabilitiesLoading && (canWeightHistory ? (
              measurements.length ? (
                <View style={s.historyCard}>
                  <TrendLine points={measurements.map(entry => ({ date: entry.entry_date, score: entry.weight_kg! }))} width={chartWidth} />
                  <Text style={s.historyText}>
                    {trend?.delta == null
                      ? t('health.weightFirstMeasurement')
                      : t('health.weightChange', { value: signedKg(trend.delta) })}
                  </Text>
                </View>
              ) : <Text style={s.emptyText}>{t('health.noWeightHistory')}</Text>
            ) : (
              <PremiumInlineUpsell title={t('health.weightHistoryUpsell')} />
            ))}

            <Text style={s.sectionTitle}>{t('health.dewormingHistory')}</Text>
            {!capabilitiesLoading && (canDewormingSchedule ? (
              dewormings.length ? (
                <View style={s.historyCard}>
                  {dewormings.map(entry => (
                    <View key={entry.id} style={s.historyItem}>
                      <View>
                        <Text style={s.historyItemTitle}>{formatDate(entry.treatment_date)}</Text>
                        {entry.product ? <Text style={s.historyItemSub}>{entry.product}</Text> : null}
                      </View>
                      {entry.next_due_date ? <Text style={s.dueText}>{t('health.scheduledFor', { date: formatDate(entry.next_due_date) })}</Text> : null}
                    </View>
                  ))}
                </View>
              ) : <Text style={s.emptyText}>{t('health.noDewormingHistory')}</Text>
            ) : (
              <PremiumInlineUpsell title={t('health.dewormingScheduleUpsell')} />
            ))}

            <View style={{ height: 16 }} />
            <AnyvoButton label={t('common.save')} icon="checkmark" onPress={save} loading={saving} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {toast}
    </View>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function signedKg(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('de-CH')} kg`;
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.trackBg },
  flex:       { flex: 1 },
  bar:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn:    { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitle:   { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  scroll:     { padding: 16, gap: 8 },
  label:      { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 12, marginBottom: 2 },
  input:      { backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.trackText },
  multiline:  { minHeight: 80, textAlignVertical: 'top' },
  seg:        { flexDirection: 'row', gap: 8 },
  segItem:    { flex: 1, alignItems: 'center', backgroundColor: C.trackCard, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 12 },
  segOn:      { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  segTxt:     { fontSize: 13.5, color: C.trackTextSec, fontWeight: '700' },
  segTxtOn:   { color: '#04201b', fontWeight: '800' },
  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 8, paddingHorizontal: 14, marginTop: 8 },
  toggleLabel:{ fontSize: 14.5, color: C.trackText, fontWeight: '700' },
  divider:    { height: 1, backgroundColor: C.trackBorder, marginTop: 20, marginBottom: 2 },
  sectionTitle:{ fontSize: 16, color: C.trackText, fontWeight: '800', marginTop: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder, borderRadius: 14, padding: 12 },
  summaryText:{ flex: 1, color: C.trackTextSec, fontSize: 13, fontWeight: '600' },
  emptyText:  { color: C.trackTextMut, fontSize: 13, lineHeight: 18 },
  historyCard:{ backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, overflow: 'hidden' },
  historyText:{ color: C.trackTextSec, fontSize: 13, fontWeight: '600', paddingHorizontal: 14, paddingBottom: 12 },
  historyItem:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: C.trackBorder },
  historyItemTitle:{ color: C.trackText, fontSize: 14, fontWeight: '800' },
  historyItemSub:{ color: C.trackTextSec, fontSize: 12, marginTop: 2 },
  dueText:    { flexShrink: 1, color: C.trackPrimary, fontSize: 11, fontWeight: '700', textAlign: 'right' },
});
