import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { getGpsQuality, QUALITY_LABEL } from '@/features/tracking/engine/gpsQuality';
import type { TrackPointQuality } from '@/features/tracking/engine/types';

// Anyvo-Look: Mint/Akzent für gute Qualität, dezente Warnfarben für poor/bad.
const COLOR: Record<TrackPointQuality, string> = {
  excellent: C.trackPrimary,    // Mint
  good:      C.trackPrimaryDk,  // dunkleres Mint
  poor:      C.trackWarning,    // Bernstein (dezent)
  bad:       C.trackDanger,     // Rot (dezent)
};

// Kleine Statusmeldung je Qualitätsstufe.
const SHORT_MESSAGE: Record<TrackPointQuality, string> = {
  excellent: 'Bereit für Fährte',
  good:      'GPS stabilisiert',
  poor:      'Aufnahme möglich, aber ungenau',
  bad:       'Freieren Himmel suchen',
};

const meters = (accuracy: number | null) =>
  accuracy != null ? ` · ${Math.round(accuracy)}m` : '';

// GPS-Genauigkeitsbadge im Anyvo-Look: Genauigkeitsklasse + Meter und (per
// Default) eine kleine Statusmeldung. `showMessage={false}` für kompakte Pills.
export function GpsQualityBadge({
  accuracy, showMeters = true, showMessage = true,
}: {
  accuracy: number | null;
  showMeters?: boolean;
  showMessage?: boolean;
}) {
  const q = getGpsQuality(accuracy);
  const color = COLOR[q];
  const label = `${QUALITY_LABEL[q]}${showMeters ? meters(accuracy) : ''}`;

  // Kompakte Pill (Bestands-Look) ohne Statusmeldung.
  if (!showMessage) {
    return (
      <View style={[s.pill, { borderColor: color }]}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.label}>{label}</Text>
      </View>
    );
  }

  // Anthrazit-Karte mit Akzent-Punkt, Label und kleiner Statusmeldung.
  return (
    <View style={[s.card, { borderColor: color }]}>
      <View style={s.row}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={[s.label, { color }]}>{label}</Text>
      </View>
      <Text style={s.message}>{SHORT_MESSAGE[q]}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  // Kompakte Pill (Bestands-Look beibehalten).
  pill:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  // Karte: dunkler Anthrazit-Hintergrund, dezenter Akzentrahmen.
  card:    { alignSelf: 'flex-start', backgroundColor: C.trackCard, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 3 },
  row:     { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot:     { width: 8, height: 8, borderRadius: 4 },
  label:   { fontSize: 13, fontWeight: '800', color: C.trackText, letterSpacing: 0.2 },
  message: { fontSize: 11.5, fontWeight: '600', color: C.trackTextSec, marginLeft: 15 },
});
