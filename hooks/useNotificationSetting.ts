import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPush, unregisterFromPush } from '@/lib/push';

const STORAGE_KEY = 'notifications_enabled';

// Verwaltet die Benachrichtigungs-Einstellung im Profil: persistierte Nutzer-
// Präferenz UND der tatsächliche OS-Berechtigungsstatus müssen zusammenpassen.
// "Effektiv an" ist nur, wenn der Nutzer es will UND iOS/Android es erlaubt.
export function useNotificationSetting(userId: string | undefined) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [loaded, setLoaded]   = useState(false);

  // Beim Mount: gespeicherte Präferenz mit echtem Berechtigungsstatus abgleichen.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [stored, perm] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          Notifications.getPermissionsAsync(),
        ]);
        if (!active) return;
        const wanted  = stored === 'true';
        const granted = perm.status === 'granted';
        setEnabled(wanted && granted);
      } catch {
        if (active) setEnabled(false);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, []);

  const setPersisted = useCallback(async (value: boolean) => {
    setEnabled(value);
    try { await AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false'); } catch { /* egal */ }
  }, []);

  const toggle = useCallback(async (value: boolean): Promise<{ blocked?: boolean }> => {
    if (busy) return {};
    setBusy(true);
    try {
      if (!value) {
        // Deaktivieren: Präferenz merken + Token serverseitig entfernen.
        await setPersisted(false);
        if (userId) await unregisterFromPush(userId);
        return {};
      }

      // Aktivieren: Berechtigung sicherstellen (ggf. erst anfragen).
      const existing = await Notifications.getPermissionsAsync();
      let status = existing.status;
      if (status !== 'granted' && existing.canAskAgain) {
        status = (await Notifications.requestPermissionsAsync()).status;
      }

      if (status !== 'granted') {
        // OS blockiert — Nutzer muss es in den Systemeinstellungen erlauben.
        await setPersisted(false);
        return { blocked: true };
      }

      await setPersisted(true);
      if (userId) await registerForPush(userId);
      return {};
    } finally {
      setBusy(false);
    }
  }, [busy, userId, setPersisted]);

  const openSystemSettings = useCallback(() => { Linking.openSettings(); }, []);

  return { enabled, busy, loaded, toggle, openSystemSettings };
}
