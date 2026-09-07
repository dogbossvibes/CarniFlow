import { StyleSheet, Text, View } from 'react-native';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { AnalyticsSegment, TrackAnalyticsV2 } from '@/features/tracking/engine/trackSegmentAnalysis';

// Bestehende ANYVO-Card/Bottom-Sheet (Punkt 15) — bewusst NUR eine kleine,
// kuratierte Auswahl an Werten je Segmenttyp, nicht alle Rohwerte gleichzeitig.

const CONFIDENCE_LEGEND_KEY = {
  excellent: 'track.replay.legend.confidenceExcellent',
  good: 'track.replay.legend.confidenceGood',
  limited: 'track.replay.legend.confidenceLimited',
  unreliable: 'track.replay.legend.confidenceUnreliable',
} as const;

interface Props {
  segment: AnalyticsSegment | null;
  analytics: TrackAnalyticsV2 | null;
  visible: boolean;
  onClose: () => void;
}

type TFunc = (k: any, p?: any) => string;

function segmentTitle(seg: AnalyticsSegment, analytics: TrackAnalyticsV2 | null, t: TFunc): string {
  // Fortlaufende Nummer NUR innerhalb desselben Segmenttyps (z. B. "Gerade 3"
  // ist die 3. Gerade, nicht der 3. Eintrag insgesamt) — entspricht dem
  // Beispiel aus dem Auftrag.
  if (seg.type === 'start') return t('track.segments.type.start');
  if (seg.type === 'finish') return t('track.segments.type.finish');
  if (seg.type === 'corner') {
    const c = seg.cornerIndex != null ? analytics?.corners[seg.cornerIndex] : null;
    const side = c?.side === 'links' ? t('track.segments.detail.sideLinks') : c?.side === 'rechts' ? t('track.segments.detail.sideRechts') : '';
    const label = t('track.segments.type.corner', { n: String((seg.cornerIndex ?? 0) + 1) });
    return side ? `${label} · ${side}` : label;
  }
  if (seg.type === 'object_zone') return t('track.segments.type.objectZone', { n: String((seg.objectIndex ?? 0) + 1) });
  if (seg.type === 'reacquisition') return t('track.segments.type.reacquisition', { n: String(seg.index + 1) });
  return t('track.segments.type.straight', { n: String(seg.index + 1) });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

export function SegmentDetailSheet({ segment, analytics, visible, onClose }: Props) {
  const { t } = useT();
  if (!segment) return <AnyvoBottomSheet visible={visible} onClose={onClose}><View /></AnyvoBottomSheet>;

  const corner = segment.type === 'corner' && segment.cornerIndex != null ? analytics?.corners[segment.cornerIndex] ?? null : null;
  const object = segment.type === 'object_zone' && segment.objectIndex != null ? analytics?.objects[segment.objectIndex] ?? null : null;

  return (
    <AnyvoBottomSheet visible={visible} onClose={onClose} title={segmentTitle(segment, analytics, t)}>
      <View style={s.body}>
        {segment.lengthM > 0 && <Row label={t('track.segments.detail.length')} value={`${Math.round(segment.lengthM)} m`} />}
        {segment.durationSec != null && <Row label={t('track.segments.detail.duration')} value={`${Math.round(segment.durationSec)} s`} />}

        {segment.type === 'corner' && corner ? (
          <>
            {corner.overshootM != null && <Row label={t('track.segments.detail.overshoot')} value={`${corner.overshootM.toFixed(1)} m`} />}
            {corner.reacquisitionSec != null && <Row label={t('track.segments.detail.reacquisitionTime')} value={`${corner.reacquisitionSec.toFixed(1)} s`} />}
            {corner.maxLateralDeviationM != null && <Row label={t('track.segments.detail.maxDeviation')} value={`${corner.maxLateralDeviationM.toFixed(1)} m`} />}
          </>
        ) : segment.type === 'object_zone' && object ? (
          <>
            {object.minDistanceM != null && <Row label={t('track.segments.detail.maxDeviation')} value={`${object.minDistanceM.toFixed(1)} m`} />}
          </>
        ) : (
          <>
            {segment.meanDeviationM != null && <Row label={t('track.segments.detail.meanDeviation')} value={`${segment.meanDeviationM.toFixed(1)} m`} />}
            {segment.p95DeviationM != null && <Row label={t('track.segments.detail.p95Deviation')} value={`${segment.p95DeviationM.toFixed(1)} m`} />}
            {segment.averageSpeedMps != null && <Row label={t('track.segments.detail.pace')} value={`${segment.averageSpeedMps.toFixed(2)} m/s`} />}
          </>
        )}

        <Row label={t('track.segments.detail.quality')} value={t(CONFIDENCE_LEGEND_KEY[segment.analysisConfidenceBand])} />
      </View>
    </AnyvoBottomSheet>
  );
}

const s = StyleSheet.create({
  body:     { gap: 10, paddingBottom: 10 },
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 13, color: C.trackTextSec, fontWeight: '600' },
  rowValue: { fontSize: 14, color: C.trackText, fontWeight: '800' },
});
