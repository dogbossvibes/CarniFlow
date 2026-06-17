import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useSyncStore } from '@/features/sync/store/syncStore';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Kompakte Premium-Pill mit dem aktuellen Sync-Zustand.
export function SyncStatusPill() {
  const { isOnline, isSyncing, pendingCount, failedCount, conflictCount } = useSyncStore();

  let label = 'Synchronisiert';
  let color: string = C.accent;
  let icon: IconName = 'checkmark-circle';
  if (!isOnline)            { label = 'Offline gespeichert'; color = C.muted;   icon = 'cloud-offline-outline'; }
  else if (isSyncing)       { label = 'Synchronisiere…';     color = C.accent;  icon = 'sync'; }
  else if (conflictCount>0) { label = 'Konflikt prüfen';     color = C.warning; icon = 'alert-circle'; }
  else if (failedCount>0)   { label = 'Sync fehlgeschlagen'; color = C.danger;  icon = 'warning'; }
  else if (pendingCount>0)  { label = 'Sync ausstehend';     color = C.warning; icon = 'time-outline'; }

  return (
    <View style={[s.pill, { borderColor: `${color}55`, backgroundColor: `${color}1A` }]}>
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[s.txt, { color }]}>{label}</Text>
      {pendingCount > 0 && !isSyncing && <Text style={[s.count, { color }]}>{pendingCount}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  pill:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  txt:   { fontSize: 11.5, fontWeight: '700' },
  count: { fontSize: 10.5, fontWeight: '800', opacity: 0.8 },
});
