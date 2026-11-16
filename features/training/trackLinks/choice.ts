import AsyncStorage from '@react-native-async-storage/async-storage';

// Noch nicht gespeicherte Auswahl im Formular «Training erfassen» (#114).
// Übersteht App-Schliessen und Hundewechsel; wird nach dem Übernehmen geleert.
const keyFor = (ownerId: string, unitId: string) => `training_track_choice_v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(unitId)}`;

export async function loadTrackChoice(ownerId: string, unitId: string): Promise<string[] | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(ownerId, unitId));
    const value: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(value) && value.every(v => typeof v === 'string') ? value : null;
  } catch { return null; }
}
export async function saveTrackChoice(ownerId: string, unitId: string, sessionIds: readonly string[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(ownerId, unitId), JSON.stringify(sessionIds)).catch(() => {});
}
export async function clearTrackChoice(ownerId: string, unitId: string): Promise<void> {
  await AsyncStorage.removeItem(keyFor(ownerId, unitId)).catch(() => {});
}
