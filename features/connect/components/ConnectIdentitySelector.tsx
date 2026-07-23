import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { SignedImage } from '@/components/ui/SignedImage';
import { DogIcon } from '@/components/ui/DogIcon';
import { identityKey, type ConnectPostingIdentity } from '@/features/connect/utils/postingIdentity';

// Wiederverwendbare Auswahl des sichtbaren Absenders (Halter oder berechtigter Hund).
// Nur Anzeige/Auswahl — die Berechtigung wird in buildPostingIdentities + RLS erzwungen.
export function ConnectIdentitySelector({
  identities, selected, onSelect,
}: {
  identities: ConnectPostingIdentity[];
  selected: ConnectPostingIdentity;
  onSelect: (id: ConnectPostingIdentity) => void;
}) {
  const selKey = identityKey(selected);
  return (
    <View>
      <Text style={s.label}>ALS WEN POSTEN?</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        {identities.map(id => {
          const active = identityKey(id) === selKey;
          return (
            <TouchableOpacity
              key={identityKey(id)}
              style={[s.chip, active && s.chipOn]}
              onPress={() => onSelect(id)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${id.type === 'dog' ? 'Hund' : 'Halter'}: ${id.displayName}`}
            >
              <View style={s.avatar}>
                {id.avatarUrl
                  ? <SignedImage url={id.avatarUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
                  : id.type === 'dog'
                    ? <DogIcon size={18} color={active ? C.accent : C.muted} />
                    : <Ionicons name="person" size={16} color={active ? C.accent : C.muted} />}
              </View>
              <View style={{ flexShrink: 1 }}>
                <Text style={[s.name, active && { color: C.white }]} numberOfLines={1}>{id.displayName}</Text>
                <Text style={s.type}>{id.type === 'dog' ? 'Hund' : 'Halter'}</Text>
              </View>
              {active && <Ionicons name="checkmark-circle" size={16} color={C.accent} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 9, color: C.muted, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  row:   { gap: 8, paddingRight: 8 },
  chip:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingVertical: 8, paddingHorizontal: 10, maxWidth: 200 },
  chipOn:{ borderColor: C.accent, backgroundColor: C.accentDim },
  avatar:{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  name:  { fontSize: 13, color: C.muted, fontWeight: '800' },
  type:  { fontSize: 10, color: C.subtle, fontWeight: '600' },
});
