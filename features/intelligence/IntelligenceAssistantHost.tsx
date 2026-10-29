import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, findNodeHandle, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';
import { IntelligenceConversation } from './IntelligenceConversation';
import type { IntelligenceRouteRuntime } from './routeRuntime';
import { assistantCopy as copy } from './assistantCopy';
import { conversationCopy, speechStatusText } from './copy';

interface Props {
  runtime: IntelligenceRouteRuntime;
  identity: { accountId: string; dogId: string; dogName: string };
  onClose: () => void;
}

// Mounted only by the authenticated, release-gated route. This host never
// constructs a runtime, loads policy, grants consent or calls a provider.
// Keep the same modal and Conversation mounted across both layouts: its local
// corrected transcript and subscriptions belong to this one conversation.
export function IntelligenceAssistantHost({ runtime, identity, onClose }: Props) {
  const [layout, setLayout] = useState<'companion' | 'room'>('companion');
  const [confirmClose, setConfirmClose] = useState(false);
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const closed = useRef(false);
  const heading = useRef<Text>(null);
  const closeHeading = useRef<Text>(null);
  const light = useColorScheme() === 'light';
  const { height, fontScale } = useWindowDimensions();
  const colors = light ? { bg: '#FFFFFF', text: '#11181C', muted: '#46534E', card: '#F3F5F4', border: '#CAD3CF' }
    : { bg: C.bg, text: C.white, muted: '#B0BAB5', card: C.card, border: C.borderLight };
  const state = runtime.session.snapshot();
  const speechStatus = runtime.speech?.getStatus();
  const matches = state.scope?.ownerId === identity.accountId && state.scope.dogId === identity.dogId;
  const audioBusy = state.phase === 'listening' || speechStatus === 'requesting' || speechStatus === 'listening'
    || speechStatus === 'transcribing' || speechStatus === 'cleaning' || speechStatus === 'cleanupPending';
  const ready = matches && !!state.policy && !!state.consent?.text;
  const status = !matches || !state.policy ? conversationCopy.unavailable : !ready ? copy.locked
    : state.error ? conversationCopy.errors[state.error] : speechStatusText(speechStatus, conversationCopy)
      || (state.phase === 'listening' ? conversationCopy.listening : state.phase === 'sending' ? conversationCopy.sending : copy.ready);

  useEffect(() => {
    const stops = [runtime.session.subscribe(refresh), runtime.speech?.subscribe(refresh)];
    // Preserve the stronger route-level privacy boundary even when this host
    // is exercised independently. No consent or capture is restored on resume.
    const listener = AppState.addEventListener('change', next => {
      if (next !== 'active') { setConfirmClose(false); runtime.interrupt(); }
    });
    return () => { stops.forEach(stop => stop?.()); listener.remove(); runtime.interrupt(); };
  }, [runtime]);
  useEffect(() => { setConfirmClose(false); setLayout('companion'); }, [identity.accountId, identity.dogId, state.policy?.id]);
  const focusHeading = useCallback(() => {
    const node = findNodeHandle(confirmClose ? closeHeading.current : heading.current);
    if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
  }, [confirmClose]);
  useEffect(() => { focusHeading(); }, [layout, focusHeading]);

  const finishClose = () => {
    if (closed.current) return;
    closed.current = true;
    runtime.interrupt();
    onClose();
  };
  const requestClose = () => {
    if (closed.current) return;
    // An explicit close during live work always aborts immediately. Never
    // leave capture running behind a draft-confirmation dialog.
    const live = runtime.session.snapshot();
    const audio = runtime.speech?.getStatus();
    const activeAudio = live.phase === 'listening' || audio === 'requesting' || audio === 'listening'
      || audio === 'transcribing' || audio === 'cleaning' || audio === 'cleanupPending';
    if (!activeAudio && live.phase !== 'sending' && matches && (live.input.trim() || live.transcript.trim())) { Keyboard.dismiss(); setConfirmClose(true); }
    else finishClose();
  };
  const toggleLayout = () => {
    // Read the live adapter as well: a permission request can start in the same
    // event turn before React renders the disabled state.
    const live = runtime.speech?.getStatus();
    if (closed.current || confirmClose || runtime.session.snapshot().phase === 'listening'
      || live === 'requesting' || live === 'listening' || live === 'transcribing' || live === 'cleaning' || live === 'cleanupPending') return;
    setLayout(value => value === 'companion' ? 'room' : 'companion');
  };
  const room = layout === 'room';
  // Small landscape windows and large text use more of the available height.
  // The body and header both reflow; input stays in the existing scroll view.
  const compactHeight = height < 500 || fontScale > 1.4 ? '96%' : '78%';
  return <Modal visible transparent animationType="none" presentationStyle="overFullScreen" onRequestClose={requestClose} onShow={focusHeading}>
    <View style={styles.backdrop}>
      <Pressable accessible={false} importantForAccessibility="no" style={StyleSheet.absoluteFill} onPress={requestClose} />
      <SafeAreaView style={styles.safe} pointerEvents="box-none">
        <View testID="intelligence-assistant-surface" style={[styles.surface, { backgroundColor: colors.bg, borderColor: colors.border },
          room ? styles.room : [styles.companion, { height: compactHeight }]]} accessibilityViewIsModal>
          <View style={styles.conversation} accessibilityElementsHidden={confirmClose} importantForAccessibility={confirmClose ? 'no-hide-descendants' : 'auto'}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <View style={styles.actions}>
                <Pressable accessibilityRole="button" accessibilityLabel={room ? copy.collapse : copy.expand} accessibilityState={{ disabled: audioBusy }}
                  disabled={audioBusy} onPress={toggleLayout} style={[styles.button, { backgroundColor: colors.card, opacity: audioBusy ? 0.5 : 1 }]}>
                  <Text style={[styles.buttonText, { color: colors.text }]}>{room ? copy.collapse : copy.expand}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={copy.close} onPress={requestClose} style={[styles.button, { backgroundColor: colors.card }]}>
                  <Text style={[styles.buttonText, { color: colors.text }]}>{copy.close}</Text>
                </Pressable>
              </View>
            </View>
            <IntelligenceConversation session={runtime.session} consent={runtime.consent} speech={runtime.speech} identity={identity} embedded onBack={requestClose} header={<View style={styles.brandHeader}>
              <View style={styles.brand}>
                <LinearGradient accessible={false} importantForAccessibility="no-hide-descendants" colors={[C.accent, '#47BCCB', '#9298DD']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.orb}>
                  <View style={styles.glint} />
                </LinearGradient>
                <View style={styles.heading}>
                  <Text ref={heading} accessibilityRole="header" accessibilityLabel={`${copy.title} – ${room ? copy.room : copy.companion}`} style={[styles.title, { color: colors.text }]}>{copy.title}</Text>
                  <Text accessibilityLiveRegion="polite" style={[styles.label, { color: colors.muted }]}>{room ? copy.room : copy.companion}</Text>
                </View>
              </View>
              <Text accessibilityLiveRegion="polite" style={[styles.status, { color: colors.muted }]}>{status}</Text>
            </View>} />
          </View>
          {confirmClose && <View style={[styles.confirm, { backgroundColor: colors.bg }]} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={styles.confirmContent}>
              <Text ref={closeHeading} accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{copy.closeTitle}</Text>
              <Text style={[styles.status, { color: colors.text }]}>{copy.closeDetail}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.keep} onPress={() => setConfirmClose(false)} style={[styles.button, { backgroundColor: C.accent }]}>
                <Text style={[styles.buttonText, { color: C.accentText }]}>{copy.keep}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={copy.discard} onPress={finishClose} style={[styles.button, { backgroundColor: colors.card }]}>
                <Text style={[styles.buttonText, { color: colors.text }]}>{copy.discard}</Text>
              </Pressable>
            </ScrollView>
          </View>}
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.38)' }, safe: { flex: 1, justifyContent: 'flex-end' },
  surface: { borderWidth: 1, overflow: 'hidden', flexShrink: 1 }, companion: { margin: 12, borderRadius: 26 }, room: { flex: 1, borderRadius: 0 },
  conversation: { flex: 1 }, header: { padding: 12, borderBottomWidth: 1 }, brandHeader: { gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 }, heading: { flex: 1 },
  orb: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden' }, glint: { width: 18, height: 13, borderRadius: 12, margin: 7, backgroundColor: 'rgba(255,255,255,0.46)' },
  title: { fontSize: 20, fontWeight: '600' }, label: { fontSize: 14, marginTop: 3 }, status: { fontSize: 16, lineHeight: 23 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { minHeight: 48, borderRadius: 14, padding: 12, justifyContent: 'center', flexShrink: 1 },
  buttonText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  confirm: { ...StyleSheet.absoluteFillObject }, confirmContent: { padding: 24, gap: 18, flexGrow: 1, justifyContent: 'center' },
});
