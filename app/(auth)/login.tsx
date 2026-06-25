import { useEffect, useState } from 'react';
import {
  Dimensions,
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
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { C } from '@/constants/colors';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { DogIcon } from '@/components/ui/DogIcon';
import { signIn, signUp, signInWithGoogle, signInWithApple, isAppleAuthAvailable } from '@/services/auth';

const { height: SCREEN_H } = Dimensions.get('window');

type Tab = 'anmelden' | 'registrieren';

export default function LoginScreen() {
  const router = useRouter();

  const [tab,       setTab]       = useState<Tab>('anmelden');
  const [vollName,  setVollName]  = useState('');
  const [rolle,     setRolle]     = useState<'user' | 'trainer'>('user');
  const [email,     setEmail]     = useState('');
  const [passwort,  setPasswort]  = useState('');
  const [fehler,    setFehler]    = useState<string | null>(null);
  const [laden,     setLaden]     = useState(false);
  const [oauthLaden,setOauthLaden]= useState(false);
  const [erfolg,    setErfolg]    = useState(false);
  // Apple-Button nur zeigen, wenn nativ verfügbar (NICHT in Expo Go → sonst Crash).
  const [appleReady, setAppleReady] = useState(false);
  useEffect(() => {
    isAppleAuthAvailable().then(setAppleReady).catch(() => setAppleReady(false));
  }, []);

  const heroOp   = useSharedValue(0);
  const heroS    = useSharedValue(1.06);
  const brandOp  = useSharedValue(0);
  const brandY   = useSharedValue(16);
  const formOp   = useSharedValue(0);
  const formY    = useSharedValue(40);

  useEffect(() => {
    heroOp.value  = withTiming(1, { duration: 800, easing: Easing.out(Easing.exp) });
    heroS.value   = withTiming(1,  { duration: 1400, easing: Easing.out(Easing.exp) });
    brandOp.value = withDelay(300, withTiming(1, { duration: 700 }));
    brandY.value  = withDelay(300, withSpring(0, { damping: 20, stiffness: 100 }));
    formOp.value  = withDelay(550, withTiming(1, { duration: 700 }));
    formY.value   = withDelay(550, withSpring(0, { damping: 18, stiffness: 90 }));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      WebBrowser.warmUpAsync();
      return () => { WebBrowser.coolDownAsync(); };
    }
  }, []);

  const heroStyle  = useAnimatedStyle(() => ({ opacity: heroOp.value, transform: [{ scale: heroS.value }] }));
  const brandStyle = useAnimatedStyle(() => ({ opacity: brandOp.value, transform: [{ translateY: brandY.value }] }));
  const formStyle  = useAnimatedStyle(() => ({ opacity: formOp.value,  transform: [{ translateY: formY.value  }] }));

  const wechsleTab = (t: Tab) => { setTab(t); setFehler(null); setErfolg(false); };

  const handleAbsenden = async () => {
    if (!email.trim() || !passwort) {
      setFehler('Bitte E-Mail und Passwort eingeben');
      return;
    }
    setLaden(true); setFehler(null); setErfolg(false);

    if (tab === 'anmelden') {
      const { error: err } = await signIn(email.trim(), passwort);
      setLaden(false);
      if (err) { setFehler(uebersetzeFehler(err.message)); return; }
      router.replace('/(tabs)/home');
    } else {
      if (passwort.length < 6) {
        setLaden(false);
        setFehler('Passwort: mindestens 6 Zeichen');
        return;
      }
      const { data, error: err } = await signUp(email.trim(), passwort, vollName.trim() || undefined, rolle);
      setLaden(false);
      if (err) { setFehler(uebersetzeFehler(err.message)); return; }
      if (data.session) router.replace('/(tabs)/home');
      else setErfolg(true);
    }
  };

  const handleGoogle = async () => {
    setOauthLaden(true); setFehler(null);
    try {
      const { error, cancelled } = await signInWithGoogle();
      if (error) throw error;
      if (cancelled) return;
      router.replace('/(tabs)/home');
    } catch (err: unknown) {
      setFehler(err instanceof Error ? uebersetzeFehler(err.message) : 'Google-Anmeldung noch nicht geklappt — versuch es nochmal!');
    } finally { setOauthLaden(false); }
  };

  const handleApple = async () => {
    setOauthLaden(true); setFehler(null);
    try {
      const { error } = await signInWithApple();
      if (error) throw error;
      router.replace('/(tabs)/home');
    } catch (err: unknown) {
      setFehler(err instanceof Error ? uebersetzeFehler(err.message) : 'Apple-Anmeldung noch nicht geklappt — versuch es nochmal!');
    } finally { setOauthLaden(false); }
  };

  if (erfolg) {
    return (
      <View style={s.safe}>
        <LinearGradient colors={['rgba(5,5,5,0.5)', '#050505']} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={s.erfolgSafe}>
          <View style={s.erfolgWrap}>
            <View style={s.erfolgIcon}>
              <Ionicons name="mail-outline" size={40} color={C.accent} />
            </View>
            <Text style={s.erfolgTitel}>Postfach prüfen</Text>
            <Text style={s.erfolgText}>
              {'Wir haben einen Bestätigungslink an '}
              <Text style={{ color: C.white }}>{email}</Text>
              {' gesendet. Tippe drauf, um dein Konto zu aktivieren.'}
            </Text>
            <TouchableOpacity style={s.zurueckBtn} onPress={() => wechsleTab('anmelden')}>
              <Text style={s.zurueckBtnText}>Zurück zur Anmeldung</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.safe}>
      {/* ── Hintergrundbild ── */}
      <Animated.View style={[StyleSheet.absoluteFill, heroStyle]}>
        <Image
          source={require('@/assets/images/yam20.jpg')}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      </Animated.View>

      <LinearGradient
        colors={['rgba(5,5,5,0.55)', 'transparent']}
        style={s.vignetteOben}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(5,5,5,0.65)', 'rgba(5,5,5,0.92)', '#050505']}
        locations={[0, 0.35, 0.65, 1]}
        style={s.gradUnten}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(5,5,5,0.5)', 'transparent', 'rgba(5,5,5,0.5)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Branding ── */}
            <Animated.View style={[s.brandBlock, brandStyle]}>
              <View style={s.logoRow}>
                <View style={s.logoPill}>
                  <LinearGradient
                    colors={['#00FFCC', '#00FFCC']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <DogIcon size={15} color={C.accentText} />
                </View>
                <Text style={s.logoPillText}>ANYVO</Text>
              </View>
              <Text style={s.heroHeadline}>Trainiere{'\n'}Smarter.</Text>
              <Text style={s.heroSub}>Performance-Tracking für Hundesportler.</Text>
            </Animated.View>

            <View style={{ height: SCREEN_H * 0.06 }} />

            {/* ── Auth-Panel ── */}
            <Animated.View style={[s.authPanel, formStyle]}>
              <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={s.authPanelBorder} />

              {/* Tab-Wechsler */}
              <View style={s.tabRow}>
                {(['anmelden', 'registrieren'] as Tab[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.tabBtn, tab === t && s.tabBtnActive]}
                    onPress={() => wechsleTab(t)}
                    activeOpacity={0.85}
                  >
                    {tab === t && (
                      <LinearGradient
                        colors={['#00FFCC', '#00FFCC']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[StyleSheet.absoluteFill, { borderRadius: 10 }]}
                      />
                    )}
                    <Text style={[s.tabLabel, tab === t && s.tabLabelActive]}>
                      {t === 'anmelden' ? 'Anmelden' : 'Registrieren'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Formular */}
              <View style={s.form}>
                {tab === 'registrieren' && (
                  <Input
                    label="Vollständiger Name"
                    placeholder="Alex Müller"
                    value={vollName}
                    onChangeText={setVollName}
                    textContentType="name"
                    autoCapitalize="words"
                  />
                )}
                <Input
                  label="E-Mail"
                  placeholder="du@beispiel.de"
                  value={email}
                  onChangeText={(t) => { setEmail(t); setFehler(null); }}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                />
                <Input
                  label="Passwort"
                  placeholder={tab === 'registrieren' ? 'Mind. 6 Zeichen' : '••••••••'}
                  value={passwort}
                  onChangeText={(t) => { setPasswort(t); setFehler(null); }}
                  password
                  textContentType={tab === 'anmelden' ? 'password' : 'newPassword'}
                />
                {tab === 'registrieren' && (
                  <View>
                    <Text style={s.rolleLabel}>ICH BIN</Text>
                    <View style={s.rolleRow}>
                      {([
                        { id: 'user',    label: 'Hundeführer:in', icon: 'paw' },
                        { id: 'trainer', label: 'Trainer:in',     icon: 'ribbon' },
                      ] as const).map((r) => {
                        const aktiv = rolle === r.id;
                        return (
                          <TouchableOpacity
                            key={r.id}
                            style={[s.rolleChip, aktiv && s.rolleChipActive]}
                            onPress={() => setRolle(r.id)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name={r.icon} size={16} color={aktiv ? C.accent : C.muted} />
                            <Text style={[s.rolleChipTxt, aktiv && s.rolleChipTxtActive]}>{r.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>

              {fehler ? (
                <View style={s.fehlerBox}>
                  <Ionicons name="alert-circle-outline" size={15} color={C.danger} />
                  <Text style={s.fehlerText}>{fehler}</Text>
                </View>
              ) : null}

              <Button
                label={tab === 'anmelden' ? 'Anmelden' : 'Konto erstellen'}
                onPress={handleAbsenden}
                loading={laden}
              />

              <View style={s.trennRow}>
                <View style={s.trennLinie} />
                <Text style={s.trennText}>oder</Text>
                <View style={s.trennLinie} />
              </View>

              <AnimatedPressable
                onPress={handleGoogle}
                disabled={oauthLaden}
                style={[s.googleBtn, oauthLaden && { opacity: 0.5 }]}
              >
                {oauthLaden ? (
                  <Text style={s.googleText}>Verbinde…</Text>
                ) : (
                  <>
                    <Ionicons name="logo-google" size={17} color={C.white} />
                    <Text style={s.googleText}>Mit Google fortfahren</Text>
                  </>
                )}
              </AnimatedPressable>

              {appleReady && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={14}
                  style={s.appleBtn}
                  onPress={handleApple}
                />
              )}
            </Animated.View>

            <Text style={s.rechtlich}>
              Mit der Nutzung stimmst du unseren{' '}
              <Text style={s.rechtlichLink} onPress={() => router.push('/terms')}>AGB</Text>
              {' & '}
              <Text style={s.rechtlichLink} onPress={() => router.push('/privacy')}>Datenschutzrichtlinien</Text>
              {' '}zu.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function uebersetzeFehler(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'E-Mail oder Passwort nicht korrekt — nochmal versuchen?';
  if (msg.includes('Email not confirmed'))       return 'Fast da! Bitte bestätige zuerst deine E-Mail.';
  if (msg.includes('User already registered'))   return 'Diese E-Mail ist bereits dabei — einfach anmelden!';
  if (msg.includes('Password should be'))        return 'Passwort: mindestens 6 Zeichen';
  if (msg.includes('rate limit'))                return 'Kurze Pause — bitte einen Moment warten';
  if (msg.includes('network'))                   return 'Keine Verbindung — kurz Internet prüfen';
  return msg;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050505' },

  vignetteOben: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: SCREEN_H * 0.28,
  },
  gradUnten: {
    position: 'absolute',
    top:   SCREEN_H * 0.28,
    left: 0, right: 0,
    height: SCREEN_H * 0.72,
  },

  scroll: {
    flexGrow:          1,
    paddingHorizontal: 22,
    paddingBottom:     36,
    justifyContent:    'flex-end',
  },

  brandBlock: {
    paddingTop:    SCREEN_H * 0.12,
    paddingBottom: 8,
  },
  logoRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    marginBottom:   28,
  },
  logoPill: {
    width:        28,
    height:       28,
    borderRadius: 8,
    alignItems:   'center',
    justifyContent: 'center',
    overflow:     'hidden',
  },
  logoPillText: {
    fontSize:      13,
    color:         C.white,
    fontWeight:    '900',
    letterSpacing: 3,
  },
  heroHeadline: {
    fontSize:    58,
    color:       C.white,
    fontWeight:  '900',
    letterSpacing: -2,
    lineHeight:  58,
    marginBottom: 14,
  },
  heroSub: {
    fontSize:   15,
    color:      'rgba(255,255,255,0.65)',
    fontWeight: '500',
    lineHeight: 22,
    maxWidth:   280,
  },

  authPanel: {
    borderRadius:    24,
    overflow:        'hidden',
    padding:         20,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,10,10,0.6)',
  },
  authPanelBorder: {
    position:    'absolute',
    inset:       0,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,255,204,0.08)',
  },

  tabRow: {
    flexDirection:   'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius:    14,
    padding:         4,
    marginBottom:    20,
  },
  tabBtn: {
    flex:            1,
    paddingVertical: 10,
    borderRadius:    10,
    alignItems:      'center',
    overflow:        'hidden',
  },
  tabBtnActive:   {},
  tabLabel:       { fontSize: 14, color: 'rgba(255,255,255,0.45)', fontWeight: '600', zIndex: 1 },
  tabLabelActive: { color: C.accentText, fontWeight: '800', zIndex: 1 },

  form: { gap: 12, marginBottom: 16 },

  fehlerBox: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: C.dangerDim,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     `${C.danger}30`,
    padding:         12,
    marginBottom:    14,
  },
  fehlerText: { flex: 1, fontSize: 13, color: C.danger },

  trennRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    marginVertical: 16,
  },
  trennLinie: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  trennText:  { fontSize: 12, color: C.subtle, fontWeight: '500' },

  googleBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    height:          52,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  googleText: { fontSize: 15, color: C.white, fontWeight: '600' },
  appleBtn:   { height: 52, marginTop: 12 },

  rolleLabel:    { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  rolleRow:      { flexDirection: 'row', gap: 10 },
  rolleChip:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)' },
  rolleChipActive:    { borderColor: C.accent, backgroundColor: C.accentDim },
  rolleChipTxt:       { fontSize: 14, color: C.muted, fontWeight: '600' },
  rolleChipTxtActive: { color: C.white, fontWeight: '700' },

  rechtlich: {
    textAlign:  'center',
    fontSize:   11,
    color:      C.subtle,
    marginTop:  20,
    lineHeight: 16,
  },
  rechtlichLink: { color: C.accent, fontWeight: '700' },

  erfolgSafe: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  erfolgWrap: { alignItems: 'center', paddingHorizontal: 32 },
  erfolgIcon: {
    width:           88,
    height:          88,
    borderRadius:    28,
    backgroundColor: C.accentDim,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    24,
    borderWidth:     1,
    borderColor:     `${C.accent}30`,
  },
  erfolgTitel: { fontSize: 24, color: C.white, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  erfolgText:  { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22, marginBottom: 36 },
  zurueckBtn:      { paddingVertical: 14, paddingHorizontal: 32 },
  zurueckBtnText:  { fontSize: 16, color: C.accent, fontWeight: '700' },
});
