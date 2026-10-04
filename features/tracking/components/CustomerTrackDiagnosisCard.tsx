import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { buildCustomerDiagnosisSummary, formatDiagnosisValue } from '@/features/tracking/utils/customerTrackDiagnosis';
import { SupportDiagnosticsRow } from '@/features/tracking/components/SupportDiagnosticsRow';

/**
 * „Fährtendiagnose" für normale Kunden in der Auswertung: verständliche Zusammenfassung der
 * GESPEICHERTEN Daten dieser Fährte (nur vorhandene Werte) + „Diagnosedaten teilen".
 * Rein lesend; getrennt von der internen QA-Diagnose (/dev, nur interne Tester).
 */
export function CustomerTrackDiagnosisCard({ sessionLocalId, detail }: { sessionLocalId: string; detail: Record<string, any> }) {
  const { t } = useT();
  const summary = useMemo(() => buildCustomerDiagnosisSummary(detail), [detail]);
  return (
    <View style={s.card} testID="customer-track-diagnosis">
      <View style={s.header}>
        <Ionicons name="pulse-outline" size={18} color={C.trackTextSec} />
        <Text style={s.title}>{t('track.customerDiagnosis.title')}</Text>
      </View>
      {summary.rows.map(r => (
        <View key={r.key} style={s.row}>
          <Text style={s.label}>{t(r.labelKey)}</Text>
          <Text style={s.value} numberOfLines={1}>{formatDiagnosisValue(r.value, t)}</Text>
        </View>
      ))}
      <SupportDiagnosticsRow sessionLocalId={sessionLocalId} detail={detail} />
    </View>
  );
}

const s = StyleSheet.create({
  card:   { marginTop: 18, padding: 16, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  title:  { color: C.trackText, fontSize: 15, fontWeight: '800' },
  row:    { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.trackBorder },
  label:  { color: C.trackTextSec, fontSize: 13, flexShrink: 1 },
  value:  { color: C.trackText, fontSize: 13, fontWeight: '700', textAlign: 'right' },
});
