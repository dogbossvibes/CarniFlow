import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';

// Eingehende Notifications auch im Vordergrund anzeigen.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
});

// Registriert den Expo-Push-Token am Profil. Best-effort (Simulator/abgelehnte
// Berechtigung → still ok). Remote-Push braucht einen Dev-/Production-Build
// (in Expo Go auf iOS nicht zuverlässig).
export async function registerForPush(userId: string) {
  try {
    if (!Device.isDevice) return;
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Standard', importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  } catch {
    // Push ist optional — Kernfunktionen laufen auch ohne.
  }
}

// Stößt die serverseitige Push-Zustellung an (Edge Function mit service_role,
// die Empfänger + Token ermittelt). Best-effort.
export async function notifyNewComment(unitId: string) {
  try {
    await supabase.functions.invoke('notify-comment', { body: { unitId } });
  } catch {
    /* Kommentar ist trotzdem gespeichert; Push ist nur Beiwerk. */
  }
}
