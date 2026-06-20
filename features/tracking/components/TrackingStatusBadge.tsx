import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Anzeige-Status der Aufnahme. Superset des Engine-Status (TrackPointStatus),
// damit bestehende Aufrufer ('moving' | 'slow_moving' | 'stationary' | 'drift'
// | 'sharp_turn') weiterhin direkt durchgereicht werden können.
export type TrackingDisplayStatus =
  | 'gps_warmup'     // GPS wird stabilisiert
  | 'ready'          // Bereit
  | 'recording'      // Aufnahme aktiv
  | 'moving'         // Aufnahme aktiv (Engine-Status)
  | 'slow_moving'    // Langsame Bewegung
  | 'stationary'     // Stillstand erkannt
  | 'drift'          // Drift erkannt
  | 'gps_poor'       // GPS ungenau
  | 'sharp_turn'     // Winkel erkannt
  | 'object_placed'; // Gegenstand gesetzt

interface StatusMeta { label: string; color: string; icon: IconName }

const META: Record<TrackingDisplayStatus, StatusMeta> = {
  gps_warmup:    { label: 'GPS wird stabilisiert', color: C.trackBlue,    icon: 'locate' },
  ready:         { label: 'Bereit',                color: C.trackPrimary, icon: 'checkmark-circle' },
  recording:     { label: 'Aufnahme aktiv',        color: C.trackPrimary, icon: 'walk' },
  moving:        { label: 'Aufnahme aktiv',        color: C.trackPrimary, icon: 'walk' },
  slow_moving:   { label: 'Langsame Bewegung',     color: C.trackBlue,    icon: 'footsteps' },
  stationary:    { label: 'Stillstand erkannt',    color: C.trackTextSec, icon: 'pause-circle' },
  drift:         { label: 'Drift erkannt',         color: C.trackDanger,  icon: 'warning' },
  gps_poor:      { label: 'GPS ungenau',           color: C.trackWarning, icon: 'alert-circle' },
  sharp_turn:    { label: 'Winkel erkannt',        color: C.trackPurple,  icon: 'git-branch' },
  object_placed: { label: 'Gegenstand gesetzt',    color: C.trackPurple,  icon: 'cube' },
};

// Pure: Label/Farbe/Icon zu einem Status (für Tests/Wiederverwendung).
export function getTrackingStatusMeta(status: TrackingDisplayStatus): StatusMeta {
  return META[status];
}

// Status-Badge für den Fährten-Screen: prominent (Icon + Label, Akzentrahmen),
// aber dezent (kompakte Pill auf dunklem Anthrazit, einzeilig). Parent platziert.
export function TrackingStatusBadge({ status }: { status: TrackingDisplayStatus | null }) {
  if (!status) return null;
  const { label, color, icon } = META[status];
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
    backgroundColor: 'rgba(13,13,13,0.92)',
    // dezenter Schimmer (prominent, aber nicht störend)
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  label: { fontSize: 12.5, fontWeight: '800', color: C.trackText, letterSpacing: 0.2 },
});
