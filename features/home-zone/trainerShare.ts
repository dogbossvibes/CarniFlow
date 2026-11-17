import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import i18n from '@/i18n/config';
import { isShareCopyUnsupported, shareTrack, updateTrackShareCopy, type TrackShare, type TrackShareCopy } from '@/services/trackShareService';
import { buildSharedTrackCopy, SHARED_COPY_MAX_CHARS, SHARED_COPY_VERSION } from './sharedCopy';
import { loadHomeZones } from './store';
import { confirmTrainerShare } from './confirm';
import { HOME_ZONE_NS, type HomeZoneKey } from './i18n';
import { isForeignLaidGroupTrack, searchOnlyDetail } from '@/features/training-groups/foreignLaidLine';

// Heimzone bei Trainer-Freigaben (Issue #121). Die Zone bleibt auf dem Gerät:
// der Server erhält nur die bereits gekürzte Kopie.
const text = (key: HomeZoneKey) => i18n.t(key, { ns: HOME_ZONE_NS });

/** clipped = die Heimzone hat etwas entfernt (dann wird vorher gefragt). */
type Plan = { kind: 'none' } | { kind: 'copy'; copy: TrackShareCopy; allRemoved: boolean; clipped: boolean } | { kind: 'unknown' };

/** 'unknown' = Zonen nicht lesbar oder Kopie nicht erzeugbar: dann gilt der Warnweg aus #115. */
export async function planTrainerShareCopy(detail: unknown): Promise<Plan> {
  try {
    // Fremd gelegte Gruppenfährte: Die Kopie enthält nur Absuche und Kennzahlen, nie die Linie der Leger:in.
    const foreign = isForeignLaidGroupTrack(detail);
    const base = foreign ? searchOnlyDetail(detail) : detail;
    const built = buildSharedTrackCopy(base, await loadHomeZones());
    if (!built && !foreign) return { kind: 'none' };
    const copy = built?.copy ?? { ...(base as Record<string, unknown>), sharedCopyVersion: SHARED_COPY_VERSION };
    const json = built?.json ?? JSON.stringify(copy);
    if (json.length > SHARED_COPY_MAX_CHARS) throw new Error('shared-copy-too-large');
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, json);
    return { kind: 'copy', copy: { copy, digest }, allRemoved: built?.allRemoved ?? false, clipped: !!built };
  } catch { return { kind: 'unknown' }; }
}

function askClipped(allRemoved: boolean): Promise<boolean> {
  return new Promise(resolve => Alert.alert(text('fullTitle'), text(allRemoved ? 'trainerNoMapBody' : 'trainerClippedBody'), [
    { text: text('cancel'), style: 'cancel', onPress: () => resolve(false) },
    { text: text('trainerClippedConfirm'), onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

/** Freigabe mit gekürzter Kopie. null = von der Nutzerin abgebrochen. */
export async function shareTrackWithHomeZone(trackId: string, trainerUserId: string, detail: unknown): Promise<Awaited<ReturnType<typeof shareTrack>> | null> {
  const plan = await planTrainerShareCopy(detail);
  if (plan.kind === 'none') return shareTrack(trackId, trainerUserId);
  if (plan.kind === 'copy') {
    if (plan.clipped && !await askClipped(plan.allRemoved)) return null;
    const result = await shareTrack(trackId, trainerUserId, plan.copy);
    if (!isShareCopyUnsupported(result.error)) return result;
    // Server kennt die Kopie noch nicht: ehrlich warnen statt ungekürzt freigeben.
  }
  // Fremd gelegt und keine Kopie möglich: nicht freigeben. Die Linie der Leger:in geht nie ungekürzt mit.
  if (isForeignLaidGroupTrack(detail)) {
    Alert.alert(text('fullTitle'), text('foreignLaidUnavailable'));
    return null;
  }
  if (!await confirmTrainerShare(detail)) return null;
  return shareTrack(trackId, trainerUserId);
}

/**
 * Öffnet die Besitzerin eine freigegebene Fährte, wird die Kopie an die aktuelle
 * Zone angepasst (auch für Freigaben von vor der Heimzone). Fehler bleiben still:
 * die Freigabe selbst wird nie verändert oder beendet.
 */
export async function refreshTrainerShareCopies(detail: unknown, shares: readonly TrackShare[]): Promise<void> {
  const active = shares.filter(share => !share.revoked_at);
  // Ohne die Spalten (Migration fehlt) gibt es nichts abzugleichen.
  if (!active.length || active.every(share => share.shared_copy_digest === undefined)) return;
  const plan = await planTrainerShareCopy(detail);
  if (plan.kind === 'unknown') return;
  // Gilt auch für Freigaben fremd gelegter Gruppenfährten von vor dieser Regel: Sie erhalten die Kopie ohne gelegte Linie.
  const wanted = plan.kind === 'copy' ? plan.copy : null;
  for (const share of active) {
    if ((share.shared_copy_digest ?? null) === (wanted?.digest ?? null)) continue;
    try { await updateTrackShareCopy(share.id, wanted); } catch { /* nächster Versuch beim nächsten Öffnen */ }
  }
}
