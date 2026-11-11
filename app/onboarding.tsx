import { useCallback, useEffect, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';
import { ALLE_SPARTEN, DEFAULT_SPARTEN } from '@/constants/sparten';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { Input } from '@/components/ui/Input';
import { DateField } from '@/components/ui/DateField';
import { toISODate } from '@/features/dogs/dateInput';
import { useSession } from '@/hooks/useSession';
import { useT, type TranslationKey } from '@/i18n';
import { haptic } from '@/lib/haptics';
import { registerForPush } from '@/lib/push';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { addDog } from '@/services/dogs';
import { markHelpSeen, useHelpSeen } from '@/stores/helpSeen';
import { completeOnboarding } from '@/stores/onboarding';

// Einführung beim ersten Start (4 Bildschirme, jeder Schritt überspringbar):
//   0 Willkommen · 1 Hund anlegen · 2 Sparten · 3 Mitteilungen + erster Schritt
// Einstieg ausschliesslich über das Gate im Tab-Layout (nur Konten ohne Hund).
// Datenwirkung: legt höchstens EINEN neuen Hund an und setzt
// profiles.aktive_sparten — nichts wird gelöscht oder überschrieben.

type Step = 0 | 1 | 2 | 3;
type Geschlecht = 'male' | 'female' | null;
type PushAnswer = 'open' | 'allowed' | 'declined';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const FIRST_STEPS: { key: 'Track' | 'Timer' | 'Document'; route: string; icon: IconName; color: string }[] = [
  { key: 'Track',    route: '/track',         icon: 'navigate',       color: C.trackPrimary },
  { key: 'Timer',    route: '/unit/timer',    icon: 'timer-outline',  color: C.sparteUnterordnung },
  { key: 'Document', route: '/unit/document', icon: 'create-outline', color: C.sparteObedience },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const { session, loading: sessionLoading } = useSession();
  const uid = session?.user.id;
  // Stellt sicher, dass der Hilfe-Store für diesen Nutzer geladen ist, bevor
  // beim Abschluss „home" als gesehen markiert wird.
  useHelpSeen(uid);

  const [step, setStep] = useState<Step>(0);

  // Schritt 1 — Hund
  const [name, setName]             = useState('');
  const [rasse, setRasse]           = useState('');
  const [geschlecht, setGeschlecht] = useState<Geschlecht>(null);
  const [birth, setBirth]           = useState<Date | null>(null);
  const [savedDogName, setSavedDogName] = useState<string | null>(null);
  const [dogError, setDogError]     = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);

  // Schritt 2 — Sparten (Vorbelegung = bisheriger App-Standard)
  const [sparten, setSparten] = useState<string[]>(DEFAULT_SPARTEN);

  // Schritt 3 — Mitteilungen
  const [push, setPush] = useState<PushAnswer>('open');

  const back = useCallback(() => {
    setStep(prev => (prev > 0 ? ((prev - 1) as Step) : prev));
  }, []);

  // Android-Zurück: einen Schritt zurück statt die Einführung zu verlassen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 0) { back(); return true; }
      return true; // auf „Willkommen" bewusst nichts tun (kein Sprung in leere Tabs)
    });
    return () => sub.remove();
  }, [step, back]);

  // Abschluss: Merker setzen, Hilfe-Hinweis der Startseite nicht direkt danach
  // automatisch öffnen, dann auf Start (und optional in den gewählten Bereich).
  const finish = (route?: string) => {
    // Ohne ausdrückliches „Erlauben" gilt „Nicht jetzt" — die System-Abfrage
    // erscheint nie ohne Erklärung. Später einschaltbar im Profil.
    completeOnboarding({ pushDeclined: push !== 'allowed' });
    markHelpSeen('home');
    router.replace('/(tabs)/home');
    if (route) setTimeout(() => router.push(route as never), 0);
  };

  const saveDog = async () => {
    if (savedDogName) { setStep(2); return; }
    if (!name.trim()) { setDogError(t('dog.nameRequired')); return; }
    if (!uid) { setDogError(t('dog.saveErrorPlain')); return; }
    setSaving(true);
    setDogError(null);
    try {
      const { error } = await addDog(uid, {
        name:       name.trim(),
        breed:      rasse.trim() || null,
        gender:     geschlecht,
        birth_date: birth ? toISODate(birth) : null,
        weight_kg:  null,
        photo_url:  null,
        titles:     [],
        sire:       null,
        dam:        null,
        kennel:     null,
        discipline: null,
        color:      null,
        microchip_number: null,
        tasso_registered: false,
        registry_country_code: null,
        registry_type:   null,
        registry_name:   null,
        registry_number: null,
        vet:         null,
        food:        null,
        is_favorite: false,
      });
      if (error) {
        haptic.error();
        setDogError(t('dog.saveError', { message: error.message }));
        return;
      }
      haptic.success();
      setSavedDogName(name.trim());
      setStep(2);
    } catch (e) {
      haptic.error();
      setDogError(e instanceof Error ? t('dog.saveError', { message: e.message }) : t('dog.saveErrorPlain'));
    } finally {
      setSaving(false);
    }
  };

  const toggleSparte = (id: string) => {
    setSparten(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  // Best-effort wie im Profil („Meine Sparten"); ein Fehler hält die Einführung
  // nicht auf — die Auswahl lässt sich im Profil jederzeit nachholen.
  const saveSparten = async () => {
    setStep(3);
    if (!uid || sparten.length === 0) return;
    try {
      await supabase.from('profiles').update({ aktive_sparten: sparten }).eq('id', uid);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    } catch { /* best-effort */ }
  };

  const allowPush = async () => {
    setPush('allowed');
    if (uid) await registerForPush(uid);
  };

  if (!sessionLoading && !session) return <Redirect href="/(auth)/login" />;

  // ── 0 · Willkommen ──────────────────────────────────────────────────────
  if (step === 0) {
    return (
      <View style={s.root}>
        <Image
          source={require('@/assets/images/yam20.jpg')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition="top"
          accessible={false}
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.96)']}
          locations={[0, 0.3, 0.55, 0.85]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[s.welcome, { paddingBottom: 24 + insets.bottom }]}>
          <View accessible accessibilityRole="header" accessibilityLabel="Train. Analyze. Improve.">
            <Text style={s.slogan}>TRAIN.</Text>
            <Text style={[s.slogan, s.sloganGrau]}>ANALYZE.</Text>
            <Text style={[s.slogan, s.sloganAkzent]}>IMPROVE.</Text>
          </View>
          <Text style={s.tagline}>{t('onboarding.tagline')}</Text>
          <AnyvoButton label={t('onboarding.start')} onPress={() => setStep(1)} big />
          <TouchableOpacity
            style={s.textBtn}
            onPress={() => finish()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.later')}
          >
            <Text style={s.textBtnTxtHell}>{t('onboarding.later')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── 1–3 · Schritte ──────────────────────────────────────────────────────
  const titel =
    step === 1 ? t('onboarding.dogTitle') :
    step === 2 ? t('onboarding.spartenTitle') :
    savedDogName ? t('onboarding.readyTitleDog', { name: savedDogName }) : t('onboarding.readyTitle');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.kopf}>
          <TouchableOpacity
            style={s.backBtn}
            onPress={back}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="chevron-back" size={20} color={C.white} />
          </TouchableOpacity>
          <View
            style={s.fortschritt}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('onboarding.stepOf', { n: step })}
            accessibilityValue={{ min: 0, max: 3, now: step }}
          >
            {[1, 2, 3].map(i => <View key={i} style={[s.balken, i <= step && s.balkenAn]} />)}
          </View>
        </View>

        <ScrollView
          style={s.flex}
          contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={s.augenbraue}>{t('onboarding.stepOf', { n: step })}</Text>
            <Text style={s.titel} accessibilityRole="header">{titel}</Text>
          </View>

          {step === 1 && (
            savedDogName ? (
              <View style={s.karte}>
                <View style={s.zeile}>
                  <Ionicons name="checkmark-circle" size={22} color={C.trackPrimary} />
                  <Text style={s.karteTitel}>{t('onboarding.dogSaved', { name: savedDogName })}</Text>
                </View>
                <Text style={s.hinweis}>{t('onboarding.dogHint')}</Text>
              </View>
            ) : (
              <>
                <Input
                  label={t('dog.name')}
                  placeholder={t('dog.namePlaceholder')}
                  value={name}
                  onChangeText={v => { setName(v); setDogError(null); }}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                <Input
                  label={t('dog.breed')}
                  placeholder={t('dog.breedPlaceholder')}
                  value={rasse}
                  onChangeText={setRasse}
                  autoCapitalize="words"
                />
                <View>
                  <Text style={s.label}>{t('dog.gender')}</Text>
                  <View style={s.zeile}>
                    {(['male', 'female'] as const).map(g => {
                      const an = geschlecht === g;
                      return (
                        <TouchableOpacity
                          key={g}
                          style={[s.wahl, an && s.wahlAn]}
                          onPress={() => setGeschlecht(an ? null : g)}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityState={{ selected: an }}
                          accessibilityLabel={t(g === 'male' ? 'dog.male' : 'dog.female')}
                        >
                          <Text style={[s.wahlTxt, an && s.wahlTxtAn]}>{t(g === 'male' ? 'dog.male' : 'dog.female')}</Text>
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
                />
                <Text style={s.hinweis}>{t('onboarding.dogHint')}</Text>
                {dogError ? <Text style={s.fehler} accessibilityRole="alert">{dogError}</Text> : null}
              </>
            )
          )}

          {step === 2 && (
            <>
              <Text style={s.hinweis}>{t('onboarding.spartenHint')}</Text>
              <View style={s.chips}>
                {ALLE_SPARTEN.map(sp => {
                  const an = sparten.includes(sp.id);
                  return (
                    <TouchableOpacity
                      key={sp.id}
                      style={[s.chip, an && s.chipAn]}
                      onPress={() => { haptic.light(); toggleSparte(sp.id); }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityState={{ selected: an }}
                      accessibilityLabel={sp.label}
                    >
                      <Text style={[s.chipTxt, an && s.chipTxtAn]}>{sp.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {step === 3 && (
            <>
              <View style={s.karte}>
                <Text style={s.karteTitel}>{t('onboarding.pushTitle')}</Text>
                {push === 'open' ? (
                  <>
                    <Text style={s.hinweis}>{t('onboarding.pushText')}</Text>
                    <View style={s.zeile}>
                      <AnyvoButton label={t('onboarding.pushAllow')} onPress={allowPush} style={s.flex} />
                      <AnyvoButton label={t('onboarding.pushNotNow')} onPress={() => setPush('declined')} variant="secondary" style={s.flex} />
                    </View>
                  </>
                ) : (
                  <Text style={s.hinweis}>{t(push === 'allowed' ? 'onboarding.pushDone' : 'onboarding.pushLater')}</Text>
                )}
              </View>

              <Text style={s.augenbraue}>{t('onboarding.firstStep')}</Text>
              {FIRST_STEPS.map(o => (
                <TouchableOpacity
                  key={o.key}
                  style={[s.karte, s.option]}
                  onPress={() => { haptic.light(); finish(o.route); }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t(`onboarding.opt${o.key}` as TranslationKey)}
                  accessibilityHint={t(`onboarding.opt${o.key}Sub` as TranslationKey)}
                >
                  <View style={[s.optIcon, { backgroundColor: `${o.color}26` }]}>
                    <Ionicons name={o.icon} size={20} color={o.color} />
                  </View>
                  <View style={s.flex}>
                    <Text style={s.karteTitel}>{t(`onboarding.opt${o.key}` as TranslationKey)}</Text>
                    <Text style={s.optSub}>{t(`onboarding.opt${o.key}Sub` as TranslationKey)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.trackTextSec} />
                </TouchableOpacity>
              ))}
            </>
          )}

          <View style={s.fuss}>
            {step === 1 && (
              <AnyvoButton label={t('common.next')} onPress={saveDog} loading={saving} big />
            )}
            {step === 2 && (
              <AnyvoButton label={t('common.next')} onPress={saveSparten} big />
            )}
            <TouchableOpacity
              style={s.textBtn}
              onPress={() => (step === 3 ? finish() : setStep((step + 1) as Step))}
              disabled={saving}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t(step === 3 ? 'onboarding.lookAround' : 'onboarding.skip')}
            >
              <Text style={s.textBtnTxt}>{t(step === 3 ? 'onboarding.lookAround' : 'onboarding.skip')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.trackBg },
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },

  // Willkommen
  welcome:      { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, gap: 14 },
  slogan:       { fontSize: 34, fontWeight: '800', color: C.white, letterSpacing: 1.5, lineHeight: 40 },
  sloganGrau:   { color: C.trackTextSec },
  sloganAkzent: { color: C.trackPrimary },
  tagline:      { fontSize: 16, color: 'rgba(255,255,255,0.78)', lineHeight: 23, marginBottom: 6 },

  // Schritte
  kopf:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  backBtn:     { width: 44, height: 44, borderRadius: 14, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', justifyContent: 'center' },
  fortschritt: { flex: 1, flexDirection: 'row', gap: 6 },
  balken:      { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.trackCardAlt },
  balkenAn:    { backgroundColor: C.trackPrimary },

  scroll:     { paddingHorizontal: 20, paddingTop: 8, gap: 16, flexGrow: 1 },
  augenbraue: { fontSize: 12, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 4 },
  titel:      { fontSize: 28, color: C.white, fontWeight: '900', letterSpacing: -0.5, lineHeight: 34 },
  label:      { fontSize: 12, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  hinweis:    { fontSize: 14, color: C.trackTextSec, lineHeight: 20 },
  fehler:     { fontSize: 14, color: C.trackDanger, lineHeight: 20, fontWeight: '600' },

  zeile:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wahl:      { flex: 1, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  wahlAn:    { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  wahlTxt:   { fontSize: 15, color: C.white, fontWeight: '700' },
  wahlTxtAn: { color: '#04201b' },

  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip:      { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  chipAn:    { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary },
  chipTxt:   { fontSize: 15, color: C.white, fontWeight: '600' },
  chipTxtAn: { color: '#04201b', fontWeight: '700' },

  karte:      { backgroundColor: C.trackCard, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, padding: 16, gap: 10 },
  karteTitel: { fontSize: 16, color: C.white, fontWeight: '700', flexShrink: 1 },
  option:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optIcon:    { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optSub:     { fontSize: 13, color: C.trackTextSec, marginTop: 2 },

  fuss:           { marginTop: 'auto', paddingTop: 12, gap: 4 },
  textBtn:        { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  textBtnTxt:     { fontSize: 15, color: C.trackTextSec, fontWeight: '600' },
  textBtnTxtHell: { fontSize: 15, color: 'rgba(255,255,255,0.78)', fontWeight: '600' },
});
