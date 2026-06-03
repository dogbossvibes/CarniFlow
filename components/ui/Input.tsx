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

type Props = TextInputProps & {
  label?:    string;
  error?:    string;
  password?: boolean;
};

export function Input({ label, error, password, style, ...rest }: Props) {
  const [show,    setShow]    = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View style={s.wrap}>
      {label && <Text style={s.label}>{label}</Text>}
      <View style={[s.row, focused && s.rowFocused, error ? s.rowError : null]}>
        <TextInput
          style={[s.input, style]}
          placeholderTextColor={C.subtle}
          selectionColor={C.accent}
          secureTextEntry={password && !show}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {password && (
          <TouchableOpacity style={s.eye} onPress={() => setShow((v) => !v)}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { gap: 8 },
  label: { fontSize: 12, color: C.muted, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    height:            52,
    backgroundColor:   C.input,
    borderRadius:      12,
    borderWidth:       1,
    borderColor:       C.border,
    paddingHorizontal: 16,
  },
  rowFocused: { borderColor: C.accent },
  rowError:   { borderColor: C.danger },
  input:      { flex: 1, color: C.white, fontSize: 16 },
  eye:        { paddingLeft: 8 },
  error:      { fontSize: 12, color: C.danger },
});
