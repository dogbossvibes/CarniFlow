import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { ANGLE_LABEL } from '@/features/tracking/utils/angleClassify';
import type { AngleKind, MarkerMaterial } from '@/features/tracking/store/trackingStore';
import type { MapMarker } from '@/features/tracking/components/TrackingMap';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Auswahl im Logbuch: ein gespeicherter Feature-Marker ODER das Fährtenende.
export type TrackDetailSelection =
  | { kind: 'start' }
  | { kind: 'marker'; marker: MapMarker }
  | { kind: 'end'; totalDistanceM: number | null };

const MATERIAL_KEY: Partial<Record<MarkerMaterial, TranslationKey>> = {
  holz: 'track.materialWood', duebel: 'track.materialDowel', stoff: 'track.materialFabric',
  leder: 'track.materialLeather', plastik: 'track.materialPlastic', metall: 'track.materialMetal',
  teppich: 'track.materialCarpet', diverses: 'track.materialOther',
};

const ANGLE_KEY: Partial<Record<AngleKind, TranslationKey>> = {
  links: 'track.angleLeft', rechts: 'track.angleRight',
  spitz_links: 'track.angleAcuteLeft', spitz_rechts: 'track.angleAcuteRight',
  absatz: 'track.angleStep', abriss: 'track.angleBreak',
};

// Reine Detail-Ableitung aus einer Auswahl — nur GESPEICHERTE Werte, keine Berechnung.
export function describeSelection(
  sel: TrackDetailSelection,
  t: (k: TranslationKey) => string,
): { icon: IconName; title: string; rows: { label: string; value: string }[] } {
  const distRow = (d: number | null | undefined) =>
    d != null ? [{ label: t('track.detailDistanceFromStart'), value: `${Math.round(d)} m` }] : [];

  if (sel.kind === 'start') {
    return {
      icon: 'flag',
      title: t('track.startFlag'),
      rows: [{ label: t('track.startFlag'), value: t('track.startFlag') }],
    };
  }

  if (sel.kind === 'end') {
    return {
      icon: 'flag',
      title: t('track.detailTrackEnd'),
      rows: [{ label: t('track.detailTotalDistance'), value: sel.totalDistanceM != null ? `${Math.round(sel.totalDistanceM)} m` : '—' }],
    };
  }

  const m = sel.marker;
  if (m.type === 'winkel') {
    const label = (m.angleKind && (ANGLE_KEY[m.angleKind] ? t(ANGLE_KEY[m.angleKind]!) : ANGLE_LABEL[m.angleKind])) || t('track.angle');
    return {
      icon: 'git-branch',
      title: label,
      rows: [...distRow(m.distanceFromStart)],
    };
  }
  if (m.type === 'gegenstand') {
    const isDowel = m.material === 'duebel';
    const materialLabel = m.material && MATERIAL_KEY[m.material] ? t(MATERIAL_KEY[m.material]!) : null;
    return {
      icon: isDowel ? 'ellipse' : 'flag',
      title: isDowel ? t('track.materialDowel') : t('track.object'),
      rows: [
        ...(materialLabel && !isDowel ? [{ label: t('track.detailMaterial'), value: materialLabel }] : []),
        ...distRow(m.distanceFromStart),
        ...(m.note ? [{ label: t('track.detailNote'), value: m.note }] : []),
      ],
    };
  }
  // verleitung / sprachmarker
  return {
    icon: m.type === 'verleitung' ? 'warning' : 'mic',
    title: m.type === 'verleitung' ? t('track.segmentDistraction') : t('track.voiceMarker'),
    rows: [...distRow(m.distanceFromStart)],
  };
}

export function MarkerDetailSheet({
  selection, onClose,
}: {
  selection: TrackDetailSelection | null;
  onClose: () => void;
}) {
  const { t } = useT();
  if (!selection) return null;
  const info = describeSelection(selection, t);
  return (
    <AnyvoBottomSheet visible onClose={onClose} title={info.title}>
      <View style={s.body}>
        <View style={s.iconWrap}><Ionicons name={info.icon} size={22} color={C.trackPrimary} /></View>
        {info.rows.length > 0 ? info.rows.map((r, i) => (
          <View key={i} style={s.row}>
            <Text style={s.rowLabel}>{r.label}</Text>
            <Text style={s.rowValue}>{r.value}</Text>
          </View>
        )) : (
          <Text style={s.rowLabel}>{t('track.detailNoData')}</Text>
        )}
      </View>
    </AnyvoBottomSheet>
  );
}

const s = StyleSheet.create({
  body:     { paddingBottom: 12, gap: 10 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.trackPrimaryDk + '24', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.trackBorder },
  rowLabel: { fontSize: 12, color: C.trackTextSec, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  rowValue: { fontSize: 15, color: C.trackText, fontWeight: '800', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
});
