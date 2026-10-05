import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import {
  TRACK_OVERLAY_COLOR_KEYS, autoTrackOverlayColorKey, trackOverlayColor, type TrackOverlayColorKey,
} from '@/features/tracking/utils/trackOverlayColors';

const COLOR_NAME_KEY: Record<TrackOverlayColorKey, TranslationKey> = {
  orange: 'dog.trackColor.orange',
  violet: 'dog.trackColor.violet',
  pink:   'dog.trackColor.pink',
  yellow: 'dog.trackColor.yellow',
  blue:   'dog.trackColor.blue',
  cyan:   'dog.trackColor.cyan',
  lime:   'dog.trackColor.lime',
};

/**
 * „Fährtenfarbe" im Hundeprofil: Automatisch (null) + kuratierte Palette.
 * Reine Eingabe (Wert beim Aufrufer, gespeichert mit dem bestehenden Profil-Save).
 * Statische Styles (keine Style-Funktion), Touch-Ziele ≥ 44 pt, Auswahl per Haken +
 * Rahmen (nicht nur Farbe) und für Screenreader als Radio mit Zustand „ausgewählt".
 */
export function TrackColorPicker({ dogId, value, onChange, disabled }: {
  dogId: string;
  value: TrackOverlayColorKey | null;
  onChange: (next: TrackOverlayColorKey | null) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const suffix = t('dog.trackColor.a11ySuffix');
  const autoKey = autoTrackOverlayColorKey(dogId);
  const autoSelected = value == null;

  return (
    <View style={s.wrap} accessibilityRole="radiogroup" accessibilityLabel={t('dog.trackColor.title')}>
      <Text style={s.hint}>{t('dog.trackColor.hint')}</Text>
      <View style={s.row}>
        <TouchableOpacity
          testID="track-color-auto"
          accessibilityRole="radio"
          accessibilityLabel={`${t('dog.trackColor.auto')}, ${suffix}`}
          accessibilityState={{ selected: autoSelected, checked: autoSelected, disabled: !!disabled }}
          onPress={() => onChange(null)}
          disabled={disabled}
          activeOpacity={0.75}
          style={[s.autoBtn, autoSelected && s.autoBtnOn]}
        >
          {/* Vorschau der automatischen Farbe dieses Hundes */}
          <View style={[s.autoDot, { backgroundColor: trackOverlayColor(autoKey) }]} />
          <Text style={[s.autoTxt, autoSelected && s.autoTxtOn]}>{t('dog.trackColor.auto')}</Text>
          {autoSelected && <Ionicons name="checkmark" size={16} color={C.accent} />}
        </TouchableOpacity>
      </View>
      <View style={s.swatches}>
        {TRACK_OVERLAY_COLOR_KEYS.map(key => {
          const on = value === key;
          const name = t(COLOR_NAME_KEY[key]);
          return (
            <TouchableOpacity
              key={key}
              testID={`track-color-${key}`}
              accessibilityRole="radio"
              accessibilityLabel={`${name}, ${suffix}`}
              accessibilityState={{ selected: on, checked: on, disabled: !!disabled }}
              onPress={() => onChange(key)}
              disabled={disabled}
              activeOpacity={0.75}
              style={[s.swatchHit, on && s.swatchHitOn]}
            >
              <View style={[s.swatch, { backgroundColor: trackOverlayColor(key) }]}>
                {on && <Ionicons name="checkmark" size={20} color="#000000" />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:        { gap: 12 },
  hint:        { fontSize: 13, lineHeight: 18, color: C.muted },
  row:         { flexDirection: 'row' },
  autoBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.card },
  autoBtnOn:   { borderColor: C.accent },
  autoDot:     { width: 14, height: 14, borderRadius: 7 },
  autoTxt:     { fontSize: 14, fontWeight: '700', color: C.muted },
  autoTxtOn:   { color: C.white },
  swatches:    { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // 48-pt-Trefferfläche, Auswahlrahmen zusätzlich zum Haken.
  swatchHit:   { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatchHitOn: { borderColor: C.white },
  swatch:      { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
