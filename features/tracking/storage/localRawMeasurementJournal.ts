import AsyncStorage from '@react-native-async-storage/async-storage';
import { createRawMeasurementJournal } from './rawMeasurementJournal';

/** Explicit opt-in foundation; never instantiated by the recorder yet.
 * Integration must supply the authenticated owner's identity and use this same
 * adapter in one JavaScript runtime, drain before finalization, and remove on track/account deletion.
 * No network, export or automatic retention eviction is performed here.
 */
export function openLocalRawMeasurementJournal(ownerId: string, sessionId: string) {
  return createRawMeasurementJournal(AsyncStorage, ownerId, sessionId);
}
