import { StyleSheet, Switch, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { SignedImage } from '@/components/ui/SignedImage';
import { DogIcon } from '@/components/ui/DogIcon';

// Ein Hund in der Liste „Sichtbare Hunde": Foto, Name, Rasse + Sichtbar-Schalter.
// Nur eigene Hunde werden übergeben (Berechtigung: owner_id, zusätzlich RLS).
export function ConnectDogVisibilityCard({
  name, breed, photoUrl, visible, onToggle, disabled,
}: {
  name: string;
  breed?: string | null;
  photoUrl?: string | null;
  visible: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[s.card, disabled && { opacity: 0.6 }]}>
      <View style={s.avatar}>
        {photoUrl
          ? <SignedImage url={photoUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <DogIcon size={22} color={C.accent} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{name}</Text>
        <Text style={s.meta} numberOfLines={1}>
          {visible ? 'Für Freunde sichtbar' : 'Verborgen'}{breed ? ` · ${breed}` : ''}
        </Text>
      </View>
      <Switch
        value={visible}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: C.cardAlt, true: C.accentMid }}
        thumbColor={visible ? C.accent : C.muted}
        ios_backgroundColor={C.cardAlt}
        accessibilityLabel={`${name} in CONNECT sichtbar`}
      />
    </View>
  );
}

const s = StyleSheet.create({
  card:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  name:   { fontSize: 15, color: C.white, fontWeight: '800' },
  meta:   { fontSize: 12, color: C.muted, marginTop: 2 },
});
