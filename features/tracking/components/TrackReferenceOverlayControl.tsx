import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FT } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { hapticTap } from '@/features/tracking/utils/haptics';
import { referenceOverlayCount, type TrackReferenceOverlay, type TrackReferenceStatus } from '@/features/tracking/store/trackReferenceOverlays';

const STATUS_KEY: Record<TrackReferenceStatus, TranslationKey> = {
  resting:   'track.statusResting',
  laid:      'track.statusLaid',
  searching: 'track.statusSearching',
};

/**
 * Kontextuelle Kartensteuerung „Andere Fährten · n" auf dem Lege-Screen. Rein
 * darstellend: schaltet nur die Sichtbarkeit der Referenz-Ebene (Zustand beim
 * Aufrufer, Default AN). Berührt weder Aufnahme noch Registry noch Sessions.
 * Ohne Referenz-Fährte wird nichts gerendert.
 */
export function TrackReferenceOverlayControl({ overlays, visible, onVisibleChange, style }: {
  overlays:        readonly TrackReferenceOverlay[];
  visible:         boolean;
  onVisibleChange: (next: boolean) => void;
  style?:          StyleProp<ViewStyle>;
}) {
  const { t } = useT();
  const [sheet, setSheet] = useState(false);
  const count = referenceOverlayCount(overlays);
  if (count === 0) return null;
  const chipLabel = t('track.otherTracks.chip', { count });

  return (
    <>
      <Pressable
        testID="reference-overlay-chip"
        accessibilityRole="button"
        accessibilityLabel={chipLabel}
        accessibilityHint={t('track.otherTracks.hint')}
        onPress={() => { hapticTap(); setSheet(true); }}
        style={[s.chip, style]}
        hitSlop={6}
      >
        <Ionicons name={visible ? 'layers-outline' : 'eye-off-outline'} size={15} color={visible ? FT.text : FT.muted} />
        <Text style={[s.chipTxt, !visible && s.chipTxtOff]} numberOfLines={1}>{chipLabel}</Text>
      </Pressable>

      <AnyvoBottomSheet visible={sheet} onClose={() => setSheet(false)} title={t('track.otherTracks.title')} closeButton>
        <View style={s.list}>
          {overlays.map(o => (
            <View key={`${o.dogId}-${o.sessionId}`} style={s.row}>
              <Ionicons name={visible ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={visible ? FT.warn : FT.faint} />
              <View style={s.rowTxt}>
                <Text style={s.rowName} numberOfLines={1}>{o.dogName || '?'}</Text>
                <Text style={s.rowSub} numberOfLines={1}>{t(STATUS_KEY[o.status])}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={s.toggleRow}>
          <Text style={s.toggleTxt}>{t('track.otherTracks.show')}</Text>
          <Switch
            testID="reference-overlay-switch"
            accessibilityLabel={t('track.otherTracks.show')}
            value={visible}
            onValueChange={next => { hapticTap(); onVisibleChange(next); }}
            trackColor={{ false: FT.lineStrong, true: FT.acc }}
          />
        </View>
        <Text style={s.hint}>{t('track.otherTracks.hint')}</Text>
      </AnyvoBottomSheet>
    </>
  );
}

const s = StyleSheet.create({
  chip:       { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: FT.glass, borderWidth: 1, borderColor: FT.glassLine },
  chipTxt:    { fontSize: 11.5, fontWeight: '800', color: FT.text },
  chipTxtOff: { color: FT.muted },
  list:       { gap: 10, marginTop: 4 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTxt:     { flex: 1 },
  rowName:    { fontSize: 15, fontWeight: '800', color: FT.text },
  rowSub:     { fontSize: 12, fontWeight: '600', color: FT.muted, marginTop: 1 },
  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: FT.line },
  toggleTxt:  { fontSize: 15, fontWeight: '700', color: FT.text, flex: 1 },
  hint:       { fontSize: 12, color: FT.faint, marginTop: 10, marginBottom: 6 },
});
