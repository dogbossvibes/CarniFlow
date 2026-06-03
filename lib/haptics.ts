import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// Haptik ist auf nativen Plattformen verfügbar; auf Web no-op.
export function tapHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

export function successHaptic() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
