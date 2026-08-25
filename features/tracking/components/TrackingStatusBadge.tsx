import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
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

interface StatusMeta { labelKey: string; color: string; icon: IconName }

const META: Record<TrackingDisplayStatus, StatusMeta> = {
  gps_warmup:    { labelKey: 'track.status.gpsWarmup',    color: C.trackBlue,    icon: 'locate' },
  ready:         { labelKey: 'track.status.ready',        color: C.trackPrimary, icon: 'checkmark-circle' },
  recording:     { labelKey: 'track.status.recording',    color: C.trackPrimary, icon: 'walk' },
  moving:        { labelKey: 'track.status.recording',    color: C.trackPrimary, icon: 'walk' },
  slow_moving:   { labelKey: 'track.status.slowMoving',   color: C.trackBlue,    icon: 'footsteps' },
  stationary:    { labelKey: 'track.status.stationary',   color: C.trackTextSec, icon: 'pause-circle' },
  drift:         { labelKey: 'track.status.drift',        color: C.trackDanger,  icon: 'warning' },
  gps_poor:      { labelKey: 'track.status.gpsPoor',      color: C.trackWarning, icon: 'alert-circle' },
  sharp_turn:    { labelKey: 'track.status.sharpTurn',    color: C.trackPurple,  icon: 'git-branch' },
  object_placed: { labelKey: 'track.status.objectPlaced', color: C.trackPurple,  icon: 'cube' },
};

// Pure: Label/Farbe/Icon zu einem Status (für Tests/Wiederverwendung).
export function getTrackingStatusMeta(status: TrackingDisplayStatus): StatusMeta {
  return META[status];
}

// Status-Badge für den Fährten-Screen: prominent (Icon + Label, Akzentrahmen),
// aber dezent (kompakte Pill auf dunklem Anthrazit, einzeilig). Parent platziert.
export function TrackingStatusBadge({ status }: { status: TrackingDisplayStatus | null }) {
  const { t } = useTranslation();
  if (!status) return null;
  const { labelKey, color, icon } = META[status];
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={s.label}>{t(labelKey as any)}</Text>
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
