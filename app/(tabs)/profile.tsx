import { QuickAddSheet } from "@/components/QuickAddSheet";
import { AnimatedPressable } from "@/components/ui/AnimatedPressable";
import { Glass, isGlass } from "@/components/ui/Glass";
import { C } from "@/constants/colors";
import { useDogs } from "@/hooks/useDogs";
import { usePlan } from "@/hooks/usePlan";
import { useCapabilities } from "@/hooks/useCapabilities";
import { useAccess } from "@/hooks/useAccess";
import { reportScroll } from "@/stores/liveBarScroll";
import { useNotificationSetting } from "@/hooks/useNotificationSetting";
import { useAutoDetectSetting } from "@/hooks/useAutoDetectSetting";
import { useVolumeKeyArticleSetting } from "@/hooks/useVolumeKeyArticleSetting";
import { useCrashReporting } from "@/hooks/useCrashReporting";
import { useProfile } from "@/hooks/useProfile";
import { useSession } from "@/hooks/useSession";
import { useTrainingSessions } from "@/hooks/useTrainingSessions";
import { signOut, deleteAccount } from "@/services/auth";
import { getPlanSubscription, cancelTrial } from "@/services/subscriptionService";
import { setShareTrainingsDefault } from "@/services/profileService";
import { getMyInvitations } from "@/services/umfrageService";
import type { TrainerUmfrage } from "@/types/umfrage";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import { ALLE_SPARTEN, DEFAULT_SPARTEN } from "@/constants/sparten";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
    Alert,
    Image,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function EinstellungZeile({
  icon,
  label,
  wert,
  gefahr,
  onPress,
}: {
  icon: IconName;
  label: string;
  wert?: string;
  gefahr?: boolean;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={s.zeile}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View style={[s.zeileIcon, gefahr && s.zeileIconGefahr]}>
        <Ionicons name={icon} size={17} color={gefahr ? C.danger : C.muted} />
      </View>
      <Text style={[s.zeileLabel, gefahr && { color: C.danger }]}>{label}</Text>
      <View style={s.zeileRechts}>
        {wert && <Text style={s.zeileWert}>{wert}</Text>}
        {!gefahr && (
          <Ionicons name="chevron-forward" size={14} color={C.subtle} />
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function ProfilScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { dogs } = useDogs();
  const { sessions } = useTrainingSessions();
  const { profile, refresh: refreshProfile } = useProfile();

  const toggleShare = async (value: boolean) => {
    if (!user?.id) return;
    await setShareTrainingsDefault(user.id, value);
    refreshProfile();
  };

  const benachrichtigungen = useNotificationSetting(user?.id);
  const crashReporting = useCrashReporting();
  const winkelErkennung = useAutoDetectSetting();
  const volumeKeyArticle = useVolumeKeyArticleSetting();

  const showShortcutHelp = () => Alert.alert(
    'Gegenstand per Kurzbefehl',
    'So legst du dir einen Schnell-Gegenstand auf eine Taste:\n\n' +
    '1. App „Kurzbefehle" öffnen → neuen Kurzbefehl erstellen.\n' +
    '2. Aktion „URL öffnen" hinzufügen, URL: anyvo://track/quick-add-article\n' +
    '3. Den Kurzbefehl unter Einstellungen → Bedienungshilfen → Tippen → Auf Rückseite tippen ' +
    '(oder auf den Action-Button) zuweisen.\n\n' +
    'Während einer laufenden Fährtenaufnahme setzt das Auslösen einen Gegenstand.',
  );

  const [einladungen, setEinladungen] = useState<TrainerUmfrage[]>([]);
  useEffect(() => { if (user?.id) getMyInvitations(user.id).then(setEinladungen); }, [user?.id]);

  const [aktiveSparten, setAktiveSparten] = useState<string[]>(DEFAULT_SPARTEN);
  useEffect(() => { setAktiveSparten(profile?.aktive_sparten ?? DEFAULT_SPARTEN); }, [profile?.aktive_sparten]);

  const toggleSparte = async (id: string) => {
    const neu = aktiveSparten.includes(id) ? aktiveSparten.filter(x => x !== id) : [...aktiveSparten, id];
    setAktiveSparten(neu);
    if (!user?.id) return;
    await supabase.from('profiles').update({ aktive_sparten: neu }).eq('id', user.id);
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  const handleBenachrichtigungen = async (value: boolean) => {
    const { blocked } = await benachrichtigungen.toggle(value);
    if (blocked) {
      Alert.alert(
        "Benachrichtigungen blockiert",
        "Aktiviere Benachrichtigungen für ANYVO in den Systemeinstellungen, um Erinnerungen und Kommentare zu erhalten.",
        [
          { text: "Später", style: "cancel" },
          { text: "Einstellungen öffnen", onPress: benachrichtigungen.openSystemSettings },
        ]
      );
    }
  };

  const { expiresAt } = usePlan();
  const { isPro, isTrainerModule, plan } = useCapabilities();
  const { access } = useAccess();
  const PLAN_LABEL = { free: 'Free', pro: 'Active', trainer: 'Trainer' } as const;

  // Trial-Status fürs Abo-Karten-UI (Kündigen / gekündigt-Hinweis).
  const [trialSub, setTrialSub] = useState<{ status: string | null; trialEndsAt: string | null; cancelAtPeriodEnd: boolean } | null>(null);
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    getPlanSubscription(uid).then(s => { if (s) setTrialSub({ status: s.status, trialEndsAt: s.trial_ends_at, cancelAtPeriodEnd: s.cancel_at_period_end === true }); });
  }, [user?.id]);

  const trialEnd = trialSub?.trialEndsAt ? new Date(trialSub.trialEndsAt) : null;
  const isActiveTrial = trialSub?.status === 'trialing' && (!trialEnd || trialEnd.getTime() > Date.now());
  const trialEndLabel = trialEnd ? trialEnd.toLocaleDateString('de-CH') : null;
  const trialCancelled = trialSub?.cancelAtPeriodEnd === true;

  const handleCancelTrial = () => {
    const uid = user?.id; if (!uid) return;
    Alert.alert(
      'Testabo kündigen?',
      trialEndLabel
        ? `Dein Zugriff bleibt bis zum ${trialEndLabel} bestehen und läuft danach automatisch aus. Es wird nichts abgebucht.`
        : 'Dein Zugriff bleibt bis zum Ende der Testphase bestehen und läuft danach automatisch aus.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Kündigen', style: 'destructive', onPress: async () => {
          const { error } = await cancelTrial(uid);
          if (error) { Alert.alert('Hinweis', 'Kündigung fehlgeschlagen. Bitte später erneut versuchen.'); return; }
          setTrialSub(t => t ? { ...t, cancelAtPeriodEnd: true } : t);
          queryClient.invalidateQueries({ queryKey: ['capabilities'] });
          queryClient.invalidateQueries({ queryKey: ['userAccess'] });
        } },
      ],
    );
  };

  const anzeigeName = user?.user_metadata?.full_name ?? "Hundesportler";
  const email = user?.email ?? "";
  const initialen = anzeigeName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleAbmelden = () => {
    Alert.alert("Abmelden", "Möchtest du dich wirklich abmelden?", [
      { text: "Zurück", style: "cancel" },
      {
        text: "Abmelden",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const handleKontoLoeschen = () => {
    Alert.alert(
      "Konto löschen",
      "Alle deine Daten (Hunde, Trainingseinheiten, Notizen) werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
      [
        { text: "Zurück", style: "cancel" },
        {
          text: "Endgültig löschen",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Bist du sicher?",
              `Das Konto für ${email} wird dauerhaft gelöscht.`,
              [
                { text: "Zurück", style: "cancel" },
                {
                  text: "Ja, löschen",
                  style: "destructive",
                  onPress: async () => {
                    if (!user?.id) return;
                    // Vollständige Löschung serverseitig (Storage + auth.users CASCADE).
                    const { error } = await deleteAccount();
                    if (error) {
                      Alert.alert("Fehler", "Konto konnte nicht gelöscht werden. Bitte kontaktiere shadesofym@gmail.com.");
                      return;
                    }
                    router.replace("/(auth)/login");
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.inhalt}
        showsVerticalScrollIndicator={false}
        onScroll={(e) => reportScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Kopfzeile */}
        <View style={s.kopf}>
          <Text style={s.augenbraue}>DEIN KONTO</Text>
          <Text style={s.titel}>Profil</Text>
        </View>

        {/* Identitätskarte */}
        <View style={s.identitaet}>
          <LinearGradient
            colors={["#1A1A08", "#111111"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.avatarKreis}>
            <LinearGradient
              colors={[`${C.accent}30`, `${C.accent}10`]}
              style={StyleSheet.absoluteFill}
            />
            <Text style={s.avatarText}>{initialen || "?"}</Text>
          </View>
          <View style={s.identitaetInfo}>
            <Text style={s.anzeigeName}>{anzeigeName}</Text>
            <Text style={s.emailText}>{email}</Text>
          </View>
          <TouchableOpacity style={s.bearbeitenBtn} activeOpacity={0.7} onPress={() => router.push('/edit-profile')}>
            <Ionicons name="create-outline" size={17} color={C.muted} />
          </TouchableOpacity>
        </View>

        {/* Mitgliedschaft-Button unter der Identitätskarte */}
        <TouchableOpacity
          style={[s.planBtn, isPro && s.planBtnAktiv]}
          onPress={() => router.push('/premium')}
          activeOpacity={0.8}
        >
          {isPro && (
            <LinearGradient
              colors={[`${C.accent}15`, 'transparent']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <Ionicons
            name={isPro ? "star" : "star-outline"}
            size={15}
            color={isPro ? C.accent : C.muted}
          />
          <Text style={[s.planBtnText, isPro && s.planBtnTextAktiv]}>
            {plan === 'trainer' ? 'Trainer aktiv' : plan === 'pro' ? 'Active aktiv' : 'Upgrade auf Active'}
          </Text>
          {!isPro && (
            <Ionicons name="chevron-forward" size={14} color={C.subtle} />
          )}
        </TouchableOpacity>

        {/* Statistiken */}
        <View style={[s.statsReihe, isGlass && s.glassTransparent]}>{isGlass && <Glass style={s.glassBg} />}
          {[
            { label: "HUNDE", wert: String(dogs.length) },
            { label: "EINHEITEN", wert: String(sessions.length) },
            { label: "SERIE", wert: "—" },
          ].map(({ label, wert }, i, arr) => (
            <View
              key={label}
              style={[s.stat, i < arr.length - 1 && s.statTrenner]}
            >
              <Text style={s.statWert}>{wert}</Text>
              <Text style={s.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* Premium-Banner — nur für Free-User */}
        {!isPro && (
          <View style={s.proBanner}>
            <Image
              source={require("@/assets/images/yam20.jpg")}
              style={s.proBannerImg}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(5,5,5,0.2)", "rgba(5,5,5,0.55)", "rgba(5,5,5,0.92)"]}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <LinearGradient
              colors={["transparent", "rgba(0,255,204,0.08)"]}
              style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80 }}
              pointerEvents="none"
            />
            <LinearGradient
              colors={["rgba(5,5,5,0.6)", "transparent", "rgba(5,5,5,0.6)"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={s.proInhalt}>
              <View style={s.proAbzeichen}>
                <LinearGradient
                  colors={["#00FFCC", "#00FFCC"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={s.proAbzeichenText}>ACTIVE</Text>
              </View>
              <Text style={s.proUeberschrift}>
                Schalte dein{"\n"}volles Potenzial frei.
              </Text>
              <Text style={s.proUntertitel}>
                Erweiterte Analysen, unbegrenzte Einheiten, PDF-Export.
              </Text>
              <AnimatedPressable style={s.proBtn} onPress={() => router.push('/premium')} scale={0.97}>
                <LinearGradient
                  colors={["#00FFCC", "#00FFCC"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={s.proBtnText}>7 Tage gratis testen</Text>
              </AnimatedPressable>
            </View>
          </View>
        )}

        {/* Mitgliedschafts-Status — nur für Pro/Trainer */}
        {isPro && (
          <View style={s.premiumKarte}>
            <LinearGradient
              colors={["rgba(0,255,204,0.08)", "rgba(0,240,200,0.05)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={s.premiumKopf}>
              <View style={s.proAbzeichen}>
                <LinearGradient
                  colors={["#00FFCC", "#00FFCC"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={s.proAbzeichenText}>{isActiveTrial ? 'TESTPHASE' : access.isLifetime ? 'LIFETIME' : plan === 'trainer' ? 'TRAINER' : 'ACTIVE'}</Text>
              </View>
              <View style={s.premiumAktivBadge}>
                <Ionicons name="checkmark-circle" size={13} color={C.success} />
                <Text style={s.premiumAktivText}>Aktiv</Text>
              </View>
            </View>
            <Text style={s.premiumTitel}>
              {isActiveTrial
                ? 'Testphase aktiv'
                : access.isLifetime
                  ? (access.hasTrainerAccess ? 'Lifetime Trainer Zugriff aktiv' : 'Lifetime Zugriff aktiv')
                  : (plan === 'trainer' ? 'Trainer aktiv' : 'Active aktiv')}
            </Text>
            <Text style={s.premiumSub}>
              {isActiveTrial
                ? (trialCancelled
                    ? (trialEndLabel ? `Gekündigt — läuft am ${trialEndLabel} aus. Es wird nichts abgebucht.` : 'Gekündigt — läuft am Ende der Testphase aus.')
                    : (trialEndLabel ? `Kostenlos testen bis ${trialEndLabel}` : 'Kostenlose Testphase aktiv'))
                : access.isLifetime
                  ? 'Du hast lebenslangen Zugriff auf diese Funktionen.'
                  : expiresAt
                    ? `Verlängert sich am ${expiresAt.toLocaleDateString("de-CH")}`
                    : "Unbegrenzt aktiv"}
            </Text>
            {isActiveTrial && !trialCancelled && (
              <TouchableOpacity onPress={handleCancelTrial} activeOpacity={0.7} style={s.trialCancelBtn}>
                <Text style={s.trialCancelTxt}>Testabo kündigen</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Konto-Einstellungen */}
        <Text style={s.abschnitt}>KONTO</Text>
        <View style={[s.karte, isGlass && s.glassTransparent]}>{isGlass && <Glass style={s.glassBg} />}
          <View style={s.zeile}>
            <View style={s.zeileIcon}>
              <Ionicons name="notifications-outline" size={17} color={C.muted} />
            </View>
            <Text style={[s.zeileLabel, { flex: 1 }]}>Benachrichtigungen</Text>
            <Switch
              value={benachrichtigungen.enabled}
              onValueChange={handleBenachrichtigungen}
              disabled={benachrichtigungen.busy || !benachrichtigungen.loaded}
              trackColor={{ false: C.cardAlt, true: C.accent }}
              thumbColor={C.white}
            />
          </View>
          <View style={s.trenner} />
          <EinstellungZeile
            icon="home-outline"
            label="Startbildschirm"
            onPress={() => router.push('/home-customize')}
          />
          <View style={s.trenner} />
          <EinstellungZeile
            icon="sync-outline"
            label="Sync-Center"
            onPress={() => router.push('/sync')}
          />
          <View style={s.trenner} />
          <View style={s.zeile}>
            <View style={s.zeileIcon}>
              <Ionicons name="bug-outline" size={17} color={C.muted} />
            </View>
            <Text style={[s.zeileLabel, { flex: 1 }]}>Absturzberichte senden</Text>
            <Switch
              value={crashReporting.enabled}
              onValueChange={crashReporting.toggle}
              trackColor={{ false: C.cardAlt, true: C.accent }}
              thumbColor={C.white}
            />
          </View>
        </View>

        {/* Fährten-Einstellungen */}
        <Text style={s.abschnitt}>FÄHRTEN</Text>
        <View style={[s.karte, isGlass && s.glassTransparent]}>{isGlass && <Glass style={s.glassBg} />}
          <View style={s.zeile}>
            <View style={s.zeileIcon}>
              <Ionicons name="git-branch-outline" size={17} color={C.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.zeileLabel}>Winkel automatisch erkennen</Text>
              <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                Winkel, Spitzwinkel & Abriss. Gegenstände bleiben manuell.
              </Text>
            </View>
            <Switch
              value={winkelErkennung.autoDetect}
              onValueChange={(v) => void winkelErkennung.setAutoDetect(v)}
              disabled={!winkelErkennung.loaded}
              trackColor={{ false: C.cardAlt, true: C.accent }}
              thumbColor={C.white}
            />
          </View>

          <View style={s.trenner} />
          {Platform.OS === 'android' ? (
            <View style={s.zeile}>
              <View style={s.zeileIcon}>
                <Ionicons name="volume-high-outline" size={17} color={C.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.zeileLabel}>Lautstärke-Taste = Gegenstand</Text>
                <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  Während der Aufnahme setzt die Lautstärke-Taste einen Gegenstand.
                </Text>
              </View>
              <Switch
                value={volumeKeyArticle.enabled}
                onValueChange={(v) => void volumeKeyArticle.setEnabled(v)}
                disabled={!volumeKeyArticle.loaded}
                trackColor={{ false: C.cardAlt, true: C.accent }}
                thumbColor={C.white}
              />
            </View>
          ) : (
            <TouchableOpacity style={s.zeile} onPress={showShortcutHelp} activeOpacity={0.7}>
              <View style={s.zeileIcon}>
                <Ionicons name="flash-outline" size={17} color={C.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.zeileLabel}>Gegenstand per Kurzbefehl</Text>
                <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  Schnell-Gegenstand auf Back-Tap / Action-Button legen.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.muted} />
            </TouchableOpacity>
          )}
        </View>

        {__DEV__ && (
          <>
            <Text style={s.abschnitt}>ENTWICKLUNG</Text>
            <View style={[s.karte, isGlass && s.glassTransparent]}>{isGlass && <Glass style={s.glassBg} />}
              <TouchableOpacity style={s.zeile} onPress={() => router.push('/dev/dog-hub-preview' as never)} activeOpacity={0.7}>
                <View style={s.zeileIcon}><Ionicons name="cube-outline" size={17} color={C.muted} /></View>
                <Text style={[s.zeileLabel, { flex: 1 }]}>Dog Hub – Preview</Text>
                <Ionicons name="chevron-forward" size={18} color={C.muted} />
              </TouchableOpacity>
            </View>
          </>
        )}

        <Text style={s.abschnitt}>TRAINER</Text>
        <View style={[s.karte, isGlass && s.glassTransparent]}>{isGlass && <Glass style={s.glassBg} />}
          <EinstellungZeile
            icon="people-outline"
            label="Meine Trainer"
            onPress={() => router.push('/trainer')}
          />
          <View style={s.trenner} />
          <EinstellungZeile
            icon="clipboard-outline"
            label="Meine Trainingspläne"
            onPress={() => router.push('/plaene')}
          />
          <View style={s.trenner} />
          <EinstellungZeile
            icon="chatbubbles-outline"
            label="Nachrichten"
            onPress={() => router.push('/chat')}
          />
          <View style={s.trenner} />
          <EinstellungZeile
            icon="ribbon-outline"
            label={isTrainerModule ? 'Mein Trainer-Profil' : 'Trainer werden'}
            onPress={() => router.push('/trainer/edit')}
          />
          <View style={s.trenner} />
          <View style={s.zeile}>
            <View style={s.zeileIcon}>
              <Ionicons name="share-social-outline" size={17} color={C.muted} />
            </View>
            <Text style={[s.zeileLabel, { flex: 1 }]}>Neue Einheiten teilen</Text>
            <Switch
              value={profile?.share_trainings_default ?? false}
              onValueChange={toggleShare}
              trackColor={{ false: C.cardAlt, true: C.accent }}
              thumbColor={C.white}
            />
          </View>
        </View>

        {/* Trainer-Tools — nur mit Trainer-Modul */}
        <Text style={s.abschnitt}>TRAINER-TOOLS</Text>
        {isTrainerModule ? (
          <View style={[s.karte, isGlass && s.glassTransparent]}>{isGlass && <Glass style={s.glassBg} />}
            <EinstellungZeile icon="grid-outline" label="Trainer-Hub" onPress={() => router.push('/(tabs)/hub')} />
            <View style={s.trenner} />
            <EinstellungZeile icon="megaphone-outline" label="Terminumfrage erstellen" onPress={() => router.push('/umfrage')} />
            <View style={s.trenner} />
            <EinstellungZeile icon="stats-chart-outline" label="Meine Umfragen" onPress={() => router.push('/umfrage/meine')} />
          </View>
        ) : (
          <View style={s.gateCard}>
            <Text style={s.gateTitle}>Trainer-Modul freischalten</Text>
            <Text style={s.gateSub}>Verwalte Kunden, Trainingspläne, Umfragen und Chats — mit dem Trainer-Plan.</Text>
            <TouchableOpacity style={s.upgradeBtn} onPress={() => router.push('/premium')} activeOpacity={0.85}>
              <Text style={s.upgradeBtnTxt}>{isPro ? 'Trainer freischalten →' : '🔒 Trainer-Plan ansehen'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {einladungen.length > 0 && (
          <>
            <Text style={s.abschnitt}>EINLADUNGEN</Text>
            <View style={[s.karte, isGlass && s.glassTransparent]}>{isGlass && <Glass style={s.glassBg} />}
              {einladungen.map((u, i) => (
                <View key={u.id}>
                  <EinstellungZeile
                    icon="megaphone-outline"
                    label={`Umfrage von ${u.trainer_name}`}
                    wert={u.training_arten.join(', ') || undefined}
                    onPress={() => router.push(`/umfrage/${u.id}`)}
                  />
                  {i < einladungen.length - 1 && <View style={s.trenner} />}
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={s.abschnitt}>MEINE SPARTEN</Text>
        <View style={[s.karte, isGlass && s.glassTransparent]}>{isGlass && <Glass style={s.glassBg} />}
          <Text style={s.sparteHint}>Aktiviere die Sparten, die du trainierst. Sie erscheinen in der Trainingserfassung.</Text>
          {ALLE_SPARTEN.map((sp, i) => {
            const aktiv = aktiveSparten.includes(sp.id);
            return (
              <View key={sp.id}>
                <View style={s.zeile}>
                  <View style={[s.sparteIcon, aktiv && s.sparteIconOn]}>
                    <Text style={{ fontSize: 16 }}>{sp.icon}</Text>
                  </View>
                  <Text style={[s.zeileLabel, { flex: 1 }, !aktiv && { color: C.muted }]}>{sp.label}</Text>
                  <Switch
                    value={aktiv}
                    onValueChange={() => toggleSparte(sp.id)}
                    trackColor={{ false: C.cardAlt, true: C.accent }}
                    thumbColor={C.white}
                  />
                </View>
                {i < ALLE_SPARTEN.length - 1 && <View style={s.trenner} />}
              </View>
            );
          })}
        </View>

        <Text style={s.abschnitt}>SUPPORT</Text>
        <View style={[s.karte, isGlass && s.glassTransparent]}>{isGlass && <Glass style={s.glassBg} />}
          <EinstellungZeile
            icon="help-circle-outline"
            label="Hilfecenter"
            onPress={() => router.push('/help')}
          />
          <View style={s.trenner} />
          <EinstellungZeile
            icon="chatbubble-outline"
            label="Feedback senden"
            onPress={() =>
              Linking.openURL(`mailto:shadesofym@gmail.com?subject=${encodeURIComponent('ANYVO Feedback')}`)
                .catch(() => Alert.alert('Kein E-Mail-Programm', 'Schreib uns gern direkt an shadesofym@gmail.com.'))
            }
          />
          <View style={s.trenner} />
          <EinstellungZeile
            icon="document-text-outline"
            label="Nutzungsbedingungen (AGB)"
            onPress={() => router.push('/terms')}
          />
          <View style={s.trenner} />
          <EinstellungZeile
            icon="shield-checkmark-outline"
            label="Datenschutz"
            onPress={() => router.push('/privacy')}
          />
        </View>

        <View style={[s.karte, isGlass && s.glassTransparent, { marginBottom: 24 }]}>{isGlass && <Glass style={s.glassBg} />}
          <EinstellungZeile
            icon="log-out-outline"
            label="Abmelden"
            gefahr
            onPress={handleAbmelden}
          />
        </View>

        <View style={[s.karte, isGlass && s.glassTransparent, { marginBottom: 0 }]}>{isGlass && <Glass style={s.glassBg} />}
          <EinstellungZeile
            icon="trash-outline"
            label="Konto löschen"
            gefahr
            onPress={handleKontoLoeschen}
          />
        </View>

        <Text style={s.version}>ANYVO v1.0.0</Text>
      </ScrollView>
      <QuickAddSheet />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  inhalt: { paddingHorizontal: 20, paddingBottom: 120 },

  kopf: { paddingTop: 16, paddingBottom: 22 },
  augenbraue: {
    fontSize: 10,
    color: C.muted,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  titel: {
    fontSize: 28,
    color: C.white,
    fontWeight: "900",
    letterSpacing: -0.5,
  },

  identitaet: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    gap: 14,
    marginBottom: 14,
    overflow: "hidden",
  },
  avatarKreis: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: `${C.accent}40`,
    overflow: "hidden",
  },
  avatarText: { fontSize: 20, color: C.accent, fontWeight: "900" },
  identitaetInfo: { flex: 1 },
  anzeigeName: {
    fontSize: 17,
    color: C.white,
    fontWeight: "700",
    marginBottom: 3,
  },
  emailText: { fontSize: 13, color: C.muted },
  bearbeitenBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },

  statsReihe: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 24,
    overflow: "hidden",
  },
  stat: { flex: 1, alignItems: "center", paddingVertical: 18 },
  statTrenner: { borderRightWidth: 1, borderRightColor: C.border },
  statWert: {
    fontSize: 22,
    color: C.white,
    fontWeight: "900",
    marginBottom: 3,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 9,
    color: C.muted,
    fontWeight: "700",
    letterSpacing: 1.2,
  },

  proBanner: {
    height: 240,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 28,
    borderWidth: 1,
    borderColor: `${C.accent}20`,
    justifyContent: "flex-end",
    backgroundColor: C.bg,
  },
  proBannerImg: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%',
  },
  proInhalt: { padding: 22 },
  proAbzeichen: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  proAbzeichenText: {
    fontSize: 11,
    color: C.accentText,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  proUeberschrift: {
    fontSize: 26,
    color: C.white,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 30,
    marginBottom: 8,
  },
  proUntertitel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
    marginBottom: 18,
    lineHeight: 19,
  },
  proBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    overflow: "hidden",
  },
  proBtnText: { fontSize: 15, color: C.accentText, fontWeight: "900" },

  abschnitt: {
    fontSize: 10,
    color: C.muted,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  gateCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 24,
  },
  gateTitle:  { fontSize: 15, color: C.white, fontWeight: "700", marginBottom: 6 },
  gateSub:    { fontSize: 13, color: C.muted, lineHeight: 19, marginBottom: 14 },
  regBtn:     { backgroundColor: C.accentDim, borderRadius: 12, borderWidth: 1, borderColor: `${C.accent}40`, paddingVertical: 13, alignItems: "center" },
  regBtnTxt:  { fontSize: 14, color: C.accent, fontWeight: "700" },
  upgradeBtn: { backgroundColor: C.warningDim, borderRadius: 12, borderWidth: 1, borderColor: `${C.warning}40`, paddingVertical: 13, alignItems: "center" },
  upgradeBtnTxt: { fontSize: 14, color: C.warning, fontWeight: "700" },
  sparteHint:    { fontSize: 12, color: C.muted, lineHeight: 17, padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  sparteIcon:    { width: 36, height: 36, borderRadius: 10, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  sparteIconOn:  { backgroundColor: C.accentDim, borderColor: `${C.accent}40` },
  karte: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 24,
  },
  glassTransparent: { backgroundColor: "transparent" },
  glassBg:          { ...StyleSheet.absoluteFillObject },
  zeile: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12 },
  zeileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  zeileIconGefahr: { backgroundColor: C.dangerDim },
  zeileLabel: { flex: 1, fontSize: 15, color: C.white, fontWeight: "500" },
  zeileRechts: { flexDirection: "row", alignItems: "center", gap: 4 },
  zeileWert: { fontSize: 13, color: C.muted },
  trenner: { height: 1, backgroundColor: C.border, marginLeft: 64 },

  version: {
    textAlign: "center",
    fontSize: 12,
    color: C.subtle,
    marginTop: 20,
  },

  planBtn: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               8,
    borderRadius:      14,
    borderWidth:       1,
    borderColor:       C.border,
    backgroundColor:   C.card,
    paddingHorizontal: 16,
    paddingVertical:   13,
    marginBottom:      14,
    overflow:          "hidden",
  },
  planBtnAktiv:    { borderColor: `${C.accent}40` },
  planBtnText:     { flex: 1, fontSize: 14, color: C.muted,  fontWeight: "600" },
  planBtnTextAktiv:{ flex: 1, fontSize: 14, color: C.accent, fontWeight: "700" },

  premiumKarte: {
    borderRadius:    24,
    borderWidth:     1,
    borderColor:     `${C.accent}25`,
    padding:         22,
    marginBottom:    28,
    overflow:        "hidden",
    gap:             6,
  },
  premiumKopf: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            10,
    marginBottom:   10,
  },
  premiumAktivBadge: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            4,
    backgroundColor: C.successDim,
    borderRadius:   20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth:    1,
    borderColor:    `${C.success}30`,
  },
  premiumAktivText: { fontSize: 12, color: C.success, fontWeight: "700" },
  premiumTitel: { fontSize: 20, color: C.white, fontWeight: "900", letterSpacing: -0.3 },
  premiumSub:   { fontSize: 13, color: C.muted },
  trialCancelBtn: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardAlt },
  trialCancelTxt: { fontSize: 13, color: C.muted, fontWeight: '700' },
});
