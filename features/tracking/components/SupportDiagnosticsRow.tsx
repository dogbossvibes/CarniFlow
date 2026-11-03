import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import {
  customerDiagnosticsOverview, hasSupportDiagnostics, shareCustomerDiagnostics, shareSupportDiagnostics,
  type CustomerDiagnosticsOverview,
} from '@/features/tracking/services/supportDiagnosticsService';
import type { RecordingProvenance } from '@/features/tracking/utils/diagnosticProvenance';


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
  const [overview, setOverview] = useState<CustomerDiagnosticsOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const sessionRef = useRef(sessionLocalId);
  sessionRef.current = sessionLocalId;
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  useEffect(() => {
    let alive = true;
    setOverview(null);
    const check: Promise<CustomerDiagnosticsOverview> = customer
      ? customerDiagnosticsOverview(sessionLocalId, detail)
      : hasSupportDiagnostics(sessionLocalId).then(v => ({ availability: v ? 'capture' : 'none', partial: false, reduced: false }));
    check.then(v => { if (alive) setOverview(v); }).catch(() => { if (alive) setOverview({ availability: 'none', partial: false, reduced: false }); });
    return () => { alive = false; };
  }, [sessionLocalId, detail, customer]);

  if (overview == null) return <ActivityIndicator size="small" color={C.trackTextSec} accessibilityRole="progressbar" accessibilityState={{ busy: true }} accessibilityLabel={TITLE} />;
  const { availability } = overview;
  if (availability === 'none') {
    return customer ? <Text style={s.unavailable} testID="support-diagnostics-unavailable">{t('track.customerDiagnosis.unavailable')}</Text> : null;
  }

  const onPress = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = customer ? await shareCustomerDiagnostics(sessionLocalId, detail) : await shareSupportDiagnostics(sessionLocalId);
      if (!result.ok && result.reason !== 'busy' && mountedRef.current && sessionRef.current === sessionLocalId) {
        Alert.alert(TITLE, result.reason === 'missing'
          ? t('track.customerDiagnosis.shareMissing')
          : t('track.customerDiagnosis.shareFailed'));
      }
    } finally { busyRef.current = false; if (mountedRef.current) setBusy(false); }
  };

  const phaseLabel = (phase?: RecordingProvenance) => {
    if (!phase || phase.availability !== 'available') return t('track.customerDiagnosis.metadataUnknown');
    const environments = new Set(phase.segments.map(segment => JSON.stringify(segment.environment)));
    if (environments.size !== 1) return t('track.customerDiagnosis.metadataMultiple');
    const env = phase.segments[0].environment;
    const label = t('track.customerDiagnosis.metadataValue', {
      version: env.appVersion ?? t('track.customerDiagnosis.unknown'),
      build: env.nativeBuildVersion ?? t('track.customerDiagnosis.unknown'),
      model: env.deviceModel ?? t('track.customerDiagnosis.unknown'),
    });
    return phase.partial ? `${label} · ${t('track.customerDiagnosis.metadataPartial')}` : label;
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
        <Text style={s.subtitle}>{t('track.customerDiagnosis.trackLabHint')}</Text>
        <Text style={s.subtitle}>{t('track.customerDiagnosis.layMetadata', { value: phaseLabel(overview.recording?.lay) })}</Text>
        <Text style={s.subtitle}>{t('track.customerDiagnosis.searchMetadata', { value: phaseLabel(overview.recording?.search) })}</Text>
        {overview.partial && <Text style={s.subtitle}>{t('track.customerDiagnosis.capturePartial')}</Text>}
        {overview.reduced && <Text style={s.subtitle}>{t('track.customerDiagnosis.captureReduced')}</Text>}
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
