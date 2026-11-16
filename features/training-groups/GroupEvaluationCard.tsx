import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { EvaluationShareState } from '@/features/tracking-exchange/groups/evaluationService';
import { useGroupServices } from './groupHub';
import { readGroupTrackId } from './evaluationLocal';
import { ShareEvaluationSheet } from './ShareEvaluationSheet';

/** Was die Fährtenansicht für die bestehende Trainer-Freigabe wissen muss. */
export type OutsideShareGate = 'pending' | 'not-group' | 'allowed' | 'blocked';

/**
 * Stufe 4a: Karte «Auswertung teilen» in der Fährtenansicht einer übernommenen Gruppenfährte.
 * Meldet zusätzlich, ob die Gruppe das Teilen ausserhalb erlaubt. Ohne Antwort (offline) gilt «blocked».
 */
export function GroupEvaluationCard({ localId, onGate, onOpenTrainerShare }: {
  localId: string; onGate(gate: OutsideShareGate): void; onOpenTrainerShare?(): void;
}) {
  const { t } = useT();
  const services = useGroupServices();
  const [trackId, setTrackId] = useState<string | null>(null);
  const [state, setState] = useState<EvaluationShareState | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void readGroupTrackId(localId).then(found => {
      if (!alive) return;
      setTrackId(found);
      if (!found) onGate('not-group');
    }).catch(() => { if (alive) onGate('not-group'); });
    return () => { alive = false; };
  }, [localId, onGate]);

  useEffect(() => {
    const service = services.evaluations;
    if (!trackId) return;
    let alive = true;
    onGate('blocked');
    // Zustand erst im Ablauf zurücksetzen, nicht synchron im Effekt (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      if (!alive) return undefined;
      setFailed(false);
      if (!service) return undefined;
      return service.state(trackId).then(next => {
        if (!alive) return;
        setState(next); onGate(next.shareOutside ? 'allowed' : 'blocked');
      });
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [trackId, services.evaluations, onGate]);

  if (!trackId) return null;
  const names = state ? state.candidates.filter(c => state.recipientUserIds.includes(c.userId)).map(c => c.displayName) : [];
  const status = !state ? (failed ? t('groups.evalLoadFailed') : '…')
    : state.group ? t('groups.evalStatusGroup')
    : names.length ? t('groups.evalStatusSome', { names: names.join(', ') })
    : t('groups.evalStatusNone');
  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{t('groups.evalShare')}</Text>
          <Text style={s.hint}>{status}</Text>
        </View>
        <Ionicons name="people-outline" size={22} color={C.trackPrimary} />
      </View>
      {state && state.searched ? (
        <AnyvoButton label={t(state.shared ? 'groups.evalChange' : 'groups.evalShare')} icon="share-social-outline" variant="secondary"
          onPress={() => setOpen(true)} />
      ) : null}
      {!state?.shareOutside && state ? <Text style={s.hint}>{t('groups.evalOutsideOff')}</Text> : null}
      <ShareEvaluationSheet visible={open} onClose={() => setOpen(false)} service={services.evaluations} trackId={trackId}
        localId={localId} onSaved={setState} onOpenTrainerShare={onOpenTrainerShare} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.trackCard, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, padding: 16, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: C.trackText, fontSize: 16, fontWeight: '800' },
  hint: { color: C.trackTextSec, fontSize: 12, lineHeight: 17 },
});
