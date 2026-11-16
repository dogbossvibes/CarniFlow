import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { useT, type TranslationKey } from '@/i18n';
import { C } from '@/constants/colors';
import { ContactScreenHeader } from '@/features/contacts/ContactScreenHeader';
import { contactStyles as cs } from '@/features/contacts/contactStyles';
import { useGroupServices } from './groupHub';
import { submitHandover, type HandoverResult } from './groupTrackLocal';

type Phase = 'sending' | HandoverResult | 'failed';
const TEXT: Record<Phase, TranslationKey> = {
  sending: 'groups.handoverSending', sent: 'groups.handoverSent', queued: 'groups.handoverQueued',
  dropped: 'groups.handoverDropped', failed: 'groups.handoverFailed',
};

/** Nach dem Stoppen im Recorder: gelegte Fährte an die Hundeführerin übergeben. */
export default function GroupHandoverScreen() {
  const params = useLocalSearchParams<{ trackId: string; localId: string; groupId: string; sessionId: string }>();
  const router = useRouter();
  const { t } = useT();
  const services = useGroupServices();
  const [phase, setPhase] = useState<Phase>('sending');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const valid = [params.trackId, params.localId, params.groupId, params.sessionId].every(v => typeof v === 'string' && v.length > 0);

  const toTraining = useCallback(() => {
    router.replace({ pathname: '/groups/session/[id]', params: { id: params.sessionId, groupId: params.groupId } } as never);
  }, [params.groupId, params.sessionId, router]);

  const send = useCallback(async () => {
    const tracks = services.tracks, userId = services.userId;
    if (!tracks || !userId || !valid) { setPhase('failed'); return; }
    setPhase('sending');
    try {
      const result = await submitHandover(tracks, userId, {
        trackId: params.trackId, localId: params.localId, groupId: params.groupId, sessionId: params.sessionId, createdAtMs: Date.now(),
      });
      if (!alive.current) return;
      setPhase(result);
      if (result === 'sent') toTraining();
    } catch {
      if (alive.current) setPhase('failed');
    }
  }, [params.groupId, params.localId, params.sessionId, params.trackId, services, toTraining, valid]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !services.tracks) return;
    started.current = true;
    void send();
  }, [send, services.tracks]);

  return (
    <View style={cs.root}>
      <SafeAreaView edges={['top']} style={cs.flex}>
        <ContactScreenHeader title={t('groups.layForTitle')} />
        <View style={cs.scroll}>
          <AnyvoCard>
            {phase === 'sending' ? <ActivityIndicator color={C.trackPrimary} style={{ marginBottom: 10 }} /> : null}
            <Text style={[cs.body, phase === 'sent' && { color: C.trackPrimary }]} accessibilityRole="alert" accessibilityLiveRegion="polite">{t(TEXT[phase])}</Text>
            {phase !== 'sending' && phase !== 'sent' ? (
              <View style={cs.actions}>
                {phase === 'queued' || phase === 'failed'
                  ? <AnyvoButton style={cs.flex} label={t('groups.retry')} variant="secondary" onPress={() => { void send(); }} /> : null}
                <AnyvoButton style={cs.flex} label={t('groups.toTraining')} onPress={toTraining} />
              </View>
            ) : null}
          </AnyvoCard>
        </View>
      </SafeAreaView>
    </View>
  );
}
