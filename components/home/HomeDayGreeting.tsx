import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useT } from '@/i18n';
import { C } from '@/constants/colors';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { getActiveTrackingModes, subscribeActiveTrackingModes } from '@/features/tracking/utils/trackingWarmupState';
import { useVoiceStore } from '@/features/voice/store/voiceStore';
import { prepareGreetingAudio, finishGreetingAudio } from '@/lib/greetingAudioSafety';
import { claimGreeting, firstName, greetingKey, GREETING_AUDIO_RELEASE_TIMEOUT_MS, GREETING_DURATION_MS, publicUsername } from '@/features/home/greetingModel';
import { useGreetingSound } from '@/features/home/useGreetingSound';

const originalSound = require('@/assets/audio/anyvo-greeting.mp3');
const blockedAudio = () => {
  const track = useTrackingStore.getState();
  const voice = useVoiceStore.getState();
  return track.isRecording || track.isRunningTrack || getActiveTrackingModes().warmupActive || voice.isRecording || voice.isListening;
};

export function HomeDayGreeting({ ownerId, name, username, ready }: {
  ownerId?: string; name: unknown; username: unknown; ready: boolean;
}) {
  const { t } = useT();
  const sound = useGreetingSound(ownerId);
  const [now, setNow] = useState(() => new Date());
  const [accessibility, setAccessibility] = useState<{ reduce: boolean; reader: boolean } | null>(null);
  const dots = useRef(Array.from({ length: 5 }, () => new Animated.Value(0))).current;
  useEffect(() => {
    let alive = true;
    let changed = false;
    void Promise.all([AccessibilityInfo.isReduceMotionEnabled(), AccessibilityInfo.isScreenReaderEnabled()])
      .then(([reduce, reader]) => { if (alive && !changed) setAccessibility({ reduce, reader }); })
      .catch(() => { if (alive && !changed) setAccessibility({ reduce: true, reader: true }); });
    const reduce = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; setAccessibility(previous => ({ reduce: value, reader: previous?.reader ?? true })); });
    const reader = AccessibilityInfo.addEventListener('screenReaderChanged', value => { changed = true; setAccessibility(previous => ({ reduce: previous?.reduce ?? true, reader: value })); });
    return () => { alive = false; reduce.remove(); reader.remove(); };
  }, []);
  useFocusEffect(useCallback(() => {
    setNow(new Date());
    const clock = setInterval(() => setNow(new Date()), 30_000);
    const state = AppState.addEventListener('change', value => { if (value === 'active') setNow(new Date()); });
    return () => { clearInterval(clock); state.remove(); };
  }, []));
  useFocusEffect(useCallback(() => {
    if (!ownerId || !ready || !sound.ready || !accessibility || AppState.currentState !== 'active' || !claimGreeting(ownerId)) return;
    let live = true;
    let player: AudioPlayer | null = null;
    let started = false;
    let audioTimer: ReturnType<typeof setTimeout> | null = null;
    let audioCancelled = false;
    let status: { remove(): void } | null = null;
    const safe = () => live && !audioCancelled && AppState.currentState === 'active' && !blockedAudio();
    const stopSound = () => {
      audioCancelled = true;
      if (audioTimer !== null) clearTimeout(audioTimer);
      audioTimer = null;
      try { status?.remove(); } catch { /* Already released. */ }
      status = null;
      const previous = player; player = null;
      try { previous?.pause(); } catch { /* An interruption may invalidate playback. */ }
      try { previous?.remove(); } catch { /* Already released. */ }
      finishGreetingAudio(stopSound);
    };
    const animation = Animated.parallel(dots.map((dot, i) => Animated.sequence([
      Animated.delay(i * 120),
      Animated.timing(dot, { toValue: -4, duration: 500, useNativeDriver: true }),
      Animated.timing(dot, { toValue: 0, duration: 900, useNativeDriver: true }),
    ])));
    if (!accessibility.reduce) animation.start();
    const stopAnimation = () => { animation.stop(); dots.forEach(dot => dot.setValue(0)); };
    const stop = () => { live = false; stopAnimation(); stopSound(); };
    const timer = setTimeout(() => {
      stopAnimation();
      // Do not start a delayed greeting after its visual window. A playing clip
      // may finish its full four seconds without extending the animation.
      if (!started) stopSound();
    }, GREETING_DURATION_MS);
    const state = AppState.addEventListener('change', value => { if (value !== 'active') stop(); });
    const onBusy = () => { if (blockedAudio()) stopSound(); };
    const unsubscribeTrack = useTrackingStore.subscribe(onBusy);
    const unsubscribeVoice = useVoiceStore.subscribe(onBusy);
    const unsubscribeWarmup = subscribeActiveTrackingModes(onBusy);
    let checkingSpeech = false;
    const checkSpeech = async () => {
      if (checkingSpeech || !player) return;
      checkingSpeech = true;
      try { if (await Speech.isSpeakingAsync()) stopSound(); } catch { stopSound(); }
      finally { checkingSpeech = false; }
    };
    const speechTimer = setInterval(() => { void checkSpeech(); }, 100);
    if (sound.enabled && !accessibility.reader && safe()) void (async () => {
      try {
        if (await Speech.isSpeakingAsync() || !safe()) return;
        if (!await prepareGreetingAudio(stopSound, safe) || !safe()) return;
        player = createAudioPlayer(originalSound, { keepAudioSessionActive: true, updateInterval: 100 });
        player.loop = false;
        const play = () => {
          if (!started && player?.isLoaded && safe()) {
            started = true;
            try {
              player.play();
              audioTimer = setTimeout(stopSound, GREETING_AUDIO_RELEASE_TIMEOUT_MS);
            } catch { stopSound(); }
          }
        };
        status = player.addListener('playbackStatusUpdate', playback => {
          if (playback?.didJustFinish) stopSound();
          else play();
        });
        play();
      } catch { stopSound(); }
    })();
    return () => { clearTimeout(timer); clearInterval(speechTimer); state.remove(); unsubscribeTrack(); unsubscribeVoice(); unsubscribeWarmup(); stop(); };
  }, [ownerId, ready, sound.ready, sound.enabled, accessibility, dots]));
  const personal = firstName(name);
  const handle = publicUsername(username);
  return <View style={s.root}>
    <View accessibilityRole="header" accessible accessibilityLabel={`${t(greetingKey(now))}${personal ? `, ${personal}` : ''}`}>
      <Text style={s.greeting}>{t(greetingKey(now))}</Text>
      {personal ? <Text style={s.name}>{personal}</Text> : null}
    </View>
    {handle ? <Text style={s.username}>@{handle}</Text> : null}
    <View style={s.dots} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {dots.map((dot, index) => <Animated.View testID={`greeting-dot-${index}`} key={index} style={[s.dot, { transform: [{ translateY: dot }] }]} />)}
    </View>
  </View>;
}
const s = StyleSheet.create({
  root: { flex: 1, minWidth: 0, paddingRight: 10 },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  name: { fontSize: 28, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  username: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 3 },
  dots: { flexDirection: 'row', gap: 7, height: 20, alignItems: 'center', marginTop: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accent },
});
