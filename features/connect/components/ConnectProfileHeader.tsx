import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { SignedImage } from '@/components/ui/SignedImage';
import type { ConnectProfile, ConnectProfileVisibility } from '@/features/connect/types/connect.types';

const VIS_LABEL: Record<ConnectProfileVisibility, string> = {
  public: 'Öffentlich', friends: 'Nur Freunde', private: 'Privat',
};

// Kopfbereich des CONNECT-Profils: Avatar, Anzeigename, @username, Region, Bio.
// Reine Anzeige aus einem bereits geladenen ConnectProfile. Bestehende Tokens.
export function ConnectProfileHeader({
  profile, fallbackName, showRegion = true,
}: {
  profile: ConnectProfile | null;
  fallbackName?: string;
  showRegion?: boolean;
}) {
  const name = profile?.display_name?.trim() || fallbackName || 'Dein CONNECT-Profil';
  const username = profile?.username?.trim();
  const region = showRegion ? profile?.region_label?.trim() : null;
  const bio = profile?.bio?.trim();

  return (
    <View style={s.wrap}>
      <View style={s.avatar}>
        {profile?.avatar_path
          ? <SignedImage url={profile.avatar_path} style={StyleSheet.absoluteFill} contentFit="cover" />
          : <Ionicons name="person" size={30} color={C.accent} />}
      </View>
      <Text style={s.name} numberOfLines={1}>{name}</Text>
      {username ? <Text style={s.username} numberOfLines={1}>@{username}</Text> : null}

      <View style={s.metaRow}>
        {profile ? (
          <View style={s.pill}>
            <Ionicons name="eye-outline" size={12} color={C.muted} />
            <Text style={s.pillTxt}>{VIS_LABEL[profile.visibility]}</Text>
          </View>
        ) : null}
        {region ? (
          <View style={s.pill}>
            <Ionicons name="location-outline" size={12} color={C.muted} />
            <Text style={s.pillTxt}>{region}</Text>
          </View>
        ) : null}
      </View>

      {bio ? <Text style={s.bio}>{bio}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:    { alignItems: 'center', paddingVertical: 8, gap: 6 },
  avatar:  { width: 84, height: 84, borderRadius: 42, overflow: 'hidden', backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  name:    { fontSize: 20, color: C.white, fontWeight: '900', letterSpacing: -0.3, marginTop: 4 },
  username:{ fontSize: 13, color: C.accent, fontWeight: '700' },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' },
  pill:    { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.cardAlt, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: C.border },
  pillTxt: { fontSize: 11.5, color: C.muted, fontWeight: '700' },
  bio:     { fontSize: 13.5, color: C.subtle, lineHeight: 20, textAlign: 'center', marginTop: 6, paddingHorizontal: 12 },
});
