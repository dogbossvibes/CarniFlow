import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';

type Props = TextInputProps & {
  label?:    string;
  error?:    string;
  password?: boolean;
};

export function Input({ label, error, password, style, onFocus, onBlur, ...rest }: Props) {
  const [show,    setShow]    = useState(false);
  const [focused, setFocused] = useState(false);
  const { t } = useT();
  const canToggle = rest.editable !== false && !rest.readOnly;

  return (
    <View style={s.wrap}>
      {label && <Text style={s.label}>{label}</Text>}
      <View style={[s.row, focused && s.rowFocused, error ? s.rowError : null]}>
        <TextInput
          style={[s.input, style]}
          placeholderTextColor={C.textPlaceholder}
          selectionColor={C.accent}
          secureTextEntry={password && !show}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={event => { setFocused(true); onFocus?.(event); }}
          onBlur={event => { setFocused(false); onBlur?.(event); }}
          {...rest}
        />
        {password && (
          <TouchableOpacity style={s.eye} disabled={!canToggle}
            accessibilityRole="button" accessibilityState={{ disabled: !canToggle }}
            accessibilityLabel={[t(show ? 'auth.hidePassword' : 'auth.showPassword'), label].filter(Boolean).join(': ')}
            onPress={() => { if (canToggle) setShow((v) => !v); }}>
            <Ionicons accessible={false} name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { gap: 8 },
  label: { fontSize: 12, color: C.textMuted, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    minHeight:         52,
    backgroundColor:   C.input,
    borderRadius:      12,
    borderWidth:       1,
    borderColor:       C.border,
    paddingHorizontal: 16,
  },
  rowFocused: { borderColor: C.accent },
  rowError:   { borderColor: C.danger },
  input:      { flex: 1, minWidth: 0, color: C.white, fontSize: 16, paddingVertical: 12 },
  eye:        { minWidth: 48, minHeight: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  error:      { fontSize: 12, color: C.danger },
});
