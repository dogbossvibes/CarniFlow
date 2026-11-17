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

async function ensureAndroidChannel() {
  await Notifications.setNotificationChannelAsync('default', {
    // eslint-disable-next-line import/namespace -- vorbestehend seit main d505250f; Logik bewusst unverändert
    name: 'Standard', importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// Registriert den Expo-Push-Token am Profil. Best-effort (Simulator/abgelehnte
// Berechtigung → still ok). Remote-Push braucht einen Dev-/Production-Build
// (in Expo Go auf iOS nicht zuverlässig).
// `prompt: false` fragt die Berechtigung NICHT an, sondern registriert nur, wenn
// sie bereits erteilt ist (z. B. nach „Nicht jetzt" in der Einführung).
export async function registerForPush(userId: string, opts?: { prompt?: boolean }) {
  try {
    if (!Device.isDevice) return;
    // Android 13+: Ohne bestehenden Benachrichtigungskanal erscheint die Systemabfrage
    // nicht. Deshalb den Kanal VOR der Berechtigungsanfrage anlegen (idempotent).
    if (Platform.OS === 'android') await ensureAndroidChannel();
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted' && opts?.prompt !== false) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

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

// Entfernt den Push-Token am Profil, sobald der Nutzer Benachrichtigungen
// deaktiviert — so stellt der Server keine Pushes mehr an dieses Gerät zu.
export async function unregisterFromPush(userId: string) {
  try {
    await supabase.from('profiles').update({ push_token: null }).eq('id', userId);
  } catch {
    // Best-effort — beim nächsten Aktivieren wird ohnehin neu registriert.
  }
}

// Stösst die serverseitige Push-Zustellung an (Edge Function mit service_role,
// die Empfänger + Token ermittelt). Best-effort.
export async function notifyNewComment(unitId: string) {
  try {
    await supabase.functions.invoke('notify-comment', { body: { unitId } });
  } catch {
    /* Kommentar ist trotzdem gespeichert; Push ist nur Beiwerk. */
  }
}
