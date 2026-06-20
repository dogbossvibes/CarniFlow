import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { QUALITY_LABEL } from '@/features/tracking/engine/gpsQuality';
import { GpsQualityBadge } from '@/features/tracking/components/GpsQualityBadge';
import type { WarmupState } from '@/features/tracking/hooks/useGpsWarmup';

const TITLE: Record<WarmupState['phase'], string> = {
  stabilizing: 'GPS wird stabilisiert',
  ready:       'Bereit',
  imprecise:   'GPS ungenau',
  denied:      'Standort nicht erlaubt',
  error:       'GPS-Fehler',
};

// Vollflächiges Warmup-Overlay vor der Fährtenaufnahme. Zeigt den GPS-Status und
// gibt den Start frei (automatisch bei guter Genauigkeit, manuell nach 15 s).
export function WarmupOverlay({
  state, onStart, onCancel,
}: {
  state: WarmupState;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { phase, accuracy, quality, canStart, warning, engineLabel } = state;
  const blocked = phase === 'denied' || phase === 'error';

  return (
    <View style={s.root}>
      <TouchableOpacity style={s.close} onPress={onCancel} hitSlop={8} activeOpacity={0.8}>
        <Ionicons name="close" size={20} color={C.trackText} />
      </TouchableOpacity>

      <View style={s.center}>
        {!blocked && phase !== 'ready' && <ActivityIndicator size="large" color={C.trackPrimary} />}
        {phase === 'ready' && <Ionicons name="checkmark-circle" size={56} color={C.trackPrimary} />}
        {blocked && <Ionicons name="warning" size={52} color={C.trackWarning} />}

        <Text style={s.title}>{TITLE[phase]}</Text>

        {!blocked && (
          <>
            <GpsQualityBadge accuracy={accuracy} showMessage={false} />
            <Text style={s.sub}>
              {quality ? QUALITY_LABEL[quality] : 'Suche Satelliten…'}
              {accuracy != null ? `  ·  ±${accuracy.toFixed(0)} m` : ''}
            </Text>
          </>
        )}

        {warning && <Text style={[s.note, blocked && { color: C.trackWarning }]}>{warning}</Text>}
        {!blocked && <Text style={s.engine}>Engine: {engineLabel}</Text>}
      </View>

      <View style={s.actions}>
        {canStart && !blocked && (
          <TouchableOpacity style={s.startBtn} onPress={onStart} activeOpacity={0.85}>
            <Ionicons name="play" size={18} color={C.accentText} />
            <Text style={s.startTxt}>{phase === 'imprecise' ? 'Trotzdem starten' : 'Aufnahme starten'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.85}>
          <Text style={s.cancelTxt}>Abbrechen</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:      { ...StyleSheet.absoluteFillObject, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center', padding: 28, zIndex: 20 },
  close:     { position: 'absolute', top: 16, right: 16, width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  center:    { alignItems: 'center', gap: 12 },
  title:     { fontSize: 22, color: C.trackText, fontWeight: '800', marginTop: 4 },
  sub:       { fontSize: 14, color: C.trackTextSec, fontWeight: '600' },
  note:      { fontSize: 13.5, color: C.trackTextSec, textAlign: 'center', lineHeight: 19, marginTop: 6, maxWidth: 300 },
  engine:    { fontSize: 11, color: C.trackTextMut, marginTop: 4 },
  actions:   { position: 'absolute', left: 24, right: 24, bottom: 40, gap: 12 },
  startBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: 16, backgroundColor: C.trackPrimary },
  startTxt:  { fontSize: 16, fontWeight: '800', color: C.accentText },
  cancelBtn: { alignItems: 'center', justifyContent: 'center', height: 48 },
  cancelTxt: { fontSize: 15, fontWeight: '700', color: C.trackTextSec },
});
