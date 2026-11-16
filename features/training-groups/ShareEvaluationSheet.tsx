import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { EvaluationShareState, GroupEvaluationService } from '@/features/tracking-exchange/groups/evaluationService';
import { confirmEvaluationShare } from '@/features/home-zone/confirm';
import { readEvaluationPackage } from './evaluationLocal';

/**
 * «Auswertung teilen» (Stufe 4a). Standard: niemand. Auch die Leger:in nur mit Freigabe.
 * «Meine Trainer» erscheint nur, wenn die Gruppe das Teilen ausserhalb erlaubt; dort läuft die
 * bestehende Trainer-Freigabe der Fährte.
 */
export function ShareEvaluationSheet({ visible, onClose, service, trackId, localId, onSaved, onOpenTrainerShare }: {
  visible: boolean; onClose(): void; service: GroupEvaluationService | null; trackId: string; localId: string;
  onSaved?(state: EvaluationShareState): void; onOpenTrainerShare?(): void;
}) {
  const { t } = useT();
  const [state, setState] = useState<EvaluationShareState | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [group, setGroup] = useState(false);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'saving' | 'failed'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !service) return;
    let alive = true;
    // Zustand erst im Ablauf zurücksetzen, nicht synchron im Effekt (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      if (!alive) return undefined;
      setPhase('loading'); setError(null);
      return service.state(trackId).then(next => {
        if (!alive) return;
        setState(next); setPicked(new Set(next.recipientUserIds)); setGroup(next.group); setPhase('ready');
      });
    }).catch(() => { if (alive) setPhase('failed'); });
    return () => { alive = false; };
  }, [visible, service, trackId]);

  const toggle = (userId: string, on: boolean) => setPicked(prev => {
    const next = new Set(prev); if (on) next.add(userId); else next.delete(userId); return next;
  });

  const save = async () => {
    if (!service || !state) return;
    setPhase('saving'); setError(null);
    try {
      const wantsShare = group || picked.size > 0;
      // Mehr Leute als bisher (auch beim ersten Teilen): dann gilt die Heimzonen-Abfrage.
      const widened = (group && !state.group) || [...picked].some(id => !state.recipientUserIds.includes(id));
      // Beim ersten Teilen das Paket aus der eigenen Fährte mitsenden; danach bleiben Linien auf dem Server.
      // Für die Heimzonen-Abfrage wird es auch beim Erweitern gelesen, dann aber nicht erneut gesendet.
      const local = wantsShare && (!state.shared || widened) ? await readEvaluationPackage(localId) : null;
      const pkg = !state.shared ? local : null;
      if (wantsShare && !state.shared && !pkg) { setError(t('groups.evalNoSearch')); setPhase('ready'); return; }
      // Linien gehen ungekürzt an die Gewählten: liegt ein Teil in der Heimzone, vorher fragen (Abbrechen ist Standard).
      if (wantsShare && widened && !(await confirmEvaluationShare(local))) { setPhase('ready'); return; }
      const next = await service.share(trackId, [...picked], group, pkg);
      setState(next); onSaved?.(next); onClose();
    } catch {
      setError(t('groups.evalSaveFailed')); setPhase('ready');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('groups.cancel')} />
      <SafeAreaView edges={['bottom']} style={s.sheet}>
        <View style={s.handle} />
        <Text accessibilityRole="header" style={s.title}>{t('groups.evalShare')}</Text>
        {phase === 'loading' ? <ActivityIndicator color={C.trackPrimary} style={{ marginVertical: 24 }} /> : null}
        {phase === 'failed' ? <Text style={s.hint}>{t('groups.evalLoadFailed')}</Text> : null}
        {state && (phase === 'ready' || phase === 'saving') ? (
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 6 }}>
            {state.blocked ? <Text style={s.hint}>{t('groups.evalBlocked')}</Text>
            : !state.searched ? <Text style={s.hint}>{t('groups.evalNotSearched')}</Text> : (
              <>
                <Text style={s.section}>{t('groups.evalInGroup')}</Text>
                <View style={s.card}>
                  {state.candidates.map((c, index) => (
                    <View key={c.userId} style={[s.row, index > 0 && s.divider]}>
                      <Text style={s.label}>
                        {c.displayName}
                        {c.isLayer || c.isTrainer ? <Text style={s.muted}>{` · ${t(c.isLayer ? 'groups.evalLayer' : 'groups.trainer')}`}</Text> : null}
                      </Text>
                      <Switch value={group || picked.has(c.userId)} disabled={group} onValueChange={v => toggle(c.userId, v)}
                        accessibilityLabel={c.displayName} trackColor={{ true: C.trackPrimary, false: C.trackCardAlt }} />
                    </View>
                  ))}
                  <View style={[s.row, state.candidates.length > 0 && s.divider]}>
                    <Text style={s.label}>{t('groups.evalWholeGroup')}</Text>
                    <Switch value={group} onValueChange={setGroup} accessibilityLabel={t('groups.evalWholeGroup')}
                      trackColor={{ true: C.trackPrimary, false: C.trackCardAlt }} />
                  </View>
                </View>
                <View style={s.card}>
                  <View style={s.row}>
                    <Text style={s.label}>{t('groups.evalLaidRow')}</Text>
                    <Text style={[s.muted, { fontSize: 12, textAlign: 'right', maxWidth: '60%' }]}>
                      {t(state.laidShared ? 'groups.evalLaidReleased' : 'groups.evalLaidNotReleased', { name: state.candidates.find(c => c.isLayer)?.displayName ?? t('groups.evalLayer') })}
                    </Text>
                  </View>
                </View>
                {state.shareOutside && onOpenTrainerShare ? (
                  <>
                    <Text style={s.section}>{t('groups.evalMyTrainers')}</Text>
                    <View style={[s.card, { paddingVertical: 10, gap: 8 }]}>
                      <Text style={s.hint}>{t('groups.evalMyTrainersHint')}</Text>
                      <AnyvoButton label={t('groups.evalMyTrainersOpen')} variant="secondary" icon="person-add-outline"
                        onPress={() => { onClose(); onOpenTrainerShare(); }} />
                    </View>
                  </>
                ) : null}
                <Text style={s.hint}>{t('groups.evalPrivacy')}</Text>
              </>
            )}
          </ScrollView>
        ) : null}
        {error ? <Text style={[s.hint, { color: C.trackDanger }]} accessibilityRole="alert">{error}</Text> : null}
        <AnyvoButton label={t('groups.evalSave')} onPress={() => void save()} loading={phase === 'saving'}
          disabled={!state || !state.searched || state.blocked || phase !== 'ready'} />
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: C.trackBg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 10, borderTopWidth: 1, borderColor: C.trackBorder },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.trackBorder },
  title: { color: C.trackText, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  section: { color: C.trackTextSec, fontSize: 12, fontWeight: '700', marginTop: 6 },
  card: { backgroundColor: C.trackCard, borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: C.trackBorder },
  label: { flex: 1, color: C.trackText, fontSize: 14, fontWeight: '600' },
  muted: { color: C.trackTextSec, fontWeight: '400' },
  hint: { color: C.trackTextSec, fontSize: 12, lineHeight: 17 },
});
