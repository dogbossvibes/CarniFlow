import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseMantrailData, type MantrailData } from './model';
import { getLocalMantrailDetails, setLocalMantrailDetails } from './localRepository';

// Sicherungskopie der Mantrailing-Angaben je Trail (Spec 02, PR B1). Die Angaben werden
// vor dem Start erfasst, die lokale Sitzungszeile entsteht aber erst kurz nach dem Start.
// Bis die Angaben in der Sitzung stehen, liegen sie zusätzlich hier; nach dem Speichern
// des Ergebnisses wird die Kopie entfernt. Enthält keine Orte, keine Spur, keinen Text
// ausser den freien Feldern des Trails.

const key = (sessionId: string) => `anyvo.mantrail.draft.v1.${sessionId}`;

export async function saveMantrailDraft(sessionId: string, data: MantrailData): Promise<void> {
  const clean = parseMantrailData(data);
  if (!clean) return;
  try { await AsyncStorage.setItem(key(sessionId), JSON.stringify(clean)); } catch { /* best effort, Sitzung ist die Hauptquelle */ }
}

export async function loadMantrailDraft(sessionId: string): Promise<MantrailData | null> {
  try {
    const raw = await AsyncStorage.getItem(key(sessionId));
    return raw ? parseMantrailData(JSON.parse(raw)) : null;
  } catch { return null; }
}

export async function clearMantrailDraft(sessionId: string): Promise<void> {
  try { await AsyncStorage.removeItem(key(sessionId)); } catch { /* bleibt liegen, schadet nicht */ }
}

/** Angaben eines Trails: zuerst aus der Sitzung, sonst aus der Sicherungskopie. */
export async function readMantrailDetails(sessionId: string): Promise<MantrailData | null> {
  return (await getLocalMantrailDetails(sessionId).catch(() => null)) ?? loadMantrailDraft(sessionId);
}

/**
 * Schreibt die Angaben in die Sitzung, sobald die Zeile existiert (kurze Wartezeit nach dem
 * Start). Gelingt es nicht, bleibt die Sicherungskopie bestehen und das Ergebnis schreibt später.
 */
export async function persistMantrailDetails(sessionId: string, data: MantrailData, attempts = 10, waitMs = 500): Promise<boolean> {
  await saveMantrailDraft(sessionId, data);
  for (let i = 0; i < attempts; i++) {
    if (await setLocalMantrailDetails(sessionId, data).catch(() => false)) return true;
    await new Promise(r => setTimeout(r, waitMs));
  }
  return false;
}
