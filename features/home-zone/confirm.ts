import { Alert } from 'react-native';
import i18n from '@/i18n/config';
import { buildTrackUserExport } from '@/features/tracking/utils/trackUserExport';
import { applyHomeZones, touchesHomeZoneDeep } from './zones';
import { loadHomeZones, localTrackTouchesHomeZone } from './store';
import { HOME_ZONE_NS, type HomeZoneKey } from './i18n';

// Wege, die die ganze Fährte weitergeben müssen (Trainer-Freigabe, Übergabe,
// «Fährte legen für»): nicht kürzen, sondern vorher warnen. Abbrechen ist Standard.
const text = (key: HomeZoneKey) => i18n.t(key, { ns: HOME_ZONE_NS });

function ask(body: HomeZoneKey, confirm: HomeZoneKey): Promise<boolean> {
  return new Promise(resolve => Alert.alert(text('fullTitle'), text(body), [
    { text: text('cancel'), style: 'cancel', onPress: () => resolve(false) },
    { text: text(confirm), style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

/** Nicht prüfbar (Speicher- oder Lesefehler) zählt als «berührt»: lieber einmal zu viel fragen. */
async function touches(check: () => Promise<boolean>): Promise<boolean> {
  try { return await check(); } catch { return true; }
}

/** Trainer-Freigabe einer gespeicherten Fährte (Detaildaten wie im Export). */
export async function confirmTrainerShare(trackDetail: unknown): Promise<boolean> {
  const hit = await touches(async () => {
    const zones = await loadHomeZones();
    if (!zones.length) return false;
    const original = buildTrackUserExport(trackDetail, new Date().toISOString(), false);
    return applyHomeZones(original, zones).data !== original;
  });
  return hit ? ask('trainerBody', 'fullConfirm') : true;
}

/** Übergabe einer lokal gespeicherten Fährte (Fährten-Übergabe, Gruppentraining). */
export async function localTrackNeedsHomeZoneWarning(sessionLocalId: string): Promise<boolean> {
  return touches(() => localTrackTouchesHomeZone(sessionLocalId));
}
export async function confirmLocalTrackHandover(sessionLocalId: string): Promise<boolean> {
  return await localTrackNeedsHomeZoneWarning(sessionLocalId) ? ask('handoverBody', 'handoverConfirm') : true;
}

/**
 * «Auswertung teilen» im Gruppentraining: gelegte Linie und Absuche gehen ungekürzt an die
 * gewählten Mitglieder. Geprüft wird genau das Paket, das das Gerät verlässt. Fehlt es (Linien
 * liegen schon auf dem Server, lokale Fährte nicht mehr lesbar), wird bei eingerichteter
 * Heimzone gefragt: lieber einmal zu viel. `withLaidLine=false` (fremd gelegte Fährte, #146):
 * das Paket enthält nur die Absuche, der Text nennt dann keine gelegte Linie.
 */
export async function confirmEvaluationShare(pkg: unknown | null, withLaidLine = true): Promise<boolean> {
  const hit = await touches(async () => {
    const zones = await loadHomeZones();
    if (!zones.length) return false;
    return pkg == null ? true : touchesHomeZoneDeep(pkg, zones);
  });
  return hit ? ask(withLaidLine ? 'evaluationBody' : 'evaluationSearchBody', 'fullConfirm') : true;
}

/** Datei-Austausch (.anyvo-track): beliebiges Paket mit Koordinaten. */
export async function confirmTrackFileShare(file: unknown): Promise<boolean> {
  const hit = await touches(async () => touchesHomeZoneDeep(file, await loadHomeZones()));
  return hit ? ask('handoverBody', 'fullConfirm') : true;
}
