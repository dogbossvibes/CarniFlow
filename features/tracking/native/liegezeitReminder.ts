// Liegezeit-Erinnerung (Fährten-Einstellungen je Hund): eine einmalige lokale
// Benachrichtigung «Liegezeit erreicht», wenn die Fährte die eingestellte Zeit
// gelegen hat. Ergänzt die bestehende Liegezeit-Anzeige, ersetzt sie nicht.
//
// Best-effort: fehlende Berechtigung oder ein Fehler ändern nichts an Liegezeit,
// Fährte oder Absuche. Es wird keine Berechtigung angefragt. Pro Hund höchstens
// eine geplante Erinnerung; sie wird beim Start der Absuche oder beim Abbruch entfernt.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const keyFor = (dogId: string) => `anyvo.layReminder.v1::${dogId}`;
interface Stored { id: string; sessionId: string | null; fireAt: number }

export interface LayReminderInput {
  dogId: string; sessionId: string | null; startedAt: number; minutes: number;
  title: string; body: string;
}

/** Zeitpunkt der Erinnerung; null, wenn er schon vorbei ist (keine nachträgliche Meldung). */
export function layReminderFireAt(startedAt: number, minutes: number, now: number = Date.now()): number | null {
  if (!Number.isFinite(startedAt) || !Number.isFinite(minutes) || minutes <= 0) return null;
  const fireAt = startedAt + minutes * 60_000;
  return fireAt > now + 5_000 ? fireAt : null;
}

async function readStored(dogId: string): Promise<Stored | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(dogId));
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.id === 'string' && Number.isFinite(v.fireAt) ? v as Stored : null;
  } catch { return null; }
}

/** Plant die Erinnerung (idempotent für dieselbe Fährte und Zeit). */
export async function scheduleLayReminder(input: LayReminderInput): Promise<void> {
  try {
    const fireAt = layReminderFireAt(input.startedAt, input.minutes);
    const stored = await readStored(input.dogId);
    if (stored && stored.sessionId === input.sessionId && stored.fireAt === fireAt) return;
    if (stored) await cancelLayReminder(input.dogId);
    if (fireAt == null) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!(permission.granted || permission.status === 'granted')) return;
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: input.title, body: input.body, sound: true },
      trigger: { type: 'date', date: new Date(fireAt) } as unknown as Notifications.NotificationTriggerInput,
    });
    await AsyncStorage.setItem(keyFor(input.dogId), JSON.stringify({ id, sessionId: input.sessionId, fireAt } satisfies Stored));
  } catch { /* best-effort */ }
}

/** Entfernt die geplante Erinnerung dieses Hundes. Wirft nie. */
export async function cancelLayReminder(dogId: string | null | undefined): Promise<void> {
  if (!dogId) return;
  try {
    const stored = await readStored(dogId);
    if (stored) await Notifications.cancelScheduledNotificationAsync(stored.id).catch(() => {});
    await AsyncStorage.removeItem(keyFor(dogId));
  } catch { /* best-effort */ }
}
