import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useT, type TranslationKey } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { C } from '@/constants/colors';
import type { HealthTimelineItem } from '@/features/dogs/healthTimeline';
import type { SharedHealthOverviewData } from '@/services/healthService';
import { styles } from './SharedDogsInbox';

type Field = [TranslationKey, string | number | null | undefined];
export function SharedHealthRecord({ item, data }: { item: HealthTimelineItem; data: SharedHealthOverviewData }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const id = item.id.slice(item.id.indexOf(':') + 1);
  let fields: Field[] = [];
  if (item.kind === 'vaccination') {
    const row = data.vaccinations.find(r => r.id === id);
    if (row) fields = [['health.uxVaccinationType', row.vaccine_type], ['health.uxClinic', row.clinic_name], ['health.uxBatch', row.batch_number], ['training.exerciseNoteLabel', row.note]];
  } else if (item.kind === 'medication') {
    const row = data.medications.find(r => r.id === id);
    if (row) fields = [['health.uxDosage', row.dose_amount != null ? `${row.dose_amount} ${row.dose_unit ?? ''}` : row.dosage], ['health.uxRoute', row.administration_route], ['health.uxPrescriber', row.prescribing_vet], ['training.exerciseNoteLabel', row.note]];
  } else if (item.kind === 'vet') {
    const row = data.vetVisits.find(r => r.id === id);
    if (row) fields = [['health.uxClinic', row.clinic_name], ['health.recordDiagnosis', row.diagnosis], ['health.recordMedication', row.treatment], ['training.exerciseNoteLabel', row.note]];
  } else if (item.kind === 'parasite') {
    const row = data.parasites.find(r => r.id === id);
    if (row) fields = [['training.exerciseNoteLabel', row.note]];
  } else if (item.kind === 'condition') {
    const row = data.conditions.find(r => r.id === id);
    if (row) fields = [['sync.status', row.status], ['training.exerciseNoteLabel', row.note]];

  }
  fields = fields.filter(([, value]) => value != null && value !== '');
  return <View style={styles.card}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={item.title} onPress={() => setExpanded(value => !value)} style={styles.row}>
      <View style={styles.flex}><Text style={styles.text}>{item.title}</Text><Text style={styles.muted}>{item.date ? formatDate(new Date(item.date)) : ''}</Text>{item.detail ? <Text style={styles.text}>{item.detail}</Text> : null}{item.secondary ? <Text style={styles.muted}>{item.secondary}</Text> : null}</View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={C.accent} />
    </TouchableOpacity>
    {expanded ? fields.map(([label, value], index) => <View key={`${label}:${index}`} style={styles.copy}><Text style={styles.muted}>{t(label)}</Text><Text style={styles.text}>{value}</Text></View>) : null}
    {expanded && !fields.length ? <Text style={styles.muted}>{t('health.uxNoFurtherInfo')}</Text> : null}
  </View>;
}
