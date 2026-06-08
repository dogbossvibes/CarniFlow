import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eventMeta, type CalendarEvent } from '@/types/calendar';

// Lokale Reminder vor einem Termin (15 min / 1 h / 24 h …). Die geplanten
// Notification-IDs werden pro Event gemerkt, damit sie beim Löschen/Ändern
// wieder storniert werden können. expo-notifications ist nativ vorhanden →
// Scheduling läuft im aktuellen Build (im Simulator eingeschränkt).
const KEY = (id: string) => `reminders_${id}`;

function label(min: number): string {
  if (min % 1440 === 0) return `in ${min / 1440} Tag${min / 1440 > 1 ? 'en' : ''}`;
  if (min % 60 === 0)   return `in ${min / 60} Stunde${min / 60 > 1 ? 'n' : ''}`;
  return `in ${min} Minuten`;
}

export async function scheduleEventReminders(ev: CalendarEvent) {
  await cancelEventReminders(ev.id);
  if (!ev.reminder_minutes?.length) return;

  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      if (req.status !== 'granted') return;
    }
  } catch { return; }

  const start = new Date(ev.start_at).getTime();
  const meta  = eventMeta(ev.type);
  const ids: string[] = [];

  for (const min of ev.reminder_minutes) {
    const when = start - min * 60 * 1000;
    if (when <= Date.now() + 5000) continue;   // Vergangenheit überspringen
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: `${meta.emoji} ${ev.title}`, body: `${meta.label} ${label(min)}`, sound: true },
        trigger: { type: 'date', date: new Date(when) } as unknown as Notifications.NotificationTriggerInput,
      });
      ids.push(id);
    } catch { /* einzelner Reminder fehlgeschlagen → weiter */ }
  }
  if (ids.length) await AsyncStorage.setItem(KEY(ev.id), JSON.stringify(ids)).catch(() => {});
}

export async function cancelEventReminders(eventId: string) {
  try {
    const raw = await AsyncStorage.getItem(KEY(eventId));
    if (!raw) return;
    for (const nid of JSON.parse(raw) as string[]) {
      await Notifications.cancelScheduledNotificationAsync(nid).catch(() => {});
    }
    await AsyncStorage.removeItem(KEY(eventId));
  } catch { /* egal */ }
}
