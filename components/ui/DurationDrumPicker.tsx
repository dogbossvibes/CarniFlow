import React, { useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
} from 'react-native';

const STEPS = [5, 10, 15, 20, 25, 30, 35, 40];
const ITEM_H = 44;

interface Props {
  value: number;
  onChange: (val: number) => void;
}

export function DurationDrumPicker({ value, onChange }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const currentIdx = useRef(
    Math.max(0, STEPS.indexOf(value) === -1 ? 3 : STEPS.indexOf(value))
  );

  return (
    <View style={S.wrap}>
      <ScrollView
        ref={scrollRef}
        style={S.scroll}
        contentContainerStyle={S.content}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onLayout={() => {
          scrollRef.current?.scrollTo({
            y: currentIdx.current * ITEM_H,
            animated: false,
          });
        }}
        onMomentumScrollEnd={e => {
          const idx = Math.round(
            e.nativeEvent.contentOffset.y / ITEM_H
          );
          const clamped = Math.max(0, Math.min(STEPS.length - 1, idx));
          currentIdx.current = clamped;
          onChange(STEPS[clamped]);
        }}
        onScrollEndDrag={e => {
          const idx = Math.round(
            e.nativeEvent.contentOffset.y / ITEM_H
          );
          const clamped = Math.max(0, Math.min(STEPS.length - 1, idx));
          currentIdx.current = clamped;
          onChange(STEPS[clamped]);
          scrollRef.current?.scrollTo({
            y: clamped * ITEM_H,
            animated: true,
          });
        }}
      >
        {STEPS.map(v => (
          <View key={v} style={S.item}>
            <Text style={[
              S.txt,
              v === STEPS[currentIdx.current] && S.txtSel,
            ]}>
              {v} min
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={S.lineTop} pointerEvents="none" />
      <View style={S.lineBot} pointerEvents="none" />
      <View style={S.fadeTop} pointerEvents="none" />
      <View style={S.fadeBot} pointerEvents="none" />
    </View>
  );
}

const S = StyleSheet.create({
  wrap: {
    height: ITEM_H * 3,
    borderRadius: 12,
    backgroundColor: '#0D0D18',
    borderWidth: 1,
    borderColor: '#1C1C2C',
    overflow: 'hidden',
    position: 'relative',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingVertical: ITEM_H,
  },
  item: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txt: {
    color: '#333350',
    fontSize: 15,
    fontWeight: '500',
  },
  txtSel: {
    color: '#00FFCC',
    fontSize: 20,
    fontWeight: '700',
  },
  lineTop: {
    position: 'absolute',
    top: ITEM_H,
    left: 0, right: 0,
    height: 1,
    backgroundColor: '#C4A82250',
  },
  lineBot: {
    position: 'absolute',
    top: ITEM_H * 2,
    left: 0, right: 0,
    height: 1,
    backgroundColor: '#C4A82250',
  },
  fadeTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: ITEM_H - 4,
    backgroundColor: 'rgba(13,13,24,0.75)',
  },
  fadeBot: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: ITEM_H - 4,
    backgroundColor: 'rgba(13,13,24,0.75)',
  },
});
