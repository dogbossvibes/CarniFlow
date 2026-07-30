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
import { DateField } from '@/components/ui/DateField';
import { toISODate, fromISODate } from '@/features/dogs/dateInput';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { ChipSelect, DOG_DISCIPLINES, DOG_LEVELS } from '@/components/dogs/ChipSelect';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { getDogById, updateDog, deleteDogWithDependents } from '@/services/dogs';
import { uploadDogImage } from '@/services/storage';
import { useSession } from '@/hooks/useSession';
import { haptic } from '@/lib/haptics';
import { useT } from '@/i18n';
import type { Dog } from '@/types';

type Geschlecht = 'male' | 'female' | null;

export default function HundBearbeitenScreen() {
  const router      = useRouter();
  const { session } = useSession();
  const { id }      = useLocalSearchParams<{ id: string }>();
  const { t }       = useT();

  const [hund,          setHund]          = useState<Dog | null>(null);
  const [laden,         setLaden]         = useState(true);
  const [name,          setName]          = useState('');
  const [rasse,         setRasse]         = useState('');
  const [geschlecht,    setGeschlecht]    = useState<Geschlecht>(null);
  const [birth, setBirth] = useState<Date | null>(null);
  const [gewicht,       setGewicht]       = useState('');
  const [titel,         setTitel]         = useState('');   // Leistungsabzeichen, kommagetrennt
  const [vater,         setVater]         = useState('');
  const [mutter,        setMutter]        = useState('');
  const [zwinger,       setZwinger]       = useState('');
  // Sport
  const [sparte,        setSparte]        = useState('');
  const [stufe,         setStufe]         = useState('');
  const [bestwert,      setBestwert]      = useState('');
  // Identität
  const [farbe,         setFarbe]         = useState('');
  const [mikrochip,     setMikrochip]     = useState('');
  const [tasso,         setTasso]         = useState(false);
  // Gesundheit
  const [tierarzt,      setTierarzt]      = useState('');
  const [impfung,       setImpfung]       = useState('');
  const [futter,        setFutter]        = useState('');
  const [neuesBildUri,  setNeuesBildUri]  = useState<string | null>(null);
  const [fehler,        setFehler]        = useState<string | null>(null);
  const [speichern,     setSpeichern]     = useState(false);
  const [bildLaden,     setBildLaden]     = useState(false);
  const [loeschOffen,   setLoeschOffen]   = useState(false);
  const [loeschen,      setLoeschen]      = useState(false);

  useEffect(() => {
    if (!id) return;
    getDogById(id).then(({ data, error }) => {
      setLaden(false);
      if (error || !data) { setFehler(t('dog.loadError')); return; }
      const d = data as Dog;
      setHund(d);
      setName(d.name);
      setRasse(d.breed ?? '');
      setGeschlecht(d.gender ?? null);
      setBirth(fromISODate(d.birth_date));
      setGewicht(d.weight_kg != null ? String(d.weight_kg) : '');
      setTitel((d.titles ?? []).join(', '));
      setVater(d.sire ?? '');
      setMutter(d.dam ?? '');
      setZwinger(d.kennel ?? '');
      setSparte(d.discipline ?? '');
      setStufe(d.level ?? '');
      setBestwert(d.best_score ?? '');
      setFarbe(d.color ?? '');
      setMikrochip(d.microchip_number ?? '');
      setTasso(!!d.tasso_registered);
      setTierarzt(d.vet ?? '');
      setImpfung(d.vaccination ?? '');
      setFutter(d.food ?? '');
    });
  }, [id]);

  const bildAuswaehlen = async () => {
    // Android: System Photo Picker (kein READ_MEDIA nötig). iOS: bestehender Flow.
    if (Platform.OS !== 'android') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setFehler(t('dog.photoPermissionError'));
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
      setNeuesBildUri(result.assets[0].uri);
      setFehler(null);
    }
  };

  const handleSpeichern = async () => {
    if (!name.trim()) { setFehler(t('dog.nameRequired')); return; }
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
            ? t('dog.photoUploadError')
            : t('dog.photoUploadError')
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
      birth_date: birth ? toISODate(birth) : null,
      weight_kg:  gewicht ? parseFloat(gewicht.replace(',', '.')) : null,
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
    });

    setSpeichern(false);

    if (err) {
      haptic.error();
      setFehler(t('dog.saveErrorPlain'));
      return;
    }

    haptic.success();
    router.back();
  };

  const handleLoeschen = async () => {
    if (!hund) return;
    setLoeschen(true);
    const { error } = await deleteDogWithDependents(hund.id);
    setLoeschen(false);
    if (error) { haptic.error(); setLoeschOffen(false); setFehler(t('dog.deleteError')); return; }
    setLoeschOffen(false);
    router.replace('/dogs' as never);
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
          <Text style={s.augenbraue}>{t('dog.editProfileUpper')}</Text>
          <Text style={s.titel}>{hund?.name ?? t('dog.editTitle')}</Text>
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
                      <Text style={s.bildAendernText}>{t('dog.photoChangeFull')}</Text>
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
                      <Text style={s.bildPlaceholderTitel}>{t('dog.photoAdd')}</Text>
                      <Text style={s.bildPlaceholderUnter}>{t('dog.photoHint')}</Text>
                    </>
                  )}
                </View>
                <View style={s.bildRandAkzent} />
              </>
            )}
          </TouchableOpacity>

          <View style={s.felder}>
            <Input
              label={t('dog.name')}
              placeholder={t('dog.namePlaceholder')}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />

            <Input
              label={t('dog.breed')}
              placeholder={t('dog.breedPlaceholder')}
              value={rasse}
              onChangeText={setRasse}
              autoCapitalize="words"
            />

            <View>
              <Text style={s.feldLabel}>{t('dog.gender')}</Text>
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
                        {g === 'male' ? t('dog.male') : t('dog.female')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <DateField
              label={t('dog.birthDate')}
              value={birth}
              onChange={setBirth}
              onClear={() => setBirth(null)}
              maximumDate={new Date()}
              placeholder={t('dog.datePlaceholder')}
            />

            <Input
              label={t('dog.weight')}
              placeholder={t('dog.weightPlaceholder')}
              value={gewicht}
              onChangeText={setGewicht}
              keyboardType="decimal-pad"
            />

            <Input
              label={t('dog.titles')}
              placeholder={t('dog.titlesPlaceholder')}
              value={titel}
              onChangeText={setTitel}
              autoCapitalize="characters"
            />
          </View>

          <Text style={s.gruppeLabel}>{t('dog.lineage')}</Text>
          <View style={s.felder}>
            <Input
              label={t('dog.sire')}
              placeholder={t('dog.sirePlaceholder')}
              value={vater}
              onChangeText={setVater}
              autoCapitalize="words"
            />
            <Input
              label={t('dog.dam')}
              placeholder={t('dog.damPlaceholder')}
              value={mutter}
              onChangeText={setMutter}
              autoCapitalize="words"
            />
            <Input
              label={t('dog.kennel')}
              placeholder={t('dog.kennelPlaceholder')}
              value={zwinger}
              onChangeText={setZwinger}
              autoCapitalize="words"
            />
          </View>

          <Text style={s.gruppeLabel}>{t('dog.sport')}</Text>
          <View style={s.felder}>
            <ChipSelect label={t('dog.discipline')} options={DOG_DISCIPLINES} value={sparte} onChange={setSparte} />
            <ChipSelect label={t('dog.level')} options={DOG_LEVELS} value={stufe} onChange={setStufe} />
            <Input label={t('dog.bestScore')} placeholder={t('dog.bestScorePlaceholder')} value={bestwert} onChangeText={setBestwert} />
          </View>

          <Text style={s.gruppeLabel}>{t('dog.identity')}</Text>
          <View style={s.felder}>
            <Input label={t('dog.color')} placeholder={t('dog.colorPlaceholder')} value={farbe} onChangeText={setFarbe} autoCapitalize="words" />
            <Input label={t('dog.microchip')} placeholder={t('dog.microchipPlaceholder')} value={mikrochip} onChangeText={setMikrochip} keyboardType="numbers-and-punctuation" />
            <TouchableOpacity style={[s.tassoRow, tasso && s.tassoRowAktiv]} onPress={() => setTasso(t => !t)} activeOpacity={0.85}>
              <View style={{ flex: 1 }}>
                <Text style={s.tassoTitel}>{t('dog.tassoTitle')}</Text>
                <Text style={s.tassoUnter}>{t('dog.tassoSub')}</Text>
              </View>
              <View style={[s.switch, tasso && s.switchOn]}>
                <View style={[s.knob, tasso && s.knobOn]} />
              </View>
            </TouchableOpacity>
          </View>

          <Text style={s.gruppeLabel}>{t('dog.health')}</Text>
          <View style={s.felder}>
            <Input label={t('dog.vet')} placeholder={t('dog.vetPlaceholder')} value={tierarzt} onChangeText={setTierarzt} autoCapitalize="words" />
            <Input label={t('dog.vaccination')} placeholder={t('dog.vaccinationPlaceholder')} value={impfung} onChangeText={setImpfung} />
            <Input label={t('dog.food')} placeholder={t('dog.foodPlaceholder')} value={futter} onChangeText={setFutter} autoCapitalize="words" />
          </View>

          {fehler ? (
            <View style={s.fehlerBox}>
              <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
              <Text style={s.fehlerText}>{fehler}</Text>
            </View>
          ) : null}

          <Button label={t('dog.saveChanges')} onPress={handleSpeichern} loading={speichern} />

          <TouchableOpacity style={s.loeschBtn} onPress={() => setLoeschOffen(true)} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={16} color={C.danger} />
            <Text style={s.loeschText}>{t('dog.deleteDog')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bestätigungs-Sheet: Hund + abhängige Daten löschen */}
      <AnyvoBottomSheet visible={loeschOffen} onClose={() => { if (!loeschen) setLoeschOffen(false); }} title={t('dog.deleteDogQuestion')}>
        <Text style={s.loeschHinweis}>
          {t('dog.deleteDogBody', { dog: hund?.name ? `„${hund.name}"` : t('dog.thisDog') })}
        </Text>
        <View style={s.loeschAktionen}>
          <TouchableOpacity style={s.abbrechenBtn} onPress={() => setLoeschOffen(false)} disabled={loeschen} activeOpacity={0.8}>
            <Text style={s.abbrechenText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.endgueltigBtn} onPress={handleLoeschen} disabled={loeschen} activeOpacity={0.85}>
            {loeschen ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.endgueltigText}>{t('dog.deletePermanently')}</Text>}
          </TouchableOpacity>
        </View>
      </AnyvoBottomSheet>
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

  // Tasso-Toggle
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

  // Löschen
  loeschBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, height: 50, borderRadius: 14,
    borderWidth: 1, borderColor: `${C.danger}40`, backgroundColor: C.dangerDim,
  },
  loeschText: { fontSize: 14, color: C.danger, fontWeight: '700' },
  loeschHinweis: { fontSize: 14, color: C.trackTextSec, lineHeight: 21, marginBottom: 18 },
  loeschAktionen: { flexDirection: 'row', gap: 12, paddingBottom: 4 },
  abbrechenBtn: {
    flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  abbrechenText: { fontSize: 15, color: C.white, fontWeight: '700' },
  endgueltigBtn: {
    flex: 1.3, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.danger,
  },
  endgueltigText: { fontSize: 15, color: '#fff', fontWeight: '800' },
});
