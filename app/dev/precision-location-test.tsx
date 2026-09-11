import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { C } from '@/constants/colors';
import {
  isNativeModuleAvailable, isRawGnssSupported, getProviderStatus,
  startPrecisionTracking, stopPrecisionTracking, requestTemporaryFullAccuracy,
  addPrecisionLocationListener, addProviderStatusListener,
  addGnssStatusListener, addGnssMeasurementListener, addHeadingListener, addTrackingErrorListener,
  type PrecisionLocation, type ProviderStatus, type RawGnssSupportStatus,
  type GnssStatusAndroid, type HeadingPoint, type TrackingError,
} from '@/modules/anyvo-precision-location';
import {
  getLocationSourceMode, setLocationSourceMode,
  type LocationSourceMode,
} from '@/features/tracking/utils/locationSourceMode';
import {
  getTrackingEngineMode, setTrackingEngineMode,
  type TrackingEngineMode,
} from '@/features/tracking/utils/trackingEngineMode';
import { hydrateQaModes } from '@/features/tracking/utils/qaModeBootstrap';
import { isQaDiagnosticsEnabled, setQaDiagnosticsEnabled } from '@/features/tracking/utils/qaDiagnosticsMode';
import {
  getActiveTrackingModes, subscribeActiveTrackingModes, type ActiveTrackingModes,
} from '@/features/tracking/utils/trackingWarmupState';
import {
  getQaCandidateLines, subscribeQaCandidateLog, clearQaCandidateLog,
} from '@/features/tracking/utils/qaCandidateLog';
import { motionClient } from '@/features/tracking/native/motionClient';
import { useSession } from '@/hooks/useSession';
import {
  listRecentLaySessions, buildExportForSession, shareQaExport, copyQaExport,
  type QaSessionSummary,
} from '@/features/tracking/services/qaTrackExportService';
import type { MotionStatus } from '@/modules/anyvo-motion';

// Test-/Diagnose-Screen für anyvo-precision-location (Phase 1–3) UND den
// QA-Golden-Reference-A/B-Schalter (ENGINE=BUILD40/CURRENT, SOURCE=EXPO/
// PRECISION).
// Öffnen: Profil → Fährten-Einstellungen → „Fährten-Diagnose", oder Deep-Link
// anyvo://dev/precision-location-test
//
// Bewusst NICHT mehr hinter `__DEV__`: der laufende Golden-Reference-Feldtest
// findet auf einem echten TestFlight-Build (Build 43) statt, wo `__DEV__`
// false ist — der Schalter wäre dort sonst unerreichbar. Der Screen ist rein
// lesend/umschaltend für QA und verändert KEINE Trackinglogik; er ist nur
// über den ausdrücklich als Testmodus bezeichneten Profil-Eintrag erreichbar.
const IS_ANDROID = Platform.OS === 'android';
const IS_IOS = Platform.OS === 'ios';

export default function PrecisionLocationTestScreen() {
  return <PrecisionLocationTestContent />;
}

function PrecisionLocationTestContent() {
  const router = useRouter();
  const [perm, setPerm] = useState<string>('unbekannt');
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [last, setLast] = useState<PrecisionLocation | null>(null);
  const [count, setCount] = useState(0);
  const [running, setRunning] = useState(false);

  // Android (Phase 2)
  const [gnss, setGnss] = useState<GnssStatusAndroid | null>(null);
  const [batchSize, setBatchSize] = useState(0);
  const [batchCount, setBatchCount] = useState(0);
  const [lastMeasAt, setLastMeasAt] = useState<number | null>(null);

  // iOS (Phase 3)
  const [heading, setHeading] = useState<HeadingPoint | null>(null);
  const [error, setError] = useState<TrackingError | null>(null);
  const [accReqMsg, setAccReqMsg] = useState<string | null>(null);

  const subs = useRef<{ remove: () => void }[]>([]);
  const [sourceMode, setSourceMode] = useState<LocationSourceMode>(getLocationSourceMode());
  const [engineMode, setEngineMode] = useState<TrackingEngineMode>(getTrackingEngineMode());
  const [qaOn, setQaOn] = useState<boolean>(isQaDiagnosticsEnabled());
  const [activeModes, setActiveModes] = useState<ActiveTrackingModes>(getActiveTrackingModes());
  const [qaLines, setQaLines] = useState<readonly string[]>(getQaCandidateLines());
  const [motionModule, setMotionModule] = useState<boolean>(false);
  const [motionAvailable, setMotionAvailable] = useState<boolean>(false);
  const [motionStatus, setMotionStatus] = useState<MotionStatus | null>(null);
  // ── Fährten-QA-Export ──
  const { session } = useSession();
  const [qaSessions, setQaSessions] = useState<QaSessionSummary[]>([]);
  const [qaBusy, setQaBusy] = useState<string | null>(null);
  const [qaResult, setQaResult] = useState<string | null>(null);

  useEffect(() => {
    // Die persistierten Werte werden inzwischen bereits beim App-Start geladen
    // (app/_layout.tsx → hydrateQaModes). Der Aufruf hier ist nur noch die
    // Absicherung, dass der Screen nie einen veralteten Default anzeigt.
    void hydrateQaModes().then(() => {
      setSourceMode(getLocationSourceMode());
      setEngineMode(getTrackingEngineMode());
      setQaOn(isQaDiagnosticsEnabled());
    });
  }, []);
  useEffect(() => subscribeActiveTrackingModes(setActiveModes), []);
  // Verfügbarkeit des nativen Motion-Moduls — genau die vorhandene Prüfung,
  // keine neue API. Ein Feldtest darf nicht still ohne Motion-Daten laufen.
  useEffect(() => {
    setMotionModule(motionClient.isModuleAvailable());
    setMotionAvailable(motionClient.isAvailable());
    motionClient.getStatus().then(setMotionStatus).catch(() => setMotionStatus(null));
  }, []);
  useEffect(() => subscribeQaCandidateLog(setQaLines), []);
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    listRecentLaySessions(uid, 5).then(setQaSessions).catch(() => setQaSessions([]));
  }, [session?.user?.id]);

  const runExport = async (localId: string, mode: 'share' | 'copy') => {
    setQaBusy(localId); setQaResult(null);
    try {
      const exported = await buildExportForSession(localId);
      if (mode === 'share') {
        const name = await shareQaExport(exported);
        setQaResult(`${name} · ${exported.pointCount} Punkte · ${exported.totalDistanceM} m`);
      } else {
        const len = await copyQaExport(exported);
        setQaResult(`In die Zwischenablage kopiert · ${exported.pointCount} Punkte · ${(len / 1024).toFixed(0)} KB`);
      }
    } catch (e) {
      setQaResult(`Fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setQaBusy(null);
    }
  };

  const chooseSourceMode = (mode: LocationSourceMode) => {
    setLocationSourceMode(mode);
    setSourceMode(mode);
  };
  const chooseEngineMode = (mode: TrackingEngineMode) => {
    setTrackingEngineMode(mode);
    setEngineMode(mode);
  };
  const toggleQa = () => { const next = !qaOn; setQaDiagnosticsEnabled(next); setQaOn(next); };

  // Läuft gerade ein GPS-Warmup im Lege-Recorder? Dann ist die Quelle für
  // diesen Stream festgeschrieben — bewusst kein Hot-Swap einer laufenden
  // Location-Subscription nur für QA.
  const warmupRunning = activeModes.warmupActive;
  const pendingChange = warmupRunning &&
    (activeModes.engine !== engineMode || activeModes.source !== sourceMode);
  const activeCombi = warmupRunning
    ? `${activeModes.engine === 'build40' ? 'BUILD40' : 'CURRENT'} · ${activeModes.source === 'legacy' ? 'EXPO' : 'PRECISION'}`
    : null;
  // Klartext des aktuell aktiven Zustands — der Feldtest vergleicht
  // A = BUILD40 + EXPO gegen B = CURRENT + EXPO.
  const engineLabel = engineMode === 'build40' ? 'BUILD40' : 'CURRENT';
  const sourceLabel = sourceMode === 'legacy' ? 'EXPO' : 'PRECISION';
  const combiLabel = `${engineLabel} + ${sourceLabel}`;
  const combiHint = engineMode === 'build40' && sourceMode === 'legacy' ? 'Test A (Golden Reference)'
    : engineMode === 'current' && sourceMode === 'legacy' ? 'Test B (neue Engine, ohne Precision)'
    : sourceMode === 'precision' ? 'Precision — auf Build 43 noch NICHT als Vergleich verwenden' : '';

  const native = isNativeModuleAvailable();
  const [support] = useState<RawGnssSupportStatus>(() => isRawGnssSupported());
  const precise = status?.preciseLocationEnabled !== false; // undefined → unbekannt = ok behandeln

  useEffect(() => {
    getProviderStatus().then(setStatus).catch(() => {});
    return () => { void stopAll(); };
  }, []);

  const requestPermission = async () => {
    const r = await Location.requestForegroundPermissionsAsync();
    setPerm(r.granted ? 'erteilt' : r.status);
    getProviderStatus().then(setStatus).catch(() => {});
  };

  const requestPrecise = async () => {
    const r = await requestTemporaryFullAccuracy('TrackingDogSportPrecision');
    setAccReqMsg(r.granted ? 'Präziser Standort gewährt' : `Abgelehnt${r.error ? ` (${r.error})` : ''}`);
    getProviderStatus().then(setStatus).catch(() => {});
  };

  const start = async () => {
    subs.current.push(addPrecisionLocationListener(loc => { setLast(loc); setCount(c => c + 1); }));
    subs.current.push(addProviderStatusListener(setStatus));
    subs.current.push(addGnssStatusListener(setGnss));
    subs.current.push(addGnssMeasurementListener(batch => {
      setBatchSize(batch.measurements.length);
      setBatchCount(c => c + 1);
      setLastMeasAt(batch.timestamp);
    }));
    subs.current.push(addHeadingListener(setHeading));
    subs.current.push(addTrackingErrorListener(setError));
    await startPrecisionTracking({
      intervalMs: 1000,
      enableRawGnssAndroid: IS_ANDROID,
      mode: 'tracking_dog_sport',
      enableHeading: true,
      allowBackground: false,
    });
    setRunning(true);
  };

  const stopAll = async () => {
    await stopPrecisionTracking();
    subs.current.forEach(s => s.remove());
    subs.current = [];
    setRunning(false);
  };

  const secsAgo = (t: number | null | undefined) =>
    (t == null ? '–' : `${Math.max(0, Math.round((Date.now() - t) / 1000))}s her`);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.head}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={s.back}>
          <Ionicons name="chevron-back" size={20} color={C.white} />
        </TouchableOpacity>
        <Text style={s.title}>Fährten-Diagnose · Testmodus</Text>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        <Section title="Aktiv für die echte Fährtenaufnahme">
          <View style={s.activeBox}>
            <Text style={s.activeVal}>{combiLabel}</Text>
            {combiHint ? <Text style={s.activeHint}>{combiHint}</Text> : null}
          </View>
          <Text style={s.note}>
            Gilt für Legen, Ansatz und Absuche (useTrackRecorder/
            useSearchRecorder/useStartPointApproach/Schrittkalibrierung) —
            nicht nur für den Modul-Test weiter unten. Beide Einstellungen
            werden beim App-Start rehydriert und gelten damit auch ohne diesen
            Screen.
          </Text>
          {warmupRunning && (
            <>
              <Row label="Gerade aktiv im Lege-Screen" value={activeCombi ?? '—'} good />
              <Row label="Quelle meldet" value={activeModes.reportedSource ?? 'wartet auf ersten Fix'} />
            </>
          )}
          {pendingChange && (
            <Text style={s.warn}>
              Ein GPS-Stream läuft bereits ({activeCombi}). Die Änderung wird
              beim nächsten Fährtenstart aktiv — dafür den Lege-Screen
              verlassen und neu öffnen. Ein laufender Stream wird bewusst nicht
              umgehängt.
            </Text>
          )}
        </Section>

        <Section title="QA-Diagnose beim Legen">
          <Text style={s.note}>
            Schaltet ausschliesslich BEOBACHTENDE Zusatzfunktionen frei: die
            Anzeige der tatsächlich aktiven Engine/Source im Lege-Screen, die
            Kandidaten-Mitschrift unten und — nur mit ENGINE=CURRENT — den
            Core-Motion-Mitschnitt. Verändert weder Erkennung noch Confidence,
            GPS oder Distanz. Nichts davon wird gespeichert.
          </Text>
          <View style={s.abRow}>
            <TouchableOpacity style={[s.abBtn, !qaOn && s.abBtnActive]} onPress={() => { if (qaOn) toggleQa(); }} activeOpacity={0.85}>
              <Text style={[s.abBtnTxt, !qaOn && s.abBtnTxtActive]}>AUS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.abBtn, qaOn && s.abBtnActive]} onPress={() => { if (!qaOn) toggleQa(); }} activeOpacity={0.85}>
              <Text style={[s.abBtnTxt, qaOn && s.abBtnTxtActive]}>EIN</Text>
            </TouchableOpacity>
          </View>
          <Row label="Motion beim Legen" value={qaOn && engineMode === 'current' ? 'wird mitgeschnitten' : 'aus'} good={qaOn && engineMode === 'current'} />
        </Section>

        <Section title="Motion">
          <View style={s.activeBox}>
            <Text style={[s.activeVal, !motionAvailable && s.activeValBad]}>
              {motionAvailable ? 'Motion · verfügbar' : 'Motion · nicht verfügbar'}
            </Text>
            {warmupRunning && (
              <Text style={s.activeHint}>
                {activeModes.motion === 'live' ? `Motion · aktiv (${activeModes.motionSamples} Samples)`
                  : activeModes.motion === 'waiting' ? 'Motion · keine Samples'
                    : 'Motion · nicht mitgeschnitten (QA aus oder ENGINE=BUILD40)'}
              </Text>
            )}
          </View>
          <Row label="Natives Modul im Build" value={motionModule ? 'Ja' : 'Nein'} good={motionModule} />
          <Row label="Device Motion" value={motionStatus?.deviceMotionAvailable ? 'Ja' : 'Nein'} good={motionStatus?.deviceMotionAvailable} />
          <Row label="Schrittzähler" value={motionStatus?.stepCountingAvailable ? 'Ja' : 'Nein'} good={motionStatus?.stepCountingAvailable} />
          <Row label="Bewegungsklassifikation" value={motionStatus?.activityAvailable ? 'Ja' : 'Nein'} good={motionStatus?.activityAvailable} />
          <Row label="Bewegungsberechtigung" value={motionStatus?.pedometerAuthorized ? 'erteilt' : 'fehlt/verweigert'} good={motionStatus?.pedometerAuthorized} />
          {!motionModule && (
            <Text style={s.warn}>
              Das native Motion-Modul steckt nicht in diesem Build. Der Feldtest
              läuft dann ohne Motion-Daten — GPS, Erkennung und Aufzeichnung sind
              davon unberührt.
            </Text>
          )}
        </Section>

        <Section title="Tracking Engine">
          <Text style={s.note}>
            BUILD40 = die auf Build 40 nachweislich funktionierende Logik
            (historische Winkelerkennung, kein Such-Start-Lock, Core Motion
            nur beobachtend). CURRENT = heutige Engine.
          </Text>
          <View style={s.abRow}>
            <TouchableOpacity
              style={[s.abBtn, engineMode === 'build40' && s.abBtnActive]}
              onPress={() => chooseEngineMode('build40')}
              activeOpacity={0.85}
            >
              <Text style={[s.abBtnTxt, engineMode === 'build40' && s.abBtnTxtActive]}>BUILD40</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.abBtn, engineMode === 'current' && s.abBtnActive]}
              onPress={() => chooseEngineMode('current')}
              activeOpacity={0.85}
            >
              <Text style={[s.abBtnTxt, engineMode === 'current' && s.abBtnTxtActive]}>CURRENT</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Section title="Location Source">
          <Text style={s.note}>
            EXPO = exakt der alte, auf Build 40 funktionierende
            expo-location-Pfad (AnyvoPrecisionLocation wird gar nicht
            gestartet). PRECISION = natives Modul. Hinweis: auf Build 43
            enthält das native Modul noch die alte 1-Hz-Drosselung —
            PRECISION daher vorerst NICHT als Vergleichsmassstab verwenden.
          </Text>
          <View style={s.abRow}>
            <TouchableOpacity
              style={[s.abBtn, sourceMode === 'legacy' && s.abBtnActive]}
              onPress={() => chooseSourceMode('legacy')}
              activeOpacity={0.85}
            >
              <Text style={[s.abBtnTxt, sourceMode === 'legacy' && s.abBtnTxtActive]}>EXPO</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.abBtn, sourceMode === 'precision' && s.abBtnActive]}
              onPress={() => chooseSourceMode('precision')}
              activeOpacity={0.85}
            >
              <Text style={[s.abBtnTxt, sourceMode === 'precision' && s.abBtnTxtActive]}>PRECISION</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Section title="Engine">
          <Row label="Engine" value={native ? 'Native Precision' : 'Fallback (expo-location)'} good={native} />
          <Row label="Provider" value={IS_IOS ? 'iOS Core Location' : 'Android LocationManager'} />
          <Row label="Berechtigung" value={perm} good={perm === 'erteilt'} />
        </Section>

        {IS_ANDROID && (
          <Section title="Raw GNSS (Android)">
            <Row label="Raw GNSS unterstützt" value={support.supported ? 'Ja' : 'Nein'} good={support.supported} />
            <Row label="Grund" value={String(support.reason ?? '–')} />
            <Row label="Raw GNSS aktiv" value={status?.rawGnssActive ? 'Ja' : 'Nein'} good={status?.rawGnssActive} />
            <Row label="Satelliten gesamt" value={gnss ? String(gnss.satelliteCount) : '–'} />
            <Row label="Used in Fix" value={gnss ? String(gnss.usedInFixCount) : '–'} />
            <Row label="Ø CN0" value={gnss?.averageCn0DbHz != null ? `${gnss.averageCn0DbHz.toFixed(1)} dBHz` : '–'} />
            <Row label="Max CN0" value={gnss?.maxCn0DbHz != null ? `${gnss.maxCn0DbHz.toFixed(1)} dBHz` : '–'} />
            <Row label="Messungen / Batch" value={running ? String(batchSize) : '–'} />
            <Row label="Batches gesamt" value={String(batchCount)} />
            <Row label="Letzte Messung" value={secsAgo(lastMeasAt)} />
          </Section>
        )}

        {IS_IOS && (
          <Section title="iOS Core Location (Phase 3)">
            <Row label="Precise Location" value={precise ? 'Aktiv' : 'Inaktiv'} good={precise} />
            <Row label="Authorization" value={status?.authorizationStatus ?? '–'} />
            <Row label="Accuracy Auth" value={status?.accuracyAuthorization ?? '–'} />
            <Row label="Heading verfügbar" value={status?.headingAvailable ? 'Ja' : 'Nein'} good={status?.headingAvailable} />
            <Row label="True Heading" value={heading?.trueHeading != null ? `${heading.trueHeading.toFixed(0)}°` : '–'} />
            <Row label="Magnetic Heading" value={heading?.magneticHeading != null ? `${heading.magneticHeading.toFixed(0)}°` : '–'} />
            <Row label="Heading Accuracy" value={heading?.headingAccuracy != null ? `${heading.headingAccuracy.toFixed(0)}°` : '–'} />
            <Row label="Background erlaubt" value={status?.backgroundAllowed ? 'Ja' : 'Nein'} />
            <Row label="Letztes Location-Event" value={secsAgo(status?.lastLocationAt ?? last?.timestamp ?? null)} />
            <Row label="Letztes Heading-Event" value={secsAgo(heading?.timestamp ?? null)} />
            <Row label="rawGnssAvailable" value="Nein" />
            <Text style={s.note}>Raw GNSS ist auf iOS nicht verfügbar. Anyvo nutzt Core Location Precision + Heading.</Text>
            {!precise && (
              <Text style={s.warn}>Präziser Standort ist deaktiviert. Für genaue Fährten bitte in iOS Standortfreigabe aktivieren.</Text>
            )}
            {accReqMsg ? <Text style={s.note}>{accReqMsg}</Text> : null}
          </Section>
        )}

        <Section title={`Letzte Position  ·  ${count} Updates`}>
          {last ? (
            <>
              <Row label="Lat" value={last.latitude.toFixed(6)} />
              <Row label="Lng" value={last.longitude.toFixed(6)} />
              <Row label="Genauigkeit" value={last.accuracy != null ? `${last.accuracy.toFixed(1)} m` : '–'} />
              <Row label="Qualität" value={last.quality ?? '–'} good={last.quality === 'excellent' || last.quality === 'good'} />
              <Row label="Speed" value={last.speed != null ? `${last.speed.toFixed(2)} m/s` : '–'} />
              <Row label="Mocked" value={last.isMocked ? 'Ja' : 'Nein'} />
              <Row label="Quelle" value={last.source} />
            </>
          ) : (
            <Text style={s.note}>Noch keine Position. {'"Start"'} drücken.</Text>
          )}
        </Section>

        {error ? (
          <Section title="Letzter Fehler">
            <Row label="Code" value={error.code} />
            <Text style={s.note}>{error.message} · recoverable: {String(error.recoverable)}</Text>
          </Section>
        ) : null}

        <Section title="Fährten-QA Export">
          <Text style={s.note}>
            Exportiert die GELEGTE Spur einer Fährte (nur point_type lay,
            keine Absuche) als anonymisiertes JSON: erster Punkt wird (0,0),
            alles Weitere lokale x/y-Meter, Zeitstempel relativ. Keine
            Koordinaten, keine Konto-, Hunde- oder Standortdaten.
          </Text>
          {qaSessions.length === 0 ? (
            <Text style={s.note}>Keine gelegte Fährte mit Punkten gefunden.</Text>
          ) : (
            qaSessions.map((q, i) => (
              <View key={q.localId} style={s.qaSessionBox}>
                <Row
                  label={i === 0 ? 'Letzte gelegte Fährte' : `Fährte ${i + 1}`}
                  value={`${q.layPointCount} Punkte${q.startedAt ? ` · ${q.startedAt.slice(0, 16).replace('T', ' ')}` : ''}`}
                />
                <View style={s.abRow}>
                  <TouchableOpacity
                    style={[s.abBtn, s.abBtnActive]}
                    onPress={() => void runExport(q.localId, 'share')}
                    disabled={qaBusy != null}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.abBtnTxt, s.abBtnTxtActive]}>
                      {qaBusy === q.localId ? '…' : 'JSON teilen'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.abBtn}
                    onPress={() => void runExport(q.localId, 'copy')}
                    disabled={qaBusy != null}
                    activeOpacity={0.85}
                  >
                    <Text style={s.abBtnTxt}>Kopieren</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
          {qaResult ? <Text style={s.note}>{qaResult}</Text> : null}
        </Section>

        {qaOn && (
          <Section title={`Kandidaten-Mitschrift  ·  ${qaLines.length}`}>
            {qaLines.length ? (
              <>
                {qaLines.slice(-24).map((line, i) => (
                  <Text key={`${i}-${line.slice(0, 12)}`} style={s.logLine}>{line}</Text>
                ))}
                <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => clearQaCandidateLog()} activeOpacity={0.85}>
                  <Ionicons name="trash-outline" size={18} color={C.white} />
                  <Text style={s.btnTxt}>Mitschrift leeren</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={s.note}>
                Noch nichts aufgezeichnet. Die Mitschrift füllt sich während einer
                Fährte je Winkel-Kandidat und wird bei jedem neuen Aufnahmestart
                geleert. Sie liegt nur im Arbeitsspeicher.
              </Text>
            )}
          </Section>
        )}

        {qaOn && (
          <Section title="Feldprotokoll">
            <Text style={s.note}>
              Golden-Field-Route (verbindlich):{'\n'}
              Start → L → 3,75 m → R → 3,75 m → SR → 3,75 m → SL → ca. 1,25 m → Ende{'\n'}
              Erwartet: 90 L → 90 R → SR → SL. Schrittlänge 75 cm, je 5 Schritte.
            </Text>
            <Text style={s.note}>
              Anschliessend als Gegenprobe je einmal, jeweils ohne Richtungswechsel:{'\n'}
              1. gerade gehen{'\n'}
              2. Handy ansehen{'\n'}
              3. Handy beim Gehen um 90° drehen{'\n'}
              4. bücken{'\n'}
              5. Gegenstand setzen{'\n'}
              6. Dübel setzen{'\n'}
              7. im Stand drehen{'\n'}
              Erwartung: kein zusätzlicher Winkel.
            </Text>
          </Section>
        )}

        <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={requestPermission} activeOpacity={0.85}>
          <Ionicons name="key-outline" size={18} color={C.white} />
          <Text style={s.btnTxt}>GPS-Berechtigung anfragen</Text>
        </TouchableOpacity>

        {IS_IOS && (
          <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={requestPrecise} activeOpacity={0.85}>
            <Ionicons name="locate-outline" size={18} color={C.white} />
            <Text style={s.btnTxt}>Präzisen Standort anfragen</Text>
          </TouchableOpacity>
        )}

        {running ? (
          <TouchableOpacity style={[s.btn, s.btnStop]} onPress={stopAll} activeOpacity={0.85}>
            <Ionicons name="stop" size={18} color="#2a060a" />
            <Text style={[s.btnTxt, { color: '#2a060a' }]}>Stop</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.btn, s.btnStart]} onPress={start} activeOpacity={0.85}>
            <Ionicons name="play" size={18} color={C.accentText} />
            <Text style={[s.btnTxt, { color: C.accentText }]}>
              Start{IS_ANDROID ? ' (+ Raw GNSS)' : ' (+ Heading)'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.card}>{children}</View>
    </View>
  );
}

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  const color = good === undefined ? C.white : good ? C.accent : C.muted;
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  activeValBad: { color: C.muted },
  qaSessionBox: { marginBottom: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  logLine: { fontSize: 10.5, color: C.muted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 3 },
  head:    { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  back:    { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  title:   { fontSize: 18, color: C.white, fontWeight: '800' },
  body:    { padding: 16, gap: 18, paddingBottom: 40 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, color: C.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 2 },
  card:    { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 6 },
  row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10 },
  rowLabel:{ fontSize: 14, color: C.muted },
  rowValue:{ fontSize: 14, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  note:    { fontSize: 13, color: C.muted, padding: 12, lineHeight: 18 },
  warn:    { fontSize: 13, color: C.trackWarning, padding: 12, lineHeight: 18, fontWeight: '700' },
  btn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16 },
  btnGhost:{ backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  btnStart:{ backgroundColor: C.accent },
  btnStop: { backgroundColor: '#ff5d6c' },
  btnTxt:  { fontSize: 15, fontWeight: '800', color: C.white },
  activeBox: { paddingHorizontal: 12, paddingVertical: 12, gap: 3 },
  activeVal: { fontSize: 20, fontWeight: '900', color: C.accent, letterSpacing: 0.5 },
  activeHint:{ fontSize: 12, color: C.muted, fontWeight: '700' },
  abRow:   { flexDirection: 'row', gap: 8, marginTop: 4 },
  abBtn:   { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  abBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  abBtnTxt: { fontSize: 13, fontWeight: '800', color: C.white },
  abBtnTxtActive: { color: C.accentText },
});
