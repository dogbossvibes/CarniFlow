import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { scoreColor } from '@/services/analytics/scoring';

interface Props {
  score:  number;
  size?:  number;
  label?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function ScoreRing({ score, size = 160, label }: Props) {
  const strokeW    = size * 0.075;
  const R          = (size - strokeW * 2) / 2;
  const cx         = size / 2;
  const circumference = 2 * Math.PI * R;

  const animVal = useRef(new Animated.Value(0)).current;
  const numVal  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animVal, {
      toValue:         score / 100,
      duration:        1200,
      useNativeDriver: false,
    }).start();
    Animated.timing(numVal, {
      toValue:         score,
      duration:        1000,
      useNativeDriver: false,
    }).start();
  }, [score]);

  const strokeOffset = animVal.interpolate({
    inputRange:  [0, 1],
    outputRange: [circumference, 0],
  });

  const color = scoreColor(score);

  return (
    <View style={[st.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity="1" />
            <Stop offset="100%" stopColor={color === '#00f0c8' ? '#00FFCC' : color} stopOpacity="0.6" />
          </LinearGradient>
        </Defs>
        {/* Track */}
        <Circle
          cx={cx} cy={cx} r={R}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeW}
          fill="none"
          strokeLinecap="round"
        />
        {/* Progress — rotated so it starts at top */}
        <AnimatedCircle
          cx={cx} cy={cx} r={R}
          stroke="url(#ringGrad)"
          strokeWidth={strokeW}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </Svg>

      <View style={st.center}>
        <ScoreNumber value={numVal} color={color} />
        {label && <Text style={st.label}>{label}</Text>}
      </View>
    </View>
  );
}

function ScoreNumber({ value, color }: { value: Animated.Value; color: string }) {
  const [displayed, setDisplayed] = React.useState(0);
  useEffect(() => {
    const id = value.addListener(({ value: v }) => setDisplayed(Math.round(v)));
    return () => value.removeListener(id);
  }, [value]);
  return <Text style={[st.scoreNum, { color }]}>{displayed}</Text>;
}

const st = StyleSheet.create({
  wrap:     { alignItems: 'center', justifyContent: 'center' },
  center:   { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  score:    {},
  scoreNum: { fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  label:    { fontSize: 11, color: '#555570', fontWeight: '700', letterSpacing: 1, marginTop: 2 },
});
