import { useEffect, useState } from 'react';
import {
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { signIn, signUp, signInWithGoogle, signInWithApple, isAppleAuthAvailable } from '@/services/auth';
import { useT, type TranslationKey } from '@/i18n';

type Tab = 'anmelden' | 'registrieren';

const BG_ASPECT_RATIO = 7008 / 4672;

type AuthFieldProps = TextInputProps & {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  password?: boolean;
};

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useT();
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();

  const [tab,       setTab]       = useState<Tab>('anmelden');
  const [vollName,  setVollName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [passwort,  setPasswort]  = useState('');
  const [fehler,    setFehler]    = useState<string | null>(null);
  const [laden,     setLaden]     = useState(false);
  const [oauthLaden,setOauthLaden]= useState(false);
  const [erfolg,    setErfolg]    = useState(false);
  const isBusy = laden || oauthLaden;
  const isCompactHeight = viewportHeight < 2800 || viewportWidth < 1600;
  const isShortHeight = viewportHeight < 2880;
  const showTrust = tab === 'anmelden' && viewportHeight >= 2600;
  const bgWidth = viewportWidth * 1.25;
  const bgFocusStyle = {
    width:  bgWidth,
    height: bgWidth / BG_ASPECT_RATIO,
    left:   (viewportWidth - bgWidth) / 2,
    top:    -viewportHeight * 0.025,
  };
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
  }, [brandOp, brandY, formOp, formY, heroOp, heroS]);

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
      setFehler(t('auth.errorMissingCredentials'));
      return;
    }
    setLaden(true); setFehler(null); setErfolg(false);

    if (tab === 'anmelden') {
      const { error: err } = await signIn(email.trim(), passwort);
      setLaden(false);
      if (err) { setFehler(uebersetzeFehler(err.message, t)); return; }
      router.replace('/(tabs)/home');
    } else {
      if (passwort.length < 6) {
        setLaden(false);
        setFehler(t('auth.errorPasswordMin6'));
        return;
      }
      const { data, error: err } = await signUp(email.trim(), passwort, vollName.trim() || undefined);
      setLaden(false);
      if (err) { setFehler(uebersetzeFehler(err.message, t)); return; }
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
      setFehler(err instanceof Error ? uebersetzeFehler(err.message, t) : t('auth.errorGoogle'));
    } finally { setOauthLaden(false); }
  };

  const handleApple = async () => {
    setOauthLaden(true); setFehler(null);
    try {
      const { error } = await signInWithApple();
      if (error) throw error;
      router.replace('/(tabs)/home');
    } catch (err: unknown) {
      setFehler(err instanceof Error ? uebersetzeFehler(err.message, t) : t('auth.errorApple'));
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
            <Text style={s.erfolgTitel}>{t('auth.confirmInboxTitle')}</Text>
            <Text style={s.erfolgText}>
              {t('auth.confirmInboxPrefix')}
              <Text style={{ color: C.white }}>{email}</Text>
              {t('auth.confirmInboxSuffix')}
            </Text>
            <TouchableOpacity style={s.zurueckBtn} onPress={() => wechsleTab('anmelden')}>
              <Text style={s.zurueckBtnText}>{t('auth.backToLogin')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.safe}>
      <Animated.View style={[s.bgImageFrame, bgFocusStyle, heroStyle]} pointerEvents="none">
        <ImageBackground
          source={require('@/assets/images/bgyam-login.jpg')}
          style={s.bgImage}
          imageStyle={s.bgImageContent}
          resizeMode="cover"
        />
      </Animated.View>
      <LinearGradient
        colors={['rgba(5,5,5,0.48)', 'rgba(5,5,5,0.16)', 'rgba(5,5,5,0.62)', '#050505']}
        locations={[0, 0.32, 0.62, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(0,255,204,0.08)', 'transparent', 'rgba(5,5,5,0.34)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.9 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={s.safeArea}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[s.scroll, isCompactHeight && s.scrollCompact]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[
              s.brandBlock,
              isShortHeight && s.brandBlockShort,
              isCompactHeight && s.brandBlockCompact,
              brandStyle,
            ]}>
              <View style={s.logoRow}>
                <Image
                  source={require('@/assets/images/icon.png')}
                  style={[s.logoImg, isCompactHeight && s.logoImgCompact]}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
                <Text style={s.logoText}>ANYVO</Text>
              </View>
              <Text style={[s.heroHeadline, isCompactHeight && s.heroHeadlineCompact]}>
                {t('auth.heroTitle')}
              </Text>
              <Text style={s.heroSub}>
                {t('auth.heroSubPrefix')}{'\n'}
                <Text style={s.heroSubAccent}>{t('auth.heroSubAccent')}</Text>
              </Text>
            </Animated.View>

            <Animated.View style={[s.authPanel, isCompactHeight && s.authPanelCompact, formStyle]}>
              <View style={s.authPanelBorder} />

              <View style={[s.tabRow, isCompactHeight && s.tabRowCompact]}>
                {(['anmelden', 'registrieren'] as Tab[]).map((tabId) => (
                  <TouchableOpacity
                    key={tabId}
                    style={[s.tabBtn, isCompactHeight && s.tabBtnCompact, tab === tabId && s.tabBtnActive]}
                    onPress={() => wechsleTab(tabId)}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityState={{ selected: tab === tabId }}
                    accessibilityLabel={tabId === 'anmelden' ? t('auth.selectLogin') : t('auth.selectRegister')}
                  >
                    {tab === tabId && (
                      <LinearGradient
                        colors={['#00FFCC', '#00FFCC']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[StyleSheet.absoluteFill, { borderRadius: 10 }]}
                      />
                    )}
                    <Text style={[s.tabLabel, tab === tabId && s.tabLabelActive]}>
                      {tabId === 'anmelden' ? t('auth.loginUpper') : t('auth.registerUpper')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[s.form, tab === 'registrieren' && s.formRegister]}>
                {tab === 'registrieren' && (
                  <AuthField
                    label={t('auth.fullName')}
                    icon="person-outline"
                    placeholder={t('auth.nameExample')}
                    value={vollName}
                    onChangeText={setVollName}
                    textContentType="name"
                    autoCapitalize="words"
                  />
                )}
                <AuthField
                  label={t('auth.email')}
                  icon="mail-outline"
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChangeText={(t) => { setEmail(t); setFehler(null); }}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <AuthField
                  label={t('auth.password')}
                  icon="lock-closed-outline"
                  placeholder={tab === 'registrieren' ? t('auth.passwordMin') : '••••••••'}
                  value={passwort}
                  onChangeText={(t) => { setPasswort(t); setFehler(null); }}
                  password
                  textContentType={tab === 'anmelden' ? 'password' : 'newPassword'}
                />
                {tab === 'anmelden' && (
                  <TouchableOpacity
                    style={s.forgotBtn}
                    onPress={() => router.push('/auth/forgot-password' as never)}
                    activeOpacity={0.75}
                  >
                    <Text style={s.forgotText}>{t('auth.forgotPassword')}</Text>
                  </TouchableOpacity>
                )}
              </View>

              {fehler ? (
                <View style={s.fehlerBox}>
                  <Ionicons name="alert-circle-outline" size={15} color={C.danger} />
                  <Text style={s.fehlerText}>{fehler}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[s.primaryBtn, isCompactHeight && s.primaryBtnCompact, isBusy && s.disabled]}
                onPress={handleAbsenden}
                disabled={isBusy}
                activeOpacity={0.86}
                accessibilityRole="button"
                accessibilityLabel={tab === 'anmelden' ? t('auth.login') : t('auth.register')}
                accessibilityState={{ disabled: isBusy, busy: laden }}
              >
                {laden ? (
                  <Text style={s.primaryText}>{t('auth.wait')}</Text>
                ) : (
                  <Text style={s.primaryText}>{tab === 'anmelden' ? t('auth.loginUpper') : t('auth.registerUpper')}</Text>
                )}
              </TouchableOpacity>

              <View style={[s.trennRow, isCompactHeight && s.trennRowCompact]}>
                <View style={s.trennLinie} />
                <Text style={s.trennText}>{t('common.or')}</Text>
                <View style={s.trennLinie} />
              </View>

              <AnimatedPressable
                onPress={handleGoogle}
                disabled={isBusy}
                style={[s.socialBtn, isCompactHeight && s.socialBtnCompact, isBusy && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel={t('auth.googleLogin')}
              >
                {oauthLaden ? (
                  <Text style={s.socialText}>{t('auth.connecting')}</Text>
                ) : (
                  <>
                    <Ionicons name="logo-google" size={17} color={C.white} />
                    <Text style={s.socialText}>{t('auth.googleLogin')}</Text>
                  </>
                )}
              </AnimatedPressable>

              {appleReady && (
                <View style={[isBusy && { opacity: 0.5 }]} pointerEvents={isBusy ? 'none' : 'auto'}>
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                    cornerRadius={16}
                    style={[s.appleBtn, isCompactHeight && s.appleBtnCompact]}
                    onPress={handleApple}
                    accessibilityLabel={t('auth.appleLogin')}
                  />
                </View>
              )}

              <View style={s.modeSwitchRow}>
                <Text style={s.modeSwitchText}>
                  {tab === 'anmelden' ? t('auth.noAccount') : t('auth.hasAccount')}
                </Text>
                <TouchableOpacity
                  onPress={() => wechsleTab(tab === 'anmelden' ? 'registrieren' : 'anmelden')}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={tab === 'anmelden' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
                >
                  <Text style={s.modeSwitchLink}>{tab === 'anmelden' ? t('auth.register') : t('auth.login')}</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {showTrust && (
              <View style={s.trustRow}>
                <TrustItem title={t('auth.trustSecureTitle')} text={t('auth.trustSecureText')} />
                <TrustItem title={t('auth.trustSportTitle')} text={t('auth.trustSportText')} />
                <TrustItem title={t('auth.trustProgressTitle')} text={t('auth.trustProgressText')} />
                <TrustItem title={t('auth.trustTeamTitle')} text={t('auth.trustTeamText')} />
              </View>
            )}

            <Text style={[s.rechtlich, isCompactHeight && s.rechtlichCompact]}>
              {t('auth.legalPrefix')}
              <Text style={s.rechtlichLink} onPress={() => router.push('/terms')}>{t('auth.legalTerms')}</Text>
              {' & '}
              <Text style={s.rechtlichLink} onPress={() => router.push('/privacy')}>{t('auth.legalPrivacy')}</Text>
              {t('auth.legalSuffix')}
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function AuthField({ label, icon, password, style, ...rest }: AuthFieldProps) {
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const secure = Boolean(password && !show);

  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.inputRow, focused && s.inputRowFocus]}>
        <Ionicons name={icon} size={18} color={focused ? C.accent : C.muted} />
        <TextInput
          style={[s.input, style]}
          placeholderTextColor="rgba(255,255,255,0.34)"
          selectionColor={C.accent}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          {...rest}
        />
        {password && (
          <TouchableOpacity
            style={s.eyeBtn}
            onPress={() => setShow((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={show ? t('auth.hidePassword') : t('auth.showPassword')}
          >
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={C.muted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function TrustItem({ title, text }: { title: string; text: string }) {
  return (
    <View style={s.trustItem}>
      <Text style={s.trustTitle}>{title}</Text>
      <Text style={s.trustText}>{text}</Text>
    </View>
  );
}

function uebersetzeFehler(msg: string, t: (key: TranslationKey) => string): string {
  if (msg.toLowerCase().includes('invalid flow state')) return t('auth.errorGoogle');
  if (msg.includes('Invalid login credentials')) return t('auth.errorInvalidCredentials');
  if (msg.includes('Email not confirmed'))       return t('auth.errorEmailUnconfirmed');
  if (msg.includes('User already registered'))   return t('auth.errorAlreadyRegistered');
  if (msg.includes('Password should be'))        return t('auth.errorPasswordMin6');
  if (msg.includes('rate limit'))                return t('auth.errorRateLimit');
  if (msg.includes('network'))                   return t('auth.errorNetwork');
  return msg;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#050505' },
  bgImageFrame: { position: 'absolute' },
  bgImage: { width: '100%', height: '100%' },
  bgImageContent: { width: '100%', height: '100%' },
  safeArea: { flex: 1 },

  scroll: {
    flexGrow:          1,
    paddingHorizontal: 20,
    paddingTop:        16,
    paddingBottom:     Platform.OS === 'android' ? 92 : 72,
    justifyContent:    'flex-start',
    gap:               14,
  },
  scrollCompact: { paddingTop: 6, paddingBottom: Platform.OS === 'android' ? 96 : 76, gap: 8 },

  brandBlock: {
    minHeight:     112,
    justifyContent: 'flex-start',
    paddingTop:    2,
  },
  brandBlockShort: { minHeight: 132, paddingTop: 8 },
  brandBlockCompact: { minHeight: 112, paddingTop: 2 },
  logoRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    marginBottom:   14,
  },
  logoImg: { width: 34, height: 34 },
  logoImgCompact: { width: 34, height: 34 },
  logoText: { fontSize: 18, color: C.accent, fontWeight: '900', letterSpacing: 4 },
  heroHeadline: {
    fontSize:   26,
    color:      C.white,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 28,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 18,
  },
  heroHeadlineCompact: { fontSize: 26, lineHeight: 28, marginBottom: 4 },
  heroSub: {
    fontSize:   13,
    color:      'rgba(255,255,255,0.82)',
    fontWeight: '600',
    lineHeight: 18,
    maxWidth:   320,
  },
  heroSubAccent: { color: C.accent, fontWeight: '900' },

  authPanel: {
    borderRadius:    28,
    overflow:        'hidden',
    padding:         16,
    borderWidth:     1,
    borderColor:     'rgba(0,255,204,0.16)',
    backgroundColor: 'rgba(5,7,8,0.78)',
  },
  authPanelCompact: { padding: 12, borderRadius: 24, marginTop: 64 },
  authPanelBorder: {
    position:    'absolute',
    inset:       0,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  tabRow: {
    flexDirection:   'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius:    16,
    padding:         4,
    marginBottom:    14,
  },
  tabRowCompact: { marginBottom: 10 },
  tabBtn: {
    flex:            1,
    minHeight:       46,
    borderRadius:    12,
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'hidden',
  },
  tabBtnCompact: { minHeight: 40 },
  tabBtnActive:   {},
  tabLabel:       { fontSize: 13, color: 'rgba(255,255,255,0.58)', fontWeight: '800', letterSpacing: 0.8, zIndex: 1 },
  tabLabelActive: { color: C.accentText, fontWeight: '900', zIndex: 1 },

  form: { gap: 10, marginBottom: 12 },
  formRegister: { gap: 9, marginBottom: 10 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 10, color: 'rgba(255,255,255,0.66)', fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 15,
    gap: 10,
  },
  inputRowFocus: { borderColor: 'rgba(0,255,204,0.72)', backgroundColor: 'rgba(0,255,204,0.08)' },
  input: { flex: 1, minHeight: 38, color: C.white, fontSize: 15, fontWeight: '600' },
  eyeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  forgotBtn: { alignSelf: 'flex-end', paddingVertical: 2 },
  forgotText: { fontSize: 13, color: C.accent, fontWeight: '700' },

  fehlerBox: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: C.dangerDim,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     `${C.danger}30`,
    padding:         12,
    marginBottom:    12,
  },
  fehlerText: { flex: 1, fontSize: 13, color: C.danger },
  primaryBtn: {
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primaryBtnCompact: { minHeight: 42, borderRadius: 16 },
  disabled: { opacity: 0.55 },
  primaryText: { fontSize: 15, color: C.accentText, fontWeight: '900', letterSpacing: 1.1 },

  trennRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    marginVertical: 12,
  },
  trennRowCompact: { marginVertical: 10 },
  trennLinie: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  trennText:  { fontSize: 12, color: C.subtle, fontWeight: '500' },

  socialBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    minHeight:       42,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  socialBtnCompact: { minHeight: 40, borderRadius: 14 },
  socialText: { fontSize: 15, color: C.white, fontWeight: '700' },
  appleBtn:   { height: 42, marginTop: 6, width: '100%' },
  appleBtnCompact: { height: 40, marginTop: 5 },

  modeSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 12, flexWrap: 'wrap' },
  modeSwitchText: { fontSize: 13, color: 'rgba(255,255,255,0.62)', fontWeight: '600' },
  modeSwitchLink: { fontSize: 13, color: C.accent, fontWeight: '900' },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  trustItem: { flexBasis: '48%', flexGrow: 1, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(5,5,5,0.32)', padding: 12 },
  trustTitle: { fontSize: 12, color: C.white, fontWeight: '900', marginBottom: 3 },
  trustText: { fontSize: 11, color: 'rgba(255,255,255,0.58)', lineHeight: 15 },

  rechtlich: {
    textAlign:  'center',
    fontSize:   11,
    color:      C.subtle,
    marginTop:  12,
    lineHeight: 16,
  },
  rechtlichCompact: { marginTop: 8 },
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
