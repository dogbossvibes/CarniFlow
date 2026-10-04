import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import {
  customerDiagnosticsAvailability, hasSupportDiagnostics, shareCustomerDiagnostics, shareSupportDiagnostics,
  type CustomerDiagnosticsAvailability,
} from '@/features/tracking/services/supportDiagnosticsService';


/**
 * Dezente Sekundär-Aktion der Auswertung: teilt die privacy-reduced Support-Diagnose dieser
 * Fährte über das native Share-Sheet. Kein Primary-CTA.
 *
 * Ohne `detail` (bisheriges Verhalten): nur sichtbar, wenn eine Support-Capture vorliegt.
 * Mit `detail` (Kunden-Fährtendiagnose): die Capture ist nur noch Anreicherung — fehlt sie,
 * wird aus den gespeicherten Daten der Fährte geteilt; geht auch das nicht, erscheint ein
 * verständlicher Hinweis statt eines Buttons.
 */
export function SupportDiagnosticsRow({ sessionLocalId, detail }: { sessionLocalId: string; detail?: Record<string, any> | null }) {
  const { t } = useT();
  const TITLE = t('track.customerDiagnosis.shareTitle');
  const customer = detail !== undefined;
  const [availability, setAvailability] = useState<CustomerDiagnosticsAvailability | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setAvailability(null);
    const check: Promise<CustomerDiagnosticsAvailability> = customer
      ? customerDiagnosticsAvailability(sessionLocalId, detail)
      : hasSupportDiagnostics(sessionLocalId).then(v => (v ? 'capture' : 'none'));
    check.then(v => { if (alive) setAvailability(v); }).catch(() => { if (alive) setAvailability('none'); });
    return () => { alive = false; };
  }, [sessionLocalId, detail, customer]);

  if (availability == null) return null;
  if (availability === 'none') {
    return customer ? <Text style={s.unavailable} testID="support-diagnostics-unavailable">{t('track.customerDiagnosis.unavailable')}</Text> : null;
  }

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = customer ? await shareCustomerDiagnostics(sessionLocalId, detail) : await shareSupportDiagnostics(sessionLocalId);
      if (!result.ok) {
        Alert.alert(TITLE, result.reason === 'missing'
          ? t('track.customerDiagnosis.shareMissing')
          : t('track.customerDiagnosis.shareFailed'));
      }
    } finally { setBusy(false); }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={TITLE}
      accessibilityHint={t('track.customerDiagnosis.shareSubtitle')}
      accessibilityState={{ disabled: busy, busy }}
      style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
      testID="support-diagnostics-share"
    >
      <View style={s.iconWrap}>
        {busy
          ? <ActivityIndicator size="small" color={C.trackTextSec} />
          : <Ionicons name="share-outline" size={20} color={C.trackTextSec} />}
      </View>
      <View style={s.texts}>
        <Text style={s.title}>{TITLE}</Text>
        <Text style={s.subtitle}>{t(availability === 'persisted' ? 'track.customerDiagnosis.shareSubtitlePersisted' : 'track.customerDiagnosis.shareSubtitle')}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64,
    marginTop: 18, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  texts: { flex: 1, gap: 2 },
  title: { color: C.trackText, fontSize: 15, fontWeight: '700' },
  subtitle: { color: C.trackTextSec, fontSize: 12, lineHeight: 17 },
  unavailable: { color: C.trackTextSec, fontSize: 12, lineHeight: 17, marginTop: 14 },
});
