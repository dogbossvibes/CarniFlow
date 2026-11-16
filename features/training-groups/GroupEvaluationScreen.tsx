import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import type { EvalPoint, EvaluationDetail } from '@/features/tracking-exchange/groups/evaluationService';
import type { GroupErrorCode } from '@/features/tracking-exchange/groups/groupRpc';
import { groupErrorCode, groupErrorText, useGroupServices } from './groupHub';
import { formatEvalDuration } from './evaluationFormat';

/** Linie in Stücke teilen, damit Unterbrüche nicht als gerade Verbindung erscheinen. */
export function splitAtBreaks(points: readonly EvalPoint[]): EvalPoint[][] {
  const parts: EvalPoint[][] = [];
  for (const p of points) {
    if (p.breakBefore || parts.length === 0) parts.push([]);
    parts[parts.length - 1].push(p);
  }
  return parts.filter(part => part.length >= 2);
}

function region(points: EvalPoint[]) {
  const lats = points.map(p => p.lat), lngs = points.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.002, (maxLat - minLat) * 1.4), longitudeDelta: Math.max(0.002, (maxLng - minLng) * 1.4) };
}

/**
 * Trainer-Sicht (Stufe 4a): eine geteilte Auswertung mit abgesuchter Linie und Kennzahlen.
 * Die gelegte Linie ist nur dabei, wenn die Hundeführerin selbst gelegt hat (#146); sonst ist `laid` leer.
 */
export default function GroupEvaluationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trackId = typeof id === 'string' ? id : '';
  const { t } = useT();
  const services = useGroupServices();
  const [detail, setDetail] = useState<EvaluationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GroupErrorCode | null>(null);

  const load = useCallback(async () => {
    const evals = services.evaluations;
    if (!evals || !trackId) return;
    setLoading(true);
    try { setDetail(await evals.fetch(trackId)); setError(null); }
    catch (e) { setError(groupErrorCode(e)); }
    finally { setLoading(false); }
  }, [services.evaluations, trackId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const errorKey = groupErrorText(error);
  const m = detail?.metrics;
  const hasLaid = (detail?.laid.length ?? 0) > 0;
  const points = detail ? [...detail.laid, ...detail.search] : [];
  // Start der gelegten Linie; ohne gelegte Linie kein Startpunkt (der Beginn der Absuche ist nicht der Start der Fährte).
  const start = detail?.laid[0];
  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={detail ? `${detail.dogName} · ${detail.handlerName}` : t('groups.evaluations')}
          subtitle={detail ? t('groups.evalLaidBy', { name: detail.layerName }) : undefined} />
        <ScrollView contentContainerStyle={cs.scroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void load(); }} tintColor={C.trackPrimary} />}>
          {errorKey ? <Text style={[cs.body, { color: C.trackDanger }]} accessibilityRole="alert">{t(errorKey)}</Text> : null}
          {!detail && loading ? <Text style={cs.hint}>{t('groups.loading')}</Text> : null}
          {detail ? (
            <>
              {points.length > 0 ? (
                <View style={s.frame}>
                  <MapView style={s.map} initialRegion={region(points)} showsUserLocation={false}
                    accessibilityLabel={t(hasLaid ? 'groups.evalMapLabel' : 'groups.evalMapLabelSearchOnly')}>
                    {splitAtBreaks(detail.laid).map((part, i) => (
                      <Polyline key={`laid-${i}`} coordinates={part.map(p => ({ latitude: p.lat, longitude: p.lng }))}
                        strokeColor={C.trackPrimary} strokeWidth={4} lineDashPattern={[8, 6]} />
                    ))}
                    {splitAtBreaks(detail.search).map((part, i) => (
                      <Polyline key={`search-${i}`} coordinates={part.map(p => ({ latitude: p.lat, longitude: p.lng }))}
                        strokeColor={C.trackWarning} strokeWidth={3} />
                    ))}
                    {start ? <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} title={t('groups.startPoint')} /> : null}
                  </MapView>
                  <Text style={s.legend}>{t(hasLaid ? 'groups.evalLegend' : 'groups.evalLegendSearchOnly')}</Text>
                </View>
              ) : null}
              {!hasLaid ? <Text style={cs.hint}>{t('groups.evalNoLaidLine')}</Text> : null}
              {m ? (
                <AnyvoCard>
                  <View style={s.stats}>
                    <Stat value={`${Math.round(m.distanceM)} m`} label={t('groups.evalLength')} />
                    <Stat value={formatEvalDuration(m.durationS)} label={t('groups.evalDuration')} />
                    <Stat value={m.articlesTotal > 0 ? `${m.articlesFound} / ${m.articlesTotal}` : '–'} label={t('groups.evalArticlesLabel')} />
                  </View>
                  <View style={[s.stats, { marginTop: 10 }]}>
                    <Stat value={m.deviationAvgM === null ? '–' : `${m.deviationAvgM} m`} label={t('groups.evalDeviation')} />
                    <Stat value={String(m.breaks)} label={t('groups.evalBreaks')} />
                    <View style={{ flex: 1 }} />
                  </View>
                </AnyvoCard>
              ) : null}
              <Text style={cs.hint}>{t('groups.evalViewerHint')}</Text>
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  frame: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackSurface },
  map: { height: 300 },
  legend: { color: C.trackTextSec, fontSize: 12, padding: 10, lineHeight: 17 },
  stats: { flexDirection: 'row' },
  statValue: { color: C.trackText, fontSize: 17, fontWeight: '800' },
  statLabel: { color: C.trackTextSec, fontSize: 12 },
});
