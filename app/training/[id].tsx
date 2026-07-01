import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';
import { DateField } from '@/components/ui/DateField';
import { toISODate } from '@/features/dogs/dateInput';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { DogIcon } from '@/components/ui/DogIcon';
import {
  getTrainingSessionById,
  updateTrainingSession,
  deleteTrainingSession,
} from '@/services/training';
import { formatDateCH } from '@/lib/utils';
import { DurationDrumPicker } from '@/components/ui/DurationDrumPicker';
import { PhotoPicker } from '@/components/ui/PhotoPicker';
import { VideoUpload } from '@/components/ui/VideoUpload';
import { AudioRecorder } from '@/components/ui/AudioRecorder';
import { ShareSheet } from '@/components/ShareSheet';
import type { AudioNote, TrainingCategory, TrainingSession, TrainingType } from '@/types';

// ─── Konstanten ───────────────────────────────────────────────────────────────

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const KATEGORIEN: { id: TrainingCategory; label: string; icon: IconName }[] = [
  { id: 'IGP',             label: 'IGP',       icon: 'shield-outline' },
  { id: 'IBGH',            label: 'IBGH',       icon: 'ribbon-outline' },
  { id: 'Mondioring',      label: 'Mondioring', icon: 'flag-outline'   },
  { id: 'Alltagstraining', label: 'Alltag',     icon: 'home-outline'   },
];

function formatDauer(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} Std` : `${h} Std ${m} min`;
}

const KATEGORIE_FARBEN: Record<TrainingCategory, string> = {
  IGP:             C.accent,
  IBGH:            C.success,
  Mondioring:      C.warning,
  Alltagstraining: '#60A5FA',
};

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

const STEPS = [5, 10, 15, 20, 25, 30, 35, 40];

function snapToStep(min: number): number {
  return STEPS.reduce((prev, curr) =>
    Math.abs(curr - min) < Math.abs(prev - min) ? curr : prev
  );
}

// ─── Unter-Komponenten ────────────────────────────────────────────────────────

function AbschnittLabel({ text }: { text: string }) {
  return <Text style={s.abschnitt}>{text}</Text>;
}

function InfoZeile({ icon, label, wert }: { icon: IconName; label: string; wert: string }) {
  return (
    <View style={s.infoZeile}>
      <View style={s.infoIcon}>
        <Ionicons name={icon} size={15} color={C.muted} />
      </View>
      <View style={s.infoText}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoWert}>{wert}</Text>
      </View>
    </View>
  );
}

function SterneAnzeige({ wert }: { wert: number | null }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Ionicons
          key={n}
          name={wert && n <= wert ? 'star' : 'star-outline'}
          size={22}
          color={wert && n <= wert ? C.star : C.subtle}
        />
      ))}
    </View>
  );
}

// ─── Haupt-Screen ─────────────────────────────────────────────────────────────

export default function TrainingDetailScreen() {
  const router           = useRouter();
  const { id, edit }     = useLocalSearchParams<{ id: string; edit?: string }>();

  const [einheit,      setEinheit]      = useState<TrainingSession | null>(null);
  const [laden,        setLaden]        = useState(true);
  const [bearbeiten,   setBearbeiten]   = useState(edit === 'true');
  const [speichern,    setSpeichern]    = useState(false);
  const [shareVisible, setShareVisible] = useState(false);

  // Formular-State (Edit-Modus)
  const [titel,         setTitel]         = useState('');
  const [notizen,       setNotizen]       = useState('');
  const [dauer,         setDauer]         = useState<number>(20);
  const [trainingsTyp,  setTrainingsTyp]  = useState<TrainingType>('privat');
  const [trainerName,   setTrainerName]   = useState('');
  const [datum, setDatum] = useState<Date | null>(null);
  const [performance,     setPerformance]     = useState(0);
  const [kategorie,     setKategorie]     = useState<TrainingCategory | null>(null);
  const [videoUrl,      setVideoUrl]      = useState<string | null>(null);
  const [audioNotes,    setAudioNotes]    = useState<AudioNote[]>([]);
  const [fotoUrls,      setFotoUrls]      = useState<string[]>([]);
  const [notizenFokus,  setNotizenFokus]  = useState(false);

  const einheitLaden = useCallback(async () => {
    if (!id) return;
    setLaden(true);
    const { data, error } = await getTrainingSessionById(id);
    setLaden(false);
    if (error || !data) return;
    const d = data as TrainingSession;
    setEinheit(d);
    felderSetzen(d);
  }, [id]);

  function felderSetzen(d: TrainingSession) {
    setTitel(d.title ?? '');
    setNotizen(d.notes ?? '');
    setDauer(snapToStep(d.duration_minutes ?? 20));
    setTrainingsTyp(d.training_type);
    setTrainerName(d.trainer_name ?? '');
    setDatum(d.session_date ? new Date(d.session_date) : null);
    setPerformance(d.rating ?? 0);
    setKategorie(d.category);
    setVideoUrl(d.video_url ?? null);
    setFotoUrls(d.photo_urls ?? []);
    setAudioNotes((d.audio_urls ?? []).map((url, i) => ({
      url,
      duration: '—',
      createdAt: `Aufnahme ${i + 1}`,
    })));
  }

  useEffect(() => { einheitLaden(); }, [einheitLaden]);


  const abbrechen = () => {
    if (einheit) felderSetzen(einheit);
    setBearbeiten(false);
  };

  const handleSpeichern = async () => {
    if (!id || !kategorie) return;
    setSpeichern(true);
    const { data, error } = await updateTrainingSession(id, {
      title:            titel.trim() || null,
      notes:            notizen.trim() || null,
      duration_minutes: dauer,
      training_type:    trainingsTyp,
      trainer_name:     trainingsTyp === 'trainer' ? trainerName.trim() || null : null,
      session_date:     datum ? toISODate(datum) : undefined,
      rating:           performance || null,
      category:         kategorie,
      video_url:        videoUrl,
      audio_urls:       audioNotes.map(n => n.url),
      photo_urls:       fotoUrls,
    });
    setSpeichern(false);
    if (error) {
      Alert.alert('Fehler', `Einheit konnte nicht gespeichert werden.\n\n${error.message}`);
      return;
    }
    if (data) setEinheit(data as TrainingSession);
    setBearbeiten(false);
  };

  const handleLoeschen = () => {
    Alert.alert(
      'Einheit entfernen',
      'Möchtest du diese Trainingseinheit wirklich entfernen?',
      [
        { text: 'Zurück', style: 'cancel' },
        {
          text: 'Entfernen',
          style: 'destructive',
          onPress: async () => {
            await deleteTrainingSession(id!);
            router.back();
          },
        },
      ]
    );
  };

  // ── Laden ──
  if (laden) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.mitte}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!einheit) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.mitte}>
          <Text style={s.fehlerText}>Einheit nicht gefunden.</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: C.accent, fontWeight: '700' }}>Zurück</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const katFarbe = KATEGORIE_FARBEN[einheit.category] ?? C.muted;

  // ── View-Modus ──
  if (!bearbeiten) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.zurueckBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={20} color={C.white} />
          </TouchableOpacity>
          <View style={s.headerRechts}>
            <TouchableOpacity style={s.shareIconBtn} onPress={() => setShareVisible(true)} activeOpacity={0.8}>
              <Ionicons name="share-outline" size={20} color={C.accent} />
            </TouchableOpacity>
            <TouchableOpacity style={s.bearbeitenBtn} onPress={() => setBearbeiten(true)} activeOpacity={0.8}>
              <Ionicons name="pencil" size={14} color={C.accentText} />
              <Text style={s.bearbeitenBtnText}>Bearbeiten</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.inhalt}
          showsVerticalScrollIndicator={false}
        >
          {/* Kategorie-Banner */}
          <View style={[s.banner, { backgroundColor: `${katFarbe}12`, borderColor: `${katFarbe}25` }]}>
            <View style={[s.bannerPunkt, { backgroundColor: katFarbe }]} />
            <Text style={[s.bannerKat, { color: katFarbe }]}>{einheit.category}</Text>
            <View style={s.bannerTypBadge}>
              <Text style={s.bannerTypText}>
                {einheit.training_type === 'trainer' ? 'Mit Trainer' : 'Eigentraining'}
              </Text>
            </View>
          </View>

          {/* Titel */}
          {einheit.title ? (
            <Text style={s.viewTitel}>{einheit.title}</Text>
          ) : (
            <Text style={s.viewTitelPlaceholder}>{einheit.category}</Text>
          )}

          {/* Hund */}
          {einheit.dog?.name ? (
            <View style={s.hundBadge}>
              <DogIcon size={12} color={C.muted} />
              <Text style={s.hundBadgeText}>{einheit.dog.name}</Text>
            </View>
          ) : null}

          {/* Performance */}
          <View style={s.performanceReihe}>
            <SterneAnzeige wert={einheit.rating} />
            {einheit.rating ? (
              <Text style={s.performanceHinweis}>
                {einheit.rating === 1 ? 'Harter Tag' :
                 einheit.rating === 2 ? 'Ausbaufähig' :
                 einheit.rating === 3 ? 'Solide' :
                 einheit.rating === 4 ? 'Stark' : 'Perfekt'}
              </Text>
            ) : null}
          </View>

          {/* Info-Felder */}
          <View style={s.infoKarte}>
            <InfoZeile
              icon="calendar-outline"
              label="DATUM"
              wert={formatDateCH(einheit.session_date)}
            />
            {einheit.duration_minutes ? (
              <>
                <View style={s.infoTrenner} />
                <InfoZeile
                  icon="time-outline"
                  label="DAUER"
                  wert={formatDauer(einheit.duration_minutes)}
                />
              </>
            ) : null}
            {einheit.training_type === 'trainer' && einheit.trainer_name ? (
              <>
                <View style={s.infoTrenner} />
                <InfoZeile
                  icon="person-outline"
                  label="TRAINER"
                  wert={einheit.trainer_name}
                />
              </>
            ) : null}
          </View>

          {/* Notizen */}
          {einheit.notes ? (
            <>
              <AbschnittLabel text="NOTIZEN" />
              <View style={s.notizenKarte}>
                <Text style={s.notizenText}>{einheit.notes}</Text>
              </View>
            </>
          ) : null}

          {/* Fotos (View) */}
          {einheit.photo_urls?.length > 0 ? (
            <>
              <AbschnittLabel text="FOTOS" />
              <PhotoPicker value={einheit.photo_urls} onChange={() => {}} />
            </>
          ) : null}

          {/* Video (View) */}
          {einheit.video_url ? (
            <>
              <AbschnittLabel text="VIDEO" />
              <VideoUpload value={einheit.video_url} onChange={() => {}} />
            </>
          ) : null}

          {/* Sprachnotizen (View) */}
          {einheit.audio_urls?.length > 0 ? (
            <>
              <AbschnittLabel text="SPRACHNOTIZEN" />
              <AudioRecorder
                value={einheit.audio_urls.map((url, i) => ({
                  url,
                  duration: '—',
                  createdAt: `Aufnahme ${i + 1}`,
                }))}
                onChange={() => {}}
              />
            </>
          ) : null}

          {/* Teilen */}
          <TouchableOpacity style={s.teilenBtn} onPress={() => setShareVisible(true)} activeOpacity={0.8}>
            <Ionicons name="share-outline" size={16} color={C.accent} />
            <Text style={s.teilenText}>Training teilen</Text>
          </TouchableOpacity>

          {/* Löschen */}
          <TouchableOpacity style={s.loeschenBtn} onPress={handleLoeschen} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={16} color={C.danger} />
            <Text style={s.loeschenText}>Einheit löschen</Text>
          </TouchableOpacity>
        </ScrollView>

        <ShareSheet
          training={einheit}
          visible={shareVisible}
          onClose={() => setShareVisible(false)}
        />
      </SafeAreaView>
    );
  }

  // ── Edit-Modus ──
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.zurueckBtn} onPress={abbrechen} activeOpacity={0.8}>
          <Ionicons name="close" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.editHeaderTitel}>Einheit bearbeiten</Text>
        <AnimatedPressable
          style={[s.speichernHeaderBtn, speichern && { opacity: 0.6 }]}
          onPress={handleSpeichern}
          disabled={speichern}
          scale={0.95}
        >
          {speichern
            ? <ActivityIndicator size="small" color={C.accentText} />
            : (
              <>
                <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />
                <Text style={s.speichernHeaderText}>Speichern</Text>
              </>
            )
          }
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.editInhalt}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* BEZEICHNUNG */}
          <AbschnittLabel text="BEZEICHNUNG (OPTIONAL)" />
          <View style={s.eingabeBox}>
            <TextInput
              style={s.eingabe}
              placeholder="z. B. Schutzdienst Phase B"
              placeholderTextColor={C.subtle}
              value={titel}
              onChangeText={setTitel}
              selectionColor={C.accent}
              returnKeyType="done"
            />
          </View>

          {/* TRAININGSTYP */}
          <AbschnittLabel text="ART DES TRAININGS" />
          <View style={s.typReihe}>
            {(['privat', 'trainer'] as TrainingType[]).map((typ) => {
              const aktiv = trainingsTyp === typ;
              return (
                <TouchableOpacity
                  key={typ}
                  style={[s.typBtn, aktiv && s.typBtnAktiv]}
                  onPress={() => setTrainingsTyp(typ)}
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
                    name={typ === 'privat' ? 'person-outline' : 'people-outline'}
                    size={15}
                    color={aktiv ? C.accentText : C.muted}
                  />
                  <Text style={[s.typText, aktiv && s.typTextAktiv]}>
                    {typ === 'privat' ? 'Eigentraining' : 'Mit Trainer'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* TRAINERNAME */}
          {trainingsTyp === 'trainer' && (
            <>
              <AbschnittLabel text="TRAINER" />
              <View style={s.eingabeBox}>
                <TextInput
                  style={s.eingabe}
                  placeholder="Name des Trainers"
                  placeholderTextColor={C.subtle}
                  value={trainerName}
                  onChangeText={setTrainerName}
                  selectionColor={C.accent}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
              </View>
            </>
          )}

          {/* KATEGORIE */}
          <AbschnittLabel text="KATEGORIE" />
          <View style={s.katGrid}>
            {KATEGORIEN.map((kat) => {
              const aktiv = kategorie === kat.id;
              const farbe = KATEGORIE_FARBEN[kat.id];
              return (
                <TouchableOpacity
                  key={kat.id}
                  style={[s.katBtn, aktiv && { borderColor: farbe, backgroundColor: `${farbe}15` }]}
                  onPress={() => setKategorie(aktiv ? null : kat.id)}
                  activeOpacity={0.75}
                >
                  <Ionicons name={kat.icon} size={17} color={aktiv ? farbe : C.muted} />
                  <Text style={[s.katLabel, aktiv && { color: farbe }]}>{kat.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* DATUM */}
          <AbschnittLabel text="DATUM" />
          <DateField value={datum} onChange={setDatum} maximumDate={new Date()} />

          {/* DAUER */}
          <AbschnittLabel text="DAUER" />
          <DurationDrumPicker value={dauer} onChange={setDauer} />

          {/* PERFORMANCE */}
          <AbschnittLabel text="PERFORMANCE" />
          <View style={s.performanceKarte}>
            <View style={s.sterneReihe}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setPerformance(performance === n ? 0 : n)}
                  activeOpacity={0.7}
                  style={{ padding: 4 }}
                >
                  <Ionicons
                    name={n <= performance ? 'star' : 'star-outline'}
                    size={36}
                    color={n <= performance ? C.star : C.border}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {performance > 0 ? (
              <Text style={s.performanceHinweisEdit}>
                {performance === 1 ? 'Harter Tag — morgen besser!' :
                 performance === 2 ? 'Ausbaufähig, aber dabei!' :
                 performance === 3 ? 'Solide Einheit' :
                 performance === 4 ? 'Stark – weiter so!' : 'Perfekte Einheit!'}
              </Text>
            ) : null}
          </View>

          {/* NOTIZEN */}
          <AbschnittLabel text="NOTIZEN" />
          <View style={[s.notizenBox, notizenFokus && s.notizenBoxFokus]}>
            <TextInput
              style={s.notizenEingabe}
              placeholder="Was lief gut? Was willst du verbessern?"
              placeholderTextColor={C.subtle}
              value={notizen}
              onChangeText={setNotizen}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              selectionColor={C.accent}
              onFocus={() => setNotizenFokus(true)}
              onBlur={() => setNotizenFokus(false)}
            />
          </View>

          {/* FOTOS (Edit) */}
          <AbschnittLabel text="FOTOS" />
          <PhotoPicker value={fotoUrls} onChange={setFotoUrls} />

          {/* VIDEO (Edit) */}
          <AbschnittLabel text="VIDEO" />
          <VideoUpload value={videoUrl} onChange={setVideoUrl} />

          {/* SPRACHNOTIZEN (Edit) */}
          <AbschnittLabel text="SPRACHNOTIZEN" />
          <AudioRecorder value={audioNotes} onChange={setAudioNotes} />

          {/* LÖSCHEN */}
          <TouchableOpacity style={s.loeschenBtn} onPress={handleLoeschen} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={16} color={C.danger} />
            <Text style={s.loeschenText}>Einheit löschen</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.bg },
  scroll:     { flex: 1 },
  inhalt:     { paddingHorizontal: 20, paddingBottom: 60 },
  editInhalt: { paddingHorizontal: 20, paddingBottom: 80 },
  mitte:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  fehlerText: { fontSize: 15, color: C.muted, textAlign: 'center' },

  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  zurueckBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: C.card,
    borderWidth:     1,
    borderColor:     C.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  headerRechts: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  shareIconBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: C.card,
    borderWidth:     1,
    borderColor:     `${C.accent}40`,
    alignItems:      'center',
    justifyContent:  'center',
  },
  bearbeitenBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    backgroundColor:   C.accent,
    borderRadius:      20,
    paddingHorizontal: 16,
    paddingVertical:   9,
  },
  bearbeitenBtnText: { fontSize: 13, color: C.accentText, fontWeight: '800' },
  teilenBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             8,
    paddingVertical: 16,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     `${C.accent}30`,
    backgroundColor: `${C.accent}08`,
    marginTop:       8,
    marginBottom:    8,
  },
  teilenText: { fontSize: 14, color: C.accent, fontWeight: '700' },

  editHeaderTitel: { fontSize: 15, color: C.white, fontWeight: '700' },
  speichernHeaderBtn: {
    borderRadius:      20,
    paddingHorizontal: 18,
    paddingVertical:   9,
    overflow:          'hidden',
    alignItems:        'center',
    justifyContent:    'center',
    minWidth:          90,
    height:            38,
  },
  speichernHeaderText: { fontSize: 13, color: C.accentText, fontWeight: '800' },

  // View-Modus
  banner: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    borderRadius:      14,
    borderWidth:       1,
    paddingHorizontal: 14,
    paddingVertical:   10,
    marginTop:         16,
    marginBottom:      4,
  },
  bannerPunkt:   { width: 8, height: 8, borderRadius: 4 },
  bannerKat:     { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, flex: 1 },
  bannerTypBadge: {
    backgroundColor:   'rgba(255,255,255,0.08)',
    borderRadius:      8,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  bannerTypText: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  viewTitel: {
    fontSize:    26,
    color:       C.white,
    fontWeight:  '900',
    letterSpacing: -0.5,
    marginTop:   14,
    marginBottom: 6,
  },
  viewTitelPlaceholder: {
    fontSize:    26,
    color:       C.muted,
    fontWeight:  '900',
    letterSpacing: -0.5,
    marginTop:   14,
    marginBottom: 6,
  },
  hundBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    alignSelf:         'flex-start',
    backgroundColor:   C.card,
    borderRadius:      8,
    borderWidth:       1,
    borderColor:       C.border,
    paddingHorizontal: 10,
    paddingVertical:   4,
    marginBottom:      16,
  },
  hundBadgeText: { fontSize: 12, color: C.muted, fontWeight: '600' },

  performanceReihe: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    marginBottom:   22,
  },
  performanceHinweis: { fontSize: 13, color: C.muted },

  infoKarte: {
    backgroundColor: C.card,
    borderRadius:    18,
    borderWidth:     1,
    borderColor:     C.border,
    overflow:        'hidden',
    marginBottom:    22,
  },
  infoZeile: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoIcon: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: C.cardAlt,
    alignItems:      'center',
    justifyContent:  'center',
  },
  infoText:  { flex: 1 },
  infoLabel: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
  infoWert:  { fontSize: 15, color: C.white, fontWeight: '600' },
  infoTrenner: { height: 1, backgroundColor: C.border, marginLeft: 64 },

  notizenKarte: {
    backgroundColor: C.card,
    borderRadius:    16,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         16,
    marginBottom:    22,
  },
  notizenText: { fontSize: 14, color: C.white, lineHeight: 22 },

  loeschenBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical: 16,
    borderRadius:   16,
    borderWidth:    1,
    borderColor:    `${C.danger}30`,
    backgroundColor: C.dangerDim,
    marginTop:      8,
  },
  loeschenText: { fontSize: 14, color: C.danger, fontWeight: '700' },

  // Edit-Modus
  abschnitt: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10, marginTop: 24 },

  eingabeBox: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   C.card,
    borderRadius:      14,
    borderWidth:       1,
    borderColor:       C.border,
    paddingHorizontal: 14,
    paddingVertical:   13,
  },
  eingabe: { flex: 1, color: C.white, fontSize: 15 },

  typReihe: { flexDirection: 'row', gap: 10 },
  typBtn: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    height:         50,
    borderRadius:   14,
    borderWidth:    1,
    borderColor:    C.border,
    backgroundColor: C.card,
    overflow:       'hidden',
  },
  typBtnAktiv:  { borderColor: C.accent },
  typText:      { fontSize: 14, color: C.muted, fontWeight: '600' },
  typTextAktiv: { color: C.accentText, fontWeight: '700' },

  katGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  katBtn: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               8,
    width:             '47%',
    backgroundColor:   C.card,
    borderRadius:      14,
    borderWidth:       1,
    borderColor:       C.border,
    paddingHorizontal: 14,
    paddingVertical:   14,
  },
  katLabel: { fontSize: 13, color: C.muted, fontWeight: '600' },


  performanceKarte: {
    backgroundColor: C.card,
    borderRadius:    18,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         20,
    alignItems:      'center',
    gap:             10,
  },
  sterneReihe:        { flexDirection: 'row', gap: 4 },
  performanceHinweisEdit: { fontSize: 13, color: C.muted, textAlign: 'center' },

  notizenBox:      { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, minHeight: 100 },
  notizenBoxFokus: { borderColor: C.accent },
  notizenEingabe:  { color: C.white, fontSize: 15, lineHeight: 22 },
});
