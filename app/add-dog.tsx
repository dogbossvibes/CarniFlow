import { useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DateField } from '@/components/ui/DateField';
import { toISODate } from '@/features/dogs/dateInput';
import { addDog } from '@/services/dogs';
import { ChipSelect, DOG_DISCIPLINES, DOG_LEVELS } from '@/components/dogs/ChipSelect';
import { uploadDogImage } from '@/services/storage';
import { useSession } from '@/hooks/useSession';

type Geschlecht = 'male' | 'female' | null;

export default function HundHinzufuegenScreen() {
  const router      = useRouter();
  const { session } = useSession();

  const [name,        setName]        = useState('');
  const [rasse,       setRasse]       = useState('');
  const [geschlecht,  setGeschlecht]  = useState<Geschlecht>(null);
  const [birth,       setBirth]       = useState<Date | null>(null);
  const [gewichtKg,   setGewichtKg]   = useState('');
  const [titel,       setTitel]       = useState('');   // Leistungsabzeichen, kommagetrennt
  const [vater,       setVater]       = useState('');
  const [mutter,      setMutter]      = useState('');
  const [zwinger,     setZwinger]     = useState('');
  const [sparte,      setSparte]      = useState('');
  const [stufe,       setStufe]       = useState('');
  const [bestwert,    setBestwert]    = useState('');
  const [farbe,       setFarbe]       = useState('');
  const [mikrochip,   setMikrochip]   = useState('');
  const [tasso,       setTasso]       = useState(false);
  const [tierarzt,    setTierarzt]    = useState('');
  const [impfung,     setImpfung]     = useState('');
  const [futter,      setFutter]      = useState('');
  const [bildUri,     setBildUri]     = useState<string | null>(null);
  const [fehler,      setFehler]      = useState<string | null>(null);
  const [laden,       setLaden]       = useState(false);
  const [bildLaden,   setBildLaden]   = useState(false);

  const bildAuswaehlen = async () => {
    // Android: System Photo Picker (kein READ_MEDIA nötig). iOS: bestehender Flow.
    if (Platform.OS !== 'android') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setFehler('Fotos nicht zugänglich — Einstellungen → Expo Go → Fotos → aktivieren');
        return;
      }
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
      setBildUri(result.assets[0].uri);
      setFehler(null);
    }
  };

  const handleSpeichern = async () => {
    if (!name.trim()) { setFehler('Bitte gib deinem Hund einen Namen 🐾'); return; }
    if (!session?.user.id) return;

    setLaden(true);
    setFehler(null);

    let photoUrl: string | null = null;

    if (bildUri) {
      try {
        photoUrl = await uploadDogImage(bildUri, session.user.id);
      } catch (uploadErr) {
        setLaden(false);
        setFehler(
          uploadErr instanceof Error
            ? `Foto noch nicht hochgeladen — versuch es nochmal! (${uploadErr.message})`
            : 'Foto noch nicht hochgeladen — versuch es nochmal!'
        );
        return;
      }
    }

    const titlesArr = titel.split(',').map(t => t.trim()).filter(Boolean);

    const { error: err } = await addDog(session.user.id, {
      name:       name.trim(),
      breed:      rasse.trim() || null,
      gender:     geschlecht,
      birth_date: birth ? toISODate(birth) : null,
      weight_kg:  gewichtKg ? parseFloat(gewichtKg) : null,
      photo_url:  photoUrl,
      titles:     titlesArr,
      sire:       vater.trim()   || null,
      dam:        mutter.trim()  || null,
      kennel:     zwinger.trim() || null,
      discipline:       sparte.trim()    || null,
      level:            stufe.trim()     || null,
      best_score:       bestwert.trim()  || null,
      color:            farbe.trim()     || null,
      microchip_number: mikrochip.trim() || null,
      tasso_registered: tasso,
      vet:              tierarzt.trim()  || null,
      vaccination:      impfung.trim()   || null,
      food:             futter.trim()    || null,
      is_favorite:      false,
    });

    setLaden(false);
    if (err) {
      haptic.error();
      setFehler(`Noch nicht gespeichert — versuch es nochmal! (${err.message})`);
      return;
    }
    haptic.success();
    router.back();
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.griff} />

      <View style={s.kopf}>
        <View>
          <Text style={s.augenbraue}>NEUES PROFIL</Text>
          <Text style={s.titel}>Hund hinzufügen</Text>
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

          {/* ── BILDAUSWAHL ── */}
          <TouchableOpacity style={s.bildKarte} onPress={bildAuswaehlen} activeOpacity={0.88} disabled={bildLaden}>
            {bildUri ? (
              <>
                <Image source={{ uri: bildUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
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
                      <Text style={s.bildAendernText}>Ändern</Text>
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

            <DateField
              label="Geburtsdatum"
              value={birth}
              onChange={setBirth}
              onClear={() => setBirth(null)}
              maximumDate={new Date()}
              placeholder="Datum wählen"
            />

            <Input
              label="Gewicht (kg)"
              placeholder="z. B. 28,5"
              value={gewichtKg}
              onChangeText={setGewichtKg}
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
              label="Zuchtstätte / Zwinger"
              placeholder="z. B. vom Haus Milinski"
              value={zwinger}
              onChangeText={setZwinger}
              autoCapitalize="words"
            />
          </View>

          <Text style={s.gruppeLabel}>SPORT</Text>
          <View style={s.felder}>
            <ChipSelect label="SPARTE" options={DOG_DISCIPLINES} value={sparte} onChange={setSparte} />
            <ChipSelect label="STUFE" options={DOG_LEVELS} value={stufe} onChange={setStufe} />
            <Input label="Bestwert" placeholder="z. B. 98 / 96 / 97" value={bestwert} onChangeText={setBestwert} />
          </View>

          <Text style={s.gruppeLabel}>IDENTITÄT</Text>
          <View style={s.felder}>
            <Input label="Farbe" placeholder="z. B. schwarz-marken" value={farbe} onChangeText={setFarbe} autoCapitalize="words" />
            <Input label="Mikrochip-Nr." placeholder="15-stellige Chipnummer" value={mikrochip} onChangeText={setMikrochip} keyboardType="numbers-and-punctuation" />
            <TouchableOpacity style={[s.tassoRow, tasso && s.tassoRowAktiv]} onPress={() => setTasso(t => !t)} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={s.tassoTitel}>Bei Tasso registriert</Text>
                <Text style={s.tassoUnter}>Haustier-Zentralregister</Text>
              </View>
              <View style={[s.switch, tasso && s.switchOn]}>
                <View style={[s.knob, tasso && s.knobOn]} />
              </View>
            </TouchableOpacity>
          </View>

          <Text style={s.gruppeLabel}>GESUNDHEIT</Text>
          <View style={s.felder}>
            <Input label="Tierarzt" placeholder="Praxis / Name" value={tierarzt} onChangeText={setTierarzt} autoCapitalize="words" />
            <Input label="Impfung" placeholder="z. B. Tollwut 03/2026" value={impfung} onChangeText={setImpfung} />
            <Input label="Futter" placeholder="z. B. Royal Canin" value={futter} onChangeText={setFutter} autoCapitalize="words" />
          </View>

          {fehler ? (
            <View style={s.fehlerBox}>
              <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
              <Text style={s.fehlerText}>{fehler}</Text>
            </View>
          ) : null}

          <Button label="Hund speichern" onPress={handleSpeichern} loading={laden} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
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
    height:       200,
    borderRadius: 24,
    marginBottom: 28,
    overflow:     'hidden',
    borderWidth:  1,
    borderColor:  C.border,
    backgroundColor: C.card,
  },
  bildPlaceholder: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            12,
  },
  bildIconRing: {
    width:        80,
    height:       80,
    borderRadius: 40,
    borderWidth:  1,
    borderColor:  `${C.accent}30`,
    alignItems:   'center',
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
  bildPlaceholderTitel: {
    fontSize:   15,
    color:      C.white,
    fontWeight: '700',
  },
  bildPlaceholderUnter: {
    fontSize: 13,
    color:    C.muted,
  },
  bildRandAkzent: {
    position:     'absolute',
    top:          0,
    left:         0,
    right:        0,
    height:       2,
    borderRadius: 2,
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

  tassoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    height: 56, paddingHorizontal: 16, borderRadius: 14,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.input,
  },
  tassoRowAktiv: { borderColor: C.accent },
  tassoTitel: { fontSize: 15, color: C.white, fontWeight: '600' },
  tassoUnter: { fontSize: 12, color: C.muted, marginTop: 1 },
  switch: { width: 46, height: 28, borderRadius: 14, backgroundColor: C.border, padding: 3, justifyContent: 'center' },
  switchOn: { backgroundColor: C.accent },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
});
