import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { SignedImage } from '@/components/ui/SignedImage';
import { DogIcon } from '@/components/ui/DogIcon';
import { useDogs } from '@/hooks/useDogs';
import {
  currentDiscipline,
  elapsedMs,
  useActiveTraining,
} from '@/stores/activeTraining';
import { useBarMinimized } from '@/stores/liveBarScroll';
import { tapHaptic } from '@/lib/haptics';

const LIVE   = '#00F5D4';
const PAUSE  = '#FF9A3D';

const RING = 48;
const STROKE = 3;
const R = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

function fmt(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}

export function LiveTrainingBar() {
  const router = useRouter();
  const active = useActiveTraining();
  const { dogs } = useDogs();
  const minimized = useBarMinimized();

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Animationen ──
  const pulse = useSharedValue(1);
  const mount = useSharedValue(0.9);
  useEffect(() => {
    mount.value = withSpring(1, { damping: 14, stiffness: 140 });
  }, []);
  useEffect(() => {
    if (active.paused) {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
    } else {
      pulse.value = withRepeat(
        withTiming(1.25, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        -1, true,
      );
    }
  }, [active.paused]);

  // Minimieren beim Scrollen: Name/Disziplin einklappen.
  const col = useSharedValue(0);
  useEffect(() => {
    col.value = withTiming(minimized ? 1 : 0, { duration: 220, easing: Easing.inOut(Easing.quad) });
  }, [minimized]);

  const dotStyle      = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const barStyle      = useAnimatedStyle(() => ({ transform: [{ scale: mount.value }], opacity: mount.value }));
  const collapseStyle = useAnimatedStyle(() => ({
    opacity:  1 - col.value,
    maxWidth: (1 - col.value) * 150,
    height:   (1 - col.value) * 32,
  }));

  if (!active.unitId) return null;

  const sec      = Math.floor(elapsedMs(active, now) / 1000);
  const goalSec  = Math.max(1, active.goalMinutes * 60);
  const progress = Math.min(1, sec / goalSec);
  const erreicht = progress >= 1;
  const farbe    = active.paused ? PAUSE : LIVE;
  const dog      = dogs.find(d => d.id === active.dogId);
  const disziplin = currentDiscipline(active);

  const open = () => { tapHaptic(); router.push('/unit/live'); };

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <Animated.View style={barStyle}>
        <Pressable onPress={open} style={({ pressed }) => [s.bar, { borderColor: `${farbe}40` }, pressed && { opacity: 0.9 }]}>
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `${farbe}1F` }]} />

          {/* Links: Avatar + Fortschrittsring */}
          <View style={s.avatarWrap}>
            <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
              <Circle cx={RING / 2} cy={RING / 2} r={R} stroke="rgba(255,255,255,0.1)" strokeWidth={STROKE} fill="none" />
              <Circle
                cx={RING / 2} cy={RING / 2} r={R}
                stroke={farbe} strokeWidth={STROKE} fill="none"
                strokeDasharray={`${CIRC} ${CIRC}`}
                strokeDashoffset={CIRC * (1 - progress)}
                strokeLinecap="round"
                transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
              />
            </Svg>
            <View style={[s.avatar, { borderColor: `${farbe}66` }]}>
              {dog?.photo_url ? (
                <SignedImage url={dog.photo_url} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <DogIcon size={22} color={farbe} />
              )}
            </View>
          </View>

          {/* Mitte: LIVE (immer) + Name/Disziplin (klappt beim Scrollen ein) */}
          <View style={s.center}>
            <View style={s.liveRow}>
              <Animated.View style={[s.dot, { backgroundColor: farbe }, dotStyle]} />
              <Text style={[s.liveTxt, { color: farbe }]}>{active.paused ? 'PAUSED' : erreicht ? 'ZIEL ✓' : 'LIVE'}</Text>
            </View>
            <Animated.View style={[s.nameWrap, collapseStyle]}>
              <Text style={s.name} numberOfLines={1}>{active.dogName ?? 'Hund'}</Text>
              {disziplin ? <Text style={s.disc} numberOfLines={1}>{disziplin}</Text> : null}
            </Animated.View>
          </View>

          {/* Rechts: Timer */}
          <Text style={s.timer}>{fmt(sec)}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 28, alignItems: 'center' },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    height: 64, minWidth: 150, maxWidth: 290, borderRadius: 32,
    paddingLeft: 8, paddingRight: 18,
    borderWidth: 1, overflow: 'hidden',
    shadowColor: LIVE, shadowOpacity: 0.18, shadowRadius: 30, shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  avatarWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  center:   { justifyContent: 'center', flexShrink: 1 },
  nameWrap: { overflow: 'hidden', justifyContent: 'center' },
  liveRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot:     { width: 7, height: 7, borderRadius: 4 },
  liveTxt: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  name:    { fontSize: 15, color: '#FFFFFF', fontWeight: '800', marginTop: 1 },
  disc:    { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  timer: {
    fontSize: 15, color: '#FFFFFF', fontWeight: '700',
    fontVariant: ['tabular-nums'], letterSpacing: 0.5,
  },
});
