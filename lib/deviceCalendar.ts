import { Platform } from 'react-native';
import type { CalendarEvent } from '@/types/calendar';

// expo-calendar ist nativ → defensiv laden (Geräte-Kalender-Export braucht
// einen neuen Build; ohne ihn DEVICE_CALENDAR_AVAILABLE = false).
// Ab expo-calendar 56 (SDK 58, Build 60) sind die …Async-Funktionen im
// Hauptimport nur noch Platzhalter, die beim Aufruf werfen. Die bisherige API
// liegt unter `expo-calendar/legacy` (nativ weiterhin als ExpoCalendar im Build).
let Cal: typeof import('expo-calendar/legacy') | null = null;
try { Cal = require('expo-calendar/legacy'); } catch { Cal = null; }
export const DEVICE_CALENDAR_AVAILABLE = Cal != null;

async function writableCalendarId(C: NonNullable<typeof Cal>): Promise<string> {
  if (Platform.OS === 'ios') {
    const def = await C.getDefaultCalendarAsync();
    if (def?.id) return def.id;
  }
  const cals = await C.getCalendarsAsync(C.EntityTypes.EVENT);
  const writable = cals.find(c => c.allowsModifications);
  if (writable) return writable.id;
  return C.createCalendarAsync({
    title: 'ANYVO', entityType: C.EntityTypes.EVENT, name: 'ANYVO',
    accessLevel: C.CalendarAccessLevel.OWNER, ownerAccount: 'ANYVO',
    source: { isLocalAccount: true, name: 'ANYVO', type: 'local' } as never,
  });
}

export async function addEventToDeviceCalendar(ev: CalendarEvent): Promise<{ ok: boolean; error?: string }> {
  if (!Cal) return { ok: false, error: 'Geräte-Kalender benötigt einen neuen App-Build.' };
  try {
    const { status } = await Cal.requestCalendarPermissionsAsync();
    if (status !== 'granted') return { ok: false, error: 'Kalender-Berechtigung fehlt.' };

    const calId = await writableCalendarId(Cal);
    const start = new Date(ev.start_at);
    const end   = ev.end_at ? new Date(ev.end_at) : new Date(start.getTime() + 60 * 60 * 1000);

    await Cal.createEventAsync(calId, {
      title:     ev.title,
      startDate: start,
      endDate:   end,
      location:  ev.location ?? undefined,
      notes:     ev.notes ?? undefined,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Konnte nicht hinzugefügt werden.' };
  }
}
