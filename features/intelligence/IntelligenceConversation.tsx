import { useEffect, useReducer, useState, type ReactNode } from 'react';
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useColorScheme } from 'react-native';
import { C } from '@/constants/colors';
import { INTELLIGENCE_LIMITS as limits } from './contract';
import type { IntelligenceSession } from './session';
import type { IntelligenceConsentController } from './consentController';
import type { SpeechCaptureControls } from './speechCapture';
import { conversationCopy, speechStatusText, type ConversationCopy } from './copy';

interface Props {
  session: IntelligenceSession; consent: IntelligenceConsentController; speech: SpeechCaptureControls | null;
  identity: { accountId: string; dogId: string; dogName: string };
  onBack: () => void; copy?: ConversationCopy; embedded?: boolean; header?: ReactNode;
}
// Dedicated, controlled screen. The authenticated route owns account/dog
// selection, durable storage and disposal. This component cannot activate a gateway.
export function IntelligenceConversation({ session, consent, speech, identity, onBack, copy = conversationCopy, embedded = false, header }: Props) {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [textAllowed, setTextAllowed] = useState(false);
  const [audioAllowed, setAudioAllowed] = useState(false);
  const [changing, setChanging] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [revoked, setRevoked] = useState(false);
  const light = useColorScheme() === 'light';
  const colors = light ? { bg: '#FFFFFF', card: '#F3F5F4', text: '#11181C', muted: '#46534E', border: '#CAD3CF' }
    : { bg: C.bg, card: C.card, text: C.white, muted: '#B0BAB5', border: C.borderLight };
  const state = session.snapshot();
  const matches = state.scope?.ownerId === identity.accountId && state.scope?.dogId === identity.dogId;
  const available = matches && !!state.policy;
  const status = consent.getStatus();
  const speechStatus = speech?.getStatus();
  const audioCleanup = speechStatus === 'cleaning' || speechStatus === 'cleanupPending';
  const saving = status === 'saving' || status === 'loadingRevision';
  const unlocked = available && !!state.consent?.text && !changing;
  const sending = state.phase === 'sending';
  const recording = state.phase === 'listening';
  const reviewing = state.phase === 'reviewing';

  useEffect(() => {
    const stops = [session.subscribe(refresh), consent.subscribe(refresh), speech?.subscribe(refresh)];
    refresh();
    const appState = AppState.addEventListener('change', next => {
      if (next !== 'active') { speech?.cancel(); session.interrupt(); }
    });
    return () => { stops.forEach(stop => stop?.()); appState.remove(); speech?.cancel(); session.clear(); };
  }, [session, consent, speech]);
  useEffect(() => {
    setTextAllowed(false); setAudioAllowed(false); setChanging(false); setRevoked(false); setReviewText('');
  }, [identity.accountId, identity.dogId, state.policy?.id]);
  useEffect(() => { setReviewText(state.transcript); }, [state.transcript]);
  // Render protection is synchronous: never show an old account/dog's messages
  // while waiting for effects or a parent scope update.
  useEffect(() => { if (!matches) { speech?.cancel(); session.clear(); } }, [matches, speech, session]);

  const button = (label: string, action: () => void, disabled = false, primary = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      onPress={action} style={[styles.button, { backgroundColor: primary ? C.accent : colors.card, borderColor: colors.border, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[styles.buttonText, { color: primary ? C.accentText : colors.text }]}>{label}</Text>
    </Pressable>
  );
  const body = { color: colors.text };
  const muted = { color: colors.muted };
  const revoke = () => { speech?.cancel(); setRevoked(true); setChanging(false); void consent.revoke(); };
  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {header}
        {!embedded && button(copy.back, () => { speech?.cancel(); session.clear(); onBack(); })}
        {!embedded && <Text accessibilityRole="header" style={[styles.title, body]}>{copy.title}</Text>}
        {audioCleanup && <View>
          <Text accessibilityLiveRegion="polite" style={[styles.body, body]}>{speechStatusText(speechStatus, copy)}</Text>
          {speech?.retryCleanup && speechStatus === 'cleanupPending' && button(copy.retryAudioCleanup, () => { void speech.retryCleanup?.(); })}
        </View>}
        {!available ? <Text style={[styles.body, muted]}>{copy.unavailable}</Text> : <>
          <Text style={[styles.dog, body]}>{identity.dogName}</Text>
          {status === 'revocationPending' && <View>
            <Text accessibilityLiveRegion="polite" style={[styles.body, body]}>{copy.pending}</Text>
            {button(copy.retry, () => { void consent.retryRevocations(identity.accountId); })}
          </View>}
          {revoked && status === 'idle' && <Text accessibilityLiveRegion="polite" style={[styles.body, body]}>{copy.revoked}</Text>}
          {!unlocked ? <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text accessibilityRole="header" style={[styles.subtitle, body]}>{copy.privacy}</Text>
            <Text style={[styles.body, body]}>{state.policy!.providerLabel}</Text>
            <Text style={[styles.body, body]}>{state.policy!.disclosure}</Text>
            <Text style={[styles.body, muted]}>{state.policy!.retentionSummary}</Text>
            <View style={styles.choice}>
              <Text style={[styles.choiceText, body]}>{copy.textConsent}</Text>
              <Switch accessibilityLabel={copy.textConsent} value={textAllowed} disabled={saving}
                onValueChange={value => { setTextAllowed(value); if (!value) setAudioAllowed(false); }} />
            </View>
            <View style={styles.choice}>
              <Text style={[styles.choiceText, body]}>{copy.audioConsent}</Text>
              <Switch accessibilityLabel={copy.audioConsent} value={audioAllowed} disabled={!textAllowed || saving} onValueChange={setAudioAllowed} />
            </View>
            {consent.getRevision() === null && button(status === 'loadingRevision' ? copy.loadingRevision : copy.readRevision, () => { void consent.loadRevision(); }, saving || status === 'revocationPending')}
            {consent.canRetryGrant() && button(copy.retryConsent, () => { void consent.retryGrant(); }, saving)}
            {button(status === 'saving' ? copy.saving : copy.agree, () => { setChanging(false); setRevoked(false); void consent.grant(textAllowed, audioAllowed); },
              !textAllowed || saving || status === 'revocationPending' || consent.getRevision() === null, true)}
            {status === 'failed' && <Text accessibilityLiveRegion="polite" style={[styles.body, body]}>{copy.consentFailed}</Text>}
          </View> : <>
            <Text style={[styles.body, muted]}>{copy.intro}</Text>
            {state.messages.map((message, index) => <View key={index} style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.speaker, muted]}>{message.role === 'user' ? copy.you : copy.assistant}</Text>
              <Text selectable style={[styles.body, body]}>{message.text}</Text>
            </View>)}
            {sending && <Text accessibilityLiveRegion="polite" style={[styles.body, body]}>{copy.sending}</Text>}
            {recording && (speechStatus === 'requesting' || speechStatus === 'listening') && <Text accessibilityLiveRegion="polite" style={[styles.body, body]}>{speechStatus === 'requesting' ? copy.permission : copy.listening}</Text>}
            {reviewing ? <View style={styles.card}>
              <Text style={[styles.subtitle, body]}>{copy.review}</Text>
              <TextInput accessibilityLabel={copy.review} multiline value={reviewText} onChangeText={setReviewText}
                maxLength={limits.transcriptChars} style={[styles.input, body, { borderColor: colors.border, backgroundColor: colors.card }]} />
              {reviewText.length > limits.messageChars && <Text style={[styles.body, body]}>{copy.length}</Text>}
              {button(copy.useTranscript, () => { session.confirmTranscript(reviewText); }, !reviewText.trim() || reviewText.length > limits.messageChars, true)}
              {button(copy.discard, () => { speech?.cancel(); session.interrupt(); })}
            </View> : <>
              <TextInput accessibilityLabel={copy.input} placeholder={copy.input} placeholderTextColor={colors.muted}
                multiline value={state.input} editable={!sending && !recording} maxLength={limits.messageChars}
                onChangeText={text => session.editInput(text)} style={[styles.input, body, { borderColor: colors.border, backgroundColor: colors.card }]} />
              <Text style={[styles.count, muted]}>{state.input.length}/{limits.messageChars}</Text>
              {button(copy.send, () => { void session.send(); }, sending || recording || !state.input.trim() || state.input.length > limits.messageChars, true)}
              {!speech && state.consent?.audio && <Text style={[styles.body, muted]}>{copy.speechUnavailable}</Text>}
              {speech?.finish && speechStatus === 'listening' && button(copy.finishSpeech, () => { void speech.finish?.(); })}
              {speech && state.consent?.audio && button(copy.speak, () => { void speech.start(); }, sending || recording || speechStatus === 'cleaning' || speechStatus === 'cleanupPending')}
              {(sending || recording) && button(copy.cancel, () => { speech?.cancel(); session.interrupt(); })}
            </>}
            {!audioCleanup && !!speechStatusText(speechStatus, copy) && <Text accessibilityLiveRegion="polite" style={[styles.body, body]}>{speechStatusText(speechStatus, copy)}</Text>}
            {state.error && <Text accessibilityLiveRegion="polite" style={[styles.body, body]}>{copy.errors[state.error]}</Text>}
            <Text style={[styles.body, muted]}>{copy.notSaved}</Text>
            {button(copy.clear, () => { speech?.cancel(); session.clear(); })}
            {button(copy.change, () => { speech?.cancel(); session.interrupt(); setTextAllowed(!!state.consent?.text); setAudioAllowed(!!state.consent?.audio); setChanging(true); })}
          </>}
          {button(copy.revoke, revoke)}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1 }, content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { fontSize: 28, fontWeight: '700' }, subtitle: { fontSize: 19, fontWeight: '600' },
  dog: { fontSize: 18, fontWeight: '600' }, body: { fontSize: 16, lineHeight: 24 },
  card: { padding: 16, borderRadius: 18, gap: 10 }, speaker: { fontSize: 14, fontWeight: '600' },
  button: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }, choiceText: { flex: 1, fontSize: 16, lineHeight: 23 },
  input: { minHeight: 100, borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 17, lineHeight: 25, textAlignVertical: 'top' },
  count: { fontSize: 13, textAlign: 'right' },
});
