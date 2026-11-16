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
import { useTranslation } from 'react-i18next';
import { localTrackNeedsHomeZoneWarning } from '@/features/home-zone/confirm';
import { HOME_ZONE_NS } from '@/features/home-zone/i18n';

type Phase = 'sending' | HandoverResult | 'failed' | 'zone' | 'consent';
const TEXT: Record<Exclude<Phase, 'zone' | 'consent'>, TranslationKey> = {
  sending: 'groups.handoverSending', sent: 'groups.handoverSent', queued: 'groups.handoverQueued',
  dropped: 'groups.handoverDropped', failed: 'groups.handoverFailed',
};

/** Nach dem Stoppen im Recorder: gelegte Fährte an die Hundeführerin übergeben. */
export default function GroupHandoverScreen() {
  const params = useLocalSearchParams<{ trackId: string; localId: string; groupId: string; sessionId: string }>();
  const router = useRouter();
  const { t } = useT();
  const { t: z } = useTranslation(HOME_ZONE_NS);
  const services = useGroupServices();
  const [phase, setPhase] = useState<Phase>('sending');
  const alive = useRef(true);
  const confirmed = useRef(false);
  // Issue #146: einmal pro Gruppe fragen, ob die gelegte Linie in Auswertungen erscheinen darf.
  const consentChecked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const valid = [params.trackId, params.localId, params.groupId, params.sessionId].every(v => typeof v === 'string' && v.length > 0);

  const toTraining = useCallback(() => {
    router.replace({ pathname: '/groups/session/[id]', params: { id: params.sessionId, groupId: params.groupId } } as never);
  }, [params.groupId, params.sessionId, router]);

  const send = useCallback(async (zoneConfirmed = false) => {
    const tracks = services.tracks, userId = services.userId, evals = services.evaluations;
    if (!tracks || !userId || !valid) { setPhase('failed'); return; }
    setPhase('sending');
    try {
      // Heimzone (Issue #115): die Übergabe enthält die ganze Fährte, deshalb vorher fragen.
      if (zoneConfirmed) confirmed.current = true;
      if (!consentChecked.current) {
        consentChecked.current = true;
        // Nicht abfragbar (offline, älterer Server): nicht fragen, es bleibt beim Nein.
        const undecided = services.evaluations ? await services.evaluations.consent(params.groupId).then(v => v === null, () => false) : false;
        if (undecided) { if (alive.current) setPhase('consent'); return; }
      }
      if (!confirmed.current && await localTrackNeedsHomeZoneWarning(params.localId)) { if (alive.current) setPhase('zone'); return; }
      if (!alive.current) return;
      const result = await submitHandover(tracks, userId, {
        trackId: params.trackId, localId: params.localId, groupId: params.groupId, sessionId: params.sessionId, createdAtMs: Date.now(),
        // Mit Heimzone übergeben: Fährte wird nie als Auswertung teilbar.
        ...(confirmed.current ? { homeZone: true } : {}),
      }, evals ? id => evals.block(id) : undefined);
      if (!alive.current) return;
      setPhase(result);
      if (result === 'sent') toTraining();
    } catch {
      if (alive.current) setPhase('failed');
    }
  }, [params.groupId, params.localId, params.sessionId, params.trackId, services, toTraining, valid]);

  // Antwort speichern und weiter übergeben. Klappt das Speichern nicht, bleibt es beim Nein und die Frage kommt beim nächsten Mal wieder.
  const answerConsent = (value: boolean) => {
    const evals = services.evaluations;
    setPhase('sending');
    void (evals ? evals.setConsent(params.groupId, value).catch(() => undefined) : Promise.resolve()).then(() => { if (alive.current) void send(); });
  };

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
            {phase === 'consent' ? (
              <View style={{ gap: 8 }}>
                <Text style={cs.section} accessibilityRole="header">{t('groups.consentTitle')}</Text>
                <Text style={cs.body}>{t('groups.consentBody')}</Text>
                <Text style={cs.hint}>{t('groups.consentHint')}</Text>
                <AnyvoButton label={t('groups.consentYes')} onPress={() => answerConsent(true)} />
                <AnyvoButton label={t('groups.consentNo')} variant="secondary" onPress={() => answerConsent(false)} />
              </View>
            ) : (
            <Text style={[cs.body, phase === 'sent' && { color: C.trackPrimary }]} accessibilityRole="alert" accessibilityLiveRegion="polite">{phase === 'zone' ? `${z('fullTitle')}. ${z('handoverBody')}` : t(TEXT[phase])}</Text>
            )}
            {phase === 'consent' ? null : phase === 'zone' ? (
              <View style={cs.actions}>
                <AnyvoButton style={cs.flex} label={z('handoverSkip')} onPress={toTraining} />
                <AnyvoButton style={cs.flex} label={z('handoverConfirm')} variant="secondary" onPress={() => { void send(true); }} />
              </View>
            ) : phase !== 'sending' && phase !== 'sent' ? (
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
