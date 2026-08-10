import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import type { MarkerType, MarkerMaterial, AngleKind } from '@/features/tracking/store/trackingStore';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface MarkerChoice { type: MarkerType; material?: MarkerMaterial; angleKind?: AngleKind }

const MATERIALS: { material: MarkerMaterial; icon: IconName; labelKey: TranslationKey }[] = [
  { material: 'holz',     icon: 'leaf-outline',        labelKey: 'track.materialWood' },
  { material: 'duebel',   icon: 'git-commit-outline',  labelKey: 'track.materialDowel' },
  { material: 'stoff',    icon: 'shirt-outline',       labelKey: 'track.materialFabric' },
  { material: 'leder',    icon: 'bag-outline',         labelKey: 'track.materialLeather' },
  { material: 'plastik',  icon: 'cube-outline',        labelKey: 'track.materialPlastic' },
  { material: 'metall',   icon: 'magnet-outline',      labelKey: 'track.materialMetal' },
  { material: 'teppich',  icon: 'grid-outline',        labelKey: 'track.materialCarpet' },
  { material: 'diverses', icon: 'ellipsis-horizontal', labelKey: 'track.materialOther' },
];

const ANGLES: { kind: AngleKind; icon: IconName; labelKey: TranslationKey }[] = [
  { kind: 'links',        icon: 'arrow-back',         labelKey: 'track.angleLeft' },
  { kind: 'rechts',       icon: 'arrow-forward',      labelKey: 'track.angleRight' },
  { kind: 'spitz_links',  icon: 'return-up-back',     labelKey: 'track.angleAcuteLeft' },
  { kind: 'spitz_rechts', icon: 'return-up-forward',  labelKey: 'track.angleAcuteRight' },
  { kind: 'absatz',       icon: 'swap-horizontal',    labelKey: 'track.angleStep' },
  { kind: 'abriss',       icon: 'cut',                labelKey: 'track.angleBreak' },
];

const OTHERS: { type: MarkerType; icon: IconName; titleKey: TranslationKey; subKey: TranslationKey; color: string }[] = [
  { type: 'verleitung',   icon: 'warning', titleKey: 'track.segmentDistraction', subKey: 'track.distractionSub', color: C.trackPurple },
  { type: 'sprachmarker', icon: 'mic',     titleKey: 'track.voiceMarker',        subKey: 'track.voiceMarkerSub', color: C.trackBlue },
];

export function MarkerBottomSheet({
  visible, onClose, onSelect, suggestedAngle,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (choice: MarkerChoice) => void;
  suggestedAngle?: AngleKind | null;
}) {
  const { t } = useT();
  const pick = (choice: MarkerChoice) => { onClose(); onSelect(choice); };
  const suggestedAngleLabel = suggestedAngle
    ? t(ANGLES.find(a => a.kind === suggestedAngle)?.labelKey ?? 'track.angle')
    : null;
  return (
    <AnyvoBottomSheet visible={visible} onClose={onClose} title={t('track.setMarker')}>
      <View style={{ paddingBottom: 8 }}>
        <Text style={s.label}>{t('track.object')}</Text>
        <View style={s.grid}>
          {MATERIALS.map(m => (
            <TouchableOpacity key={m.material} style={s.cell} activeOpacity={0.85}
              onPress={() => pick({ type: 'gegenstand', material: m.material })}>
              <View style={s.cellIcon}><Ionicons name={m.icon} size={20} color={C.trackPrimary} /></View>
              <Text style={s.cellLabel}>{t(m.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.label, { marginTop: 16 }]}>
          {t('track.angle')}{suggestedAngleLabel ? <Text style={s.hint}>  · {t('track.suggestion', { label: suggestedAngleLabel })}</Text> : null}
        </Text>
        <View style={s.grid}>
          {ANGLES.map(a => {
            const on = suggestedAngle === a.kind;
            return (
              <TouchableOpacity key={a.kind} style={[s.cell, on && s.cellOn]} activeOpacity={0.85}
                onPress={() => pick({ type: 'winkel', angleKind: a.kind })}>
                <View style={[s.cellIcon, on && s.cellIconOn]}><Ionicons name={a.icon} size={20} color={on ? '#04201b' : C.trackWarning} /></View>
                <Text style={[s.cellLabel, on && { color: C.trackPrimary }]}>{t(a.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[s.label, { marginTop: 16 }]}>{t('track.other')}</Text>
        <View style={{ gap: 10 }}>
          {OTHERS.map(o => (
            <TouchableOpacity key={o.type} style={s.row} onPress={() => pick({ type: o.type })} activeOpacity={0.85}>
              <View style={[s.icon, { backgroundColor: `${o.color}1F` }]}><Ionicons name={o.icon} size={20} color={o.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{t(o.titleKey)}</Text>
                <Text style={s.sub}>{t(o.subKey)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </AnyvoBottomSheet>
  );
}

const s = StyleSheet.create({
  label:   { fontSize: 10, color: C.trackTextMut, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  hint:    { fontSize: 10, color: C.trackPrimary, fontWeight: '700', letterSpacing: 0 },
  grid:    { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell:    { width: '30.5%', flexGrow: 1, alignItems: 'center', gap: 7, paddingVertical: 14, borderRadius: 16, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder },
  cellOn:  { borderColor: C.trackPrimary, backgroundColor: C.trackPrimaryDk + '22' },
  cellIcon:{ width: 42, height: 42, borderRadius: 13, backgroundColor: C.trackPrimaryDk + '24', alignItems: 'center', justifyContent: 'center' },
  cellIconOn:{ backgroundColor: C.trackPrimary },
  cellLabel:{ fontSize: 12.5, color: C.trackText, fontWeight: '700' },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, padding: 14 },
  icon:    { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title:   { fontSize: 16, color: C.trackText, fontWeight: '800' },
  sub:     { fontSize: 12, color: C.trackTextSec, marginTop: 2 },
});
