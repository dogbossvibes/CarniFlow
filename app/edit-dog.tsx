import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { C } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { getDogById, updateDog } from '@/services/dogs';
import { uploadDogImage } from '@/services/storage';
import { useSession } from '@/hooks/useSession';
import type { Dog } from '@/types';

type Geschlecht = 'male' | 'female' | null;

function isoZuCH(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}.${m}.${y}`;
}

export default function HundBearbeitenScreen() {
  const router      = useRouter();
  const { session } = useSession();
  const { id }      = useLocalSearchParams<{ id: string }>();

  const [hund,          setHund]          = useState<Dog | null>(null);
  const [laden,         setLaden]         = useState(true);
  const [name,          setName]          = useState('');
  const [rasse,         setRasse]         = useState('');
  const [geschlecht,    setGeschlecht]    = useState<Geschlecht>(null);
  const [geburtsDatCH,  setGeburtsDatCH]  = useState('');
  const [geburtsDatISO, setGeburtsDatISO] = useState<string | null>(null);
  const [gewicht,       setGewicht]       = useState('');
  const [titel,         setTitel]         = useState('');   // Leistungsabzeichen, kommagetrennt
  const [vater,         setVater]         = useState('');
  const [mutter,        setMutter]        = useState('');
  const [zwinger,       setZwinger]       = useState('');
  const [neuesBildUri,  setNeuesBildUri]  = useState<string | null>(null);
  const [fehler,        setFehler]        = useState<string | null>(null);
  const [speichern,     setSpeichern]     = useState(false);
  const [bildLaden,     setBildLaden]     = useState(false);

  useEffect(() => {
    if (!id) return;
    getDogById(id).then(({ data, error }) => {
      setLaden(false);
      if (error || !data) { setFehler('Hund konnte nicht geladen werden.'); return; }
      const d = data as Dog;
      setHund(d);
      setName(d.name);
      setRasse(d.breed ?? '');
      setGeschlecht(d.gender ?? null);
      setGeburtsDatCH(isoZuCH(d.birth_date));
      setGeburtsDatISO(d.birth_date);
      setGewicht(d.weight_kg != null ? String(d.weight_kg) : '');
      setTitel((d.titles ?? []).join(', '));
      setVater(d.sire ?? '');
      setMutter(d.dam ?? '');
      setZwinger(d.kennel ?? '');
    });
  }, [id]);

  const handleGeburtsDatChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    let formatted = cleaned;
    if (cleaned.length >= 2) formatted = cleaned.slice(0, 2) + '.' + cleaned.slice(2);
    if (cleaned.length >= 4) formatted = cleaned.slice(0, 2) + '.' + cleaned.slice(2, 4) + '.' + cleaned.slice(4, 8);
    setGeburtsDatCH(formatted);
    if (cleaned.length === 8) {
      setGeburtsDatISO(`${cleaned.slice(4, 8)}-${cleaned.slice(2, 4)}-${cleaned.slice(0, 2)}`);
    } else {
      setGeburtsDatISO(null);
    }
  };

  const bildAuswaehlen = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setFehler('Fotos nicht zugänglich — Einstellungen → Expo Go → Fotos → aktivieren');
      return;
    }
    setBildLaden(true);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    setBildLaden(false);
    if (!result.canceled && result.assets[0]) {
      setNeuesBildUri(result.assets[0].uri);
      setFehler(null);
    }
  };

  const handleSpeichern = async () => {
    if (!name.trim()) { setFehler('Bitte gib deinem Hund einen Namen 🐾'); return; }
    if (!session?.user.id || !hund) return;

    setSpeichern(true);
    setFehler(null);

    let photoUrl = hund.photo_url;

    if (neuesBildUri) {
      try {
        photoUrl = await uploadDogImage(neuesBildUri, session.user.id);
      } catch (uploadErr) {
        setSpeichern(false);
        setFehler(
          uploadErr instanceof Error
            ? `Foto noch nicht hochgeladen — versuch es nochmal!`
            : 'Foto noch nicht hochgeladen — versuch es nochmal!'
        );
        return;
      }
    }

    const titlesArr = titel
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const { error: err } = await updateDog(hund.id, {
      name:       name.trim(),
      breed:      rasse.trim() || null,
      gender:     geschlecht,
      birth_date: geburtsDatISO,
      weight_kg:  gewicht ? parseFloat(gewicht.replace(',', '.')) : null,
      photo_url:  photoUrl,
      titles:     titlesArr,
      sire:       vater.trim()   || null,
      dam:        mutter.trim()  || null,
      kennel:     zwinger.trim() || null,
    });

    setSpeichern(false);

    if (err) {
      setFehler(`Noch nicht gespeichert — versuch es nochmal!`);
      return;
    }

    router.back();
  };

  const aktuellesBild = neuesBildUri ?? hund?.photo_url ?? null;
  const angezeigtesBild = useSignedUrl(aktuellesBild);   // signiert ggf. das gespeicherte Foto

  if (laden) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.mitte}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.griff} />

      <View style={s.kopf}>
        <View>
          <Text style={s.augenbraue}>PROFIL BEARBEITEN</Text>
          <Text style={s.titel}>{hund?.name ?? 'Hund bearbeiten'}</Text>
        </View>
        <TouchableOpacity style={s.schliessenBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="close" size={18} color={C.white} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={s.kav} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* ── FOTO ── */}
          <TouchableOpacity style={s.bildKarte} onPress={bildAuswaehlen} activeOpacity={0.88} disabled={bildLaden}>
            {aktuellesBild ? (
              <>
                <Image source={{ uri: angezeigtesBild }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <LinearGradient
                  colors={['rgba(0,0,0,0.0)', 'rgba(0,0,0,0.45)']}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={s.bildAendernBadge}>
                  {bildLaden ? (
                    <ActivityIndicator size="small" color={C.white} />
                  ) : (
                    <>
                      <Ionicons name="camera" size={14} color={C.white} />
                      <Text style={s.bildAendernText}>Foto ändern</Text>
                    </>
                  )}
                </View>
              </>
            ) : (
              <>
                <LinearGradient
                  colors={[`${C.accent}18`, `${C.accent}06`, C.card]}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={s.bildPlaceholder}>
                  {bildLaden ? (
                    <ActivityIndicator size="large" color={C.accent} />
                  ) : (
                    <>
                      <View style={s.bildIconRing}>
                        <View style={s.bildIcon}>
                          <Ionicons name="camera-outline" size={30} color={C.accent} />
                        </View>
                      </View>
                      <Text style={s.bildPlaceholderTitel}>Foto hinzufügen</Text>
                      <Text style={s.bildPlaceholderUnter}>Wähle ein Bild aus deiner Galerie</Text>
                    </>
                  )}
                </View>
                <View style={s.bildRandAkzent} />
              </>
            )}
          </TouchableOpacity>

          <View style={s.felder}>
            <Input
              label="Name *"
              placeholder="z. B. Rex"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <Input
              label="Rasse"
              placeholder="z. B. Malinois"
              value={rasse}
              onChangeText={setRasse}
              autoCapitalize="words"
            />

            <View>
              <Text style={s.feldLabel}>GESCHLECHT</Text>
              <View style={s.geschlechtReihe}>
                {(['male', 'female'] as const).map((g) => {
                  const aktiv = geschlecht === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      style={[s.geschlechtBtn, aktiv && s.geschlechtBtnAktiv]}
                      onPress={() => setGeschlecht(g === geschlecht ? null : g)}
                      activeOpacity={0.75}
                    >
                      {aktiv && (
                        <LinearGradient
                          colors={['#00FFCC', '#00FFCC']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={StyleSheet.absoluteFill}
                        />
                      )}
                      <Ionicons
                        name={g === 'male' ? 'male' : 'female'}
                        size={15}
                        color={aktiv ? C.accentText : C.muted}
                      />
                      <Text style={[s.geschlechtText, aktiv && s.geschlechtTextAktiv]}>
                        {g === 'male' ? 'Rüde' : 'Hündin'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Input
              label="Geburtsdatum"
              placeholder="TT.MM.JJJJ"
              value={geburtsDatCH}
              onChangeText={handleGeburtsDatChange}
              keyboardType="numeric"
              maxLength={10}
            />

            <Input
              label="Gewicht (kg)"
              placeholder="z. B. 28.5"
              value={gewicht}
              onChangeText={setGewicht}
              keyboardType="decimal-pad"
            />

            <Input
              label="Leistungsabzeichen"
              placeholder="z. B. IGP 3, IBGH 3, Obedience"
              value={titel}
              onChangeText={setTitel}
              autoCapitalize="characters"
            />
          </View>

          <Text style={s.gruppeLabel}>ABSTAMMUNG</Text>
          <View style={s.felder}>
            <Input
              label="Vater"
              placeholder="Name des Vaters"
              value={vater}
              onChangeText={setVater}
              autoCapitalize="words"
            />
            <Input
              label="Mutter"
              placeholder="Name der Mutter"
              value={mutter}
              onChangeText={setMutter}
              autoCapitalize="words"
            />
            <Input
              label="Zuchtstätte"
              placeholder="z. B. vom Haus Milinski"
              value={zwinger}
              onChangeText={setZwinger}
              autoCapitalize="words"
            />
          </View>

          {fehler ? (
            <View style={s.fehlerBox}>
              <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
              <Text style={s.fehlerText}>{fehler}</Text>
            </View>
          ) : null}

          <Button label="Änderungen speichern" onPress={handleSpeichern} loading={speichern} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: C.bg },
  mitte: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  griff: {
    alignSelf:       'center',
    width:           36,
    height:          4,
    borderRadius:    2,
    backgroundColor: C.borderLight,
    marginTop:       10,
    marginBottom:    6,
  },
  kopf: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 20,
    paddingBottom:     20,
  },
  augenbraue: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
  titel:      { fontSize: 22, color: C.white, fontWeight: '900' },
  schliessenBtn: {
    width:           36,
    height:          36,
    borderRadius:    18,
    backgroundColor: C.card,
    borderWidth:     1,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
  },

  kav:    { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 48 },

  bildKarte: {
    height:          200,
    borderRadius:    24,
    marginBottom:    28,
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     C.border,
    backgroundColor: C.card,
  },
  bildPlaceholder: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            12,
  },
  bildIconRing: {
    width:          80,
    height:         80,
    borderRadius:   40,
    borderWidth:    1,
    borderColor:    `${C.accent}30`,
    alignItems:     'center',
    justifyContent: 'center',
  },
  bildIcon: {
    width:           64,
    height:          64,
    borderRadius:    32,
    backgroundColor: C.accentDim,
    alignItems:      'center',
    justifyContent:  'center',
  },
  bildPlaceholderTitel: { fontSize: 15, color: C.white, fontWeight: '700' },
  bildPlaceholderUnter: { fontSize: 13, color: C.muted },
  bildRandAkzent: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    height:          2,
    borderRadius:    2,
    backgroundColor: `${C.accent}40`,
  },
  bildAendernBadge: {
    position:          'absolute',
    bottom:            14,
    right:             14,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   'rgba(0,0,0,0.55)',
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical:   7,
  },
  bildAendernText: { fontSize: 12, color: C.white, fontWeight: '600' },

  felder:    { gap: 16, marginBottom: 22 },
  feldLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  gruppeLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 14 },

  geschlechtReihe: { flexDirection: 'row', gap: 12 },
  geschlechtBtn: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    height:          50,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     C.border,
    backgroundColor: C.input,
    overflow:        'hidden',
  },
  geschlechtBtnAktiv:  { borderColor: C.accent },
  geschlechtText:      { fontSize: 15, color: C.muted, fontWeight: '500' },
  geschlechtTextAktiv: { color: C.accentText, fontWeight: '700' },

  fehlerBox: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: C.dangerDim,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     `${C.danger}30`,
    padding:         12,
    marginBottom:    16,
  },
  fehlerText: { flex: 1, fontSize: 13, color: C.danger },
});
