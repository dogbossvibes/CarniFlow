import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

// Welche Spur auf der Karte gezeigt wird.
//  - clean: nur die gefilterte Hauptlinie (filteredTrackPoints) → Default.
//  - raw:   nur die ungefilterte Rohspur (rawTrackPoints) → Debug.
//  - both:  beide übereinander → Debug.
export type TrackLayer = 'clean' | 'raw' | 'both';

// Pure: welche Layer die Karte für die Auswahl zeichnen soll.
export function trackLayerVisibility(layer: TrackLayer): { showClean: boolean; showRaw: boolean } {
  return {
    showClean: layer === 'clean' || layer === 'both',
    showRaw:   layer === 'raw' || layer === 'both',
  };
}

const OPTIONS: { key: TrackLayer; label: string; a11y: string }[] = [
  { key: 'clean', label: 'Clean', a11y: 'Clean Track' },
  { key: 'raw',   label: 'Raw',   a11y: 'Raw Track' },
  { key: 'both',  label: 'Beide', a11y: 'Beide' },
];

// Layer-Umschalter auf der Aufnahme-Karte.
//  - Normale Nutzer: kein Umschalter (immer Clean) — nur der optionale Debug-Knopf.
//  - Debug-Mode: drei Segmente Clean / Raw / Beide.
export function TrackLayerToggle({
  value, onChange, debug = false, onToggleDebug,
}: {
  value: TrackLayer;
  onChange: (layer: TrackLayer) => void;
  debug?: boolean;
  onToggleDebug?: () => void;
}) {
  return (
    <View style={s.wrap}>
      {debug && (
        <View style={s.segments}>
          {OPTIONS.map(o => {
            const active = value === o.key;
            return (
              <TouchableOpacity
                key={o.key}
                style={[s.seg, active && s.segOn]}
                onPress={() => onChange(o.key)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={o.a11y}
              >
                <Text style={[s.segTxt, active && s.segTxtOn]}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {onToggleDebug && (
        <TouchableOpacity
          style={[s.bug, debug && s.bugOn]}
          onPress={onToggleDebug}
          hitSlop={8}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Debug-Modus umschalten"
        >
          <Ionicons name="bug-outline" size={18} color={debug ? '#04201b' : C.trackTextSec} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:     { position: 'absolute', bottom: 84, right: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  segments: { flexDirection: 'row', backgroundColor: 'rgba(13,13,13,0.92)', borderRadius: 999, borderWidth: 1, borderColor: C.trackBorder, padding: 3, gap: 2 },
  seg:      { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999 },
  segOn:    { backgroundColor: C.trackPrimary },
  segTxt:   { fontSize: 11.5, fontWeight: '700', color: C.trackTextSec },
  segTxtOn: { color: '#04201b' },
  bug:      { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,22,25,0.7)', borderWidth: 1, borderColor: C.trackBorder },
  bugOn:    { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
});
