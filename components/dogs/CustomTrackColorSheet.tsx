import { useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { normalizeTrackOverlayColor, trackColorForeground, type TrackOverlayColorValue } from '@/features/tracking/utils/trackOverlayColors';

const channels = ['redChannel', 'greenChannel', 'blueChannel'] as const;
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const hexFromRgb = (values: number[]) => `#${values.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Draft only; confirm is the sole path to the caller's existing save. */
export function CustomTrackColorSheet({ initialColor, onClose, onApply, disabled }: {
  initialColor: string; onClose: () => void;
  onApply: (value: TrackOverlayColorValue) => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState(initialColor);
  const [preview, setPreview] = useState(initialColor);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const close = () => { Keyboard.dismiss(); onClose(); };
  const valid = normalizeTrackOverlayColor(draft);
  const values = rgb(preview);
  const change = (text: string) => {
    setDraft(text); setFailed(false);
    const normalized = normalizeTrackOverlayColor(text);
    if (normalized?.startsWith('#')) setPreview(normalized);
  };
  const channel = (index: number, value: number) => {
    const next = [...values]; next[index] = value; change(hexFromRgb(next));
  };
  const apply = async () => {
    if (!valid?.startsWith('#') || disabled || pending.current) return;
    pending.current = true; setSaving(true); setFailed(false);
    try {
      const result = await onApply(valid);
      if (!alive.current) return;
      if (result === false) setFailed(true); else close();
    } catch { if (alive.current) setFailed(true); }
    finally { pending.current = false; if (alive.current) setSaving(false); }
  };
  return <AnyvoBottomSheet visible onClose={close} title={t('dog.trackColor.choose')} keyboardAware>
    <TouchableOpacity testID="custom-color-close" style={s.action} onPress={close} accessibilityRole="button"><Text style={s.label}>{t('common.cancel')}</Text></TouchableOpacity>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body} style={s.scroll}>
      <View testID="custom-color-preview" style={[s.preview, { backgroundColor: preview }]} accessible accessibilityLabel={`${t('dog.trackColor.preview')}: ${preview}`}>
        <Text style={[s.previewText, { color: trackColorForeground(preview) }]}>{preview}</Text>
      </View>
      {channels.map((key, index) => {
        const low = [...values]; low[index] = 0;
        const high = [...values]; high[index] = 255;
        return <View key={key} style={s.channel}>
          <Text style={s.label}>{t(`dog.trackColor.${key}`)} · {values[index]}</Text>
          <View style={s.controls}>
            <TouchableOpacity testID={`custom-color-minus-${index}`} disabled={saving || disabled} style={s.step} accessibilityRole="button" accessibilityLabel={`${t(`dog.trackColor.${key}`)} −`} onPress={() => channel(index, values[index] - 1)}><Text style={s.stepText}>−</Text></TouchableOpacity>
            <ChannelBar label={t(`dog.trackColor.${key}`)} value={values[index]} colors={[hexFromRgb(low), hexFromRgb(high)]} disabled={saving || disabled} onChange={v => channel(index, v)} />
            <TouchableOpacity testID={`custom-color-plus-${index}`} disabled={saving || disabled} style={s.step} accessibilityRole="button" accessibilityLabel={`${t(`dog.trackColor.${key}`)} +`} onPress={() => channel(index, values[index] + 1)}><Text style={s.stepText}>+</Text></TouchableOpacity>
          </View>
        </View>;
      })}
      <TextInput testID="custom-color-hex" value={draft} onChangeText={change} editable={!saving && !disabled} autoCapitalize="characters" autoCorrect={false} maxLength={7} accessibilityLabel="HEX" placeholder="#RRGGBB" style={s.input} />
      <Text style={s.hint}>{t('dog.trackColor.hexHint')}</Text>
      {failed && <Text accessibilityRole="alert" style={s.hint}>{t('dog.saveErrorPlain')}</Text>}
      <View style={s.actions}>
        <TouchableOpacity testID="custom-color-cancel" style={s.action} onPress={close} accessibilityRole="button"><Text style={s.label}>{t('common.cancel')}</Text></TouchableOpacity>
        <TouchableOpacity testID="custom-color-apply" style={[s.action, (!valid || saving || disabled) && s.disabled]} onPress={apply} disabled={!valid || saving || disabled} accessibilityRole="button" accessibilityState={{ disabled: !valid || saving || !!disabled, busy: saving }}><Text style={s.label}>{t(saving ? 'common.saving' : 'dog.trackColor.apply')}</Text></TouchableOpacity>
      </View>
    </ScrollView>
  </AnyvoBottomSheet>;
}

function ChannelBar({ label, value, colors, disabled, onChange }: {
  label: string; value: number; colors: [string, string]; disabled?: boolean; onChange: (value: number) => void;
}) {
  const [width, setWidth] = useState(0);
  return <View style={s.bar} onLayout={e => setWidth(e.nativeEvent.layout.width)} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 255, now: value }} accessibilityState={{ disabled: !!disabled }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => { if (!disabled) onChange(value + (e.nativeEvent.actionName === 'increment' ? 1 : -1)); }} onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled} onResponderGrant={e => { if (!disabled && width > 0) onChange(255 * e.nativeEvent.locationX / width); }} onResponderMove={e => { if (!disabled && width > 0) onChange(255 * e.nativeEvent.locationX / width); }}>
    <View pointerEvents="none" style={s.gradientWrap}><LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.gradient} /><View style={[s.thumb, { left: `${value / 255 * 100}%` }]} /></View>
  </View>;
}
const s = StyleSheet.create({
  scroll: { flexShrink: 1 }, body: { gap: 14, paddingBottom: 16 },
  preview: { minHeight: 72, borderWidth: 1, borderColor: '#888888', borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 12 },
  previewText: { fontWeight: '800', fontSize: 20 }, channel: { gap: 4 }, label: { color: C.trackText, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 }, step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: C.trackCard }, stepText: { color: C.trackText, fontSize: 24 },
  bar: { flex: 1, minHeight: 44, justifyContent: 'center' }, gradientWrap: { height: 20 }, gradient: { height: 20, borderRadius: 10 }, thumb: { position: 'absolute', top: -4, width: 8, height: 28, marginLeft: -4, borderRadius: 4, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#000000' },
  input: { color: C.trackText, fontSize: 17, minHeight: 48, padding: 12, borderWidth: 1, borderColor: C.trackBorder, borderRadius: 12 }, hint: { color: C.trackTextSec, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, action: { flexGrow: 1, minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder }, disabled: { opacity: 0.5 },
});
