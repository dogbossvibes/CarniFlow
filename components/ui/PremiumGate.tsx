import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';

interface Props {
  feature:     string;
  description: string;
  children:    React.ReactNode;
  isPremium:   boolean;
}

export function PremiumGate({ feature, description, children, isPremium }: Props) {
  const router = useRouter();

  if (isPremium) return <>{children}</>;

  return (
    <TouchableOpacity
      style={S.gate}
      onPress={() => router.push('/premium')}
      activeOpacity={0.8}
    >
      <View style={S.lockWrap}>
        <LinearGradient
          colors={[`${C.accent}20`, `${C.accent}08`]}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name="lock-closed" size={22} color={C.accent} />
      </View>
      <Text style={S.feature}>{feature}</Text>
      <Text style={S.desc}>{description}</Text>
      <View style={S.btn}>
        <LinearGradient
          colors={['#00FFCC', '#00FFCC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name="star" size={13} color={C.accentText} />
        <Text style={S.btnTxt}>Premium — CHF 5.90 / Mt</Text>
      </View>
    </TouchableOpacity>
  );
}

const S = StyleSheet.create({
  gate: {
    borderWidth:     1.5,
    borderStyle:     'dashed',
    borderColor:     `${C.accent}25`,
    borderRadius:    16,
    padding:         22,
    alignItems:      'center',
    backgroundColor: C.card,
    gap:             8,
  },
  lockWrap: {
    width:           52,
    height:          52,
    borderRadius:    26,
    borderWidth:     1,
    borderColor:     `${C.accent}30`,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    4,
    overflow:        'hidden',
  },
  feature: { color: C.white,  fontSize: 15, fontWeight: '700' },
  desc:    { color: C.muted,  fontSize: 13, textAlign: 'center', lineHeight: 18 },
  btn: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             6,
    borderRadius:    12,
    paddingHorizontal: 20,
    paddingVertical: 11,
    marginTop:       4,
    overflow:        'hidden',
  },
  btnTxt: { color: C.accentText, fontSize: 13, fontWeight: '800' },
});
