import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { TrackingMap, type MapMarker } from '@/features/tracking/components/TrackingMap';
import { MarkerDetailSheet, type TrackDetailSelection } from '@/features/tracking/components/MarkerDetailSheet';
import { buildTrackDetailMap } from '@/features/tracking/utils/trackDetailMap';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { TrackScoreRing } from '@/features/tracking/components/TrackScoreRing';
import { LegBars, type LegRow } from '@/features/tracking/components/LegBars';
import { FaehrtenHeader, SectionLabel, relDate } from '@/features/tracking/components/FaehrtenChrome';
import { getTrackSessionById, saveTrackEvaluation } from '@/features/tracking/services/trackService';
import { getLocalTrackDetail, getLocalRunSupplement, saveLocalTrackEvaluation } from '@/features/tracking/services/trackHistoryService';
import { createEmbeddingForTrackSummary } from '@/features/ai/services/trainingEmbeddingService';
import { SmartFeedbackSection } from '@/features/ai/components/SmartFeedbackSection';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import { extractTags, legsFromSession, overallScore, scoreVerdict } from '@/features/tracking/utils/trackEvaluation';
import type { LatLng } from '@/features/tracking/utils/gpsFilter';
import {
  TRACK_SEGMENT_COLORS,
  actualSegmentSteps,
  analyzeTrackSegments,
  coerceTrackSegments,
  segmentDisplayLabel,
} from '@/features/tracking/utils/trackSegments';
import type { TrackAnalytics } from '@/features/tracking/engine/trackAnalytics';
import { isTrackReplayEligible } from '@/features/tracking/utils/trackReplayData';
import { useT } from '@/i18n';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Punkt 8/14 — Anzeigetext je Confidence-Band, bewusst NICHT als "Wahrscheinlichkeit"
// formuliert (interner Qualitätsindex).
const CONFIDENCE_BAND_LABEL: Record<TrackAnalytics['analysisConfidenceBand'], string> = {
  excellent: 'sehr gut', good: 'gut', limited: 'eingeschränkt', unreliable: 'unzuverlässig',
};

export default function TrackAuswertungScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useT();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [legs, setLegs]   = useState<LegRow[]>([]);
  const [notes, setNotes] = useState('');
  const [isLocalOnly, setIsLocalOnly] = useState(false);
  // Abschnitt 8 des Audits: true = Absuche hat KEINE verwertbare Geometrie
  // erzeugt (0 m Distanz) → steuert nur die Warnhinweis-Anzeige unten, siehe
  // defaultLegs()/legsFromSession() in trackEvaluation.ts für die Score-Seite.
  const [hasValidSearchGeometry, setHasValidSearchGeometry] = useState(true);

  useEffect(() => {
    useTrackingStore.getState().reset();   // Flow abgeschlossen → Store leeren
    if (!id) return;
    (async () => {
      const r = await getTrackSessionById(id);
      // Fällt remote nichts zurück (noch nicht synchronisiert / offline) → lokal (SQLite)
      // zusammenbauen, damit die Auswertung nie mit „nicht gefunden" abbricht.
      let d = r.data;
      let localOnly = false;
      if (!d) {
        d = await getLocalTrackDetail(id).catch(() => null); localOnly = !!d;
      } else if (!(d.runs?.length)) {
        // Remote-Session vorhanden, aber der Absuche-Run (track_runs) ist noch nicht
        // synchronisiert → lokale Run-Daten ergänzen, damit Score/Spur nicht fehlen.
        const sup = await getLocalRunSupplement(id).catch(() => null);
        if (sup?.runs?.length) {
          d = {
            ...d, runs: sup.runs,
            track_data: { ...(d.track_data ?? {}), ...sup.track_data },
            articles_found:           d.articles_found ?? sup.articles_found,
            average_deviation_meters: d.average_deviation_meters ?? sup.average_deviation_meters,
            score:                    d.score ?? sup.score,
          };
        }
      }
      setData(d);
      setIsLocalOnly(localOnly);
      if (d) {
        // Root-Cause-Fix (Abschnitt 8 des Audits — "100 Punkte/Vorzüglich
        // trotz 0 m Suchspur"): distance_meters des Absuche-Runs ist das
        // direkteste vorhandene Signal für "hat die Absuche überhaupt
        // verwertbare Geometrie erzeugt" — steuert NUR den Default-Startwert
        // in legsFromSession (siehe trackEvaluation.ts), eine bereits
        // gespeicherte manuelle Bewertung bleibt davon unberührt.
        const hasValidGeometry = ((d.runs?.[0] as { distance_meters?: number | null } | undefined)?.distance_meters ?? 0) > 0;
        setHasValidSearchGeometry(hasValidGeometry);
        setLegs(legsFromSession(d.track_data, d.corners_total ?? 0, d.articles_total ?? 0, hasValidGeometry));
        setNotes(d.notes ?? '');
        // Abschluss-Ansicht → die Fährte dieses Hundes ist nicht mehr „offen".
        if (d.dog_id) useActiveFaehrten.getState().remove(d.dog_id);
      }
      setLoading(false);
    })();
  }, [id]);

  const score = useMemo(() => overallScore(legs), [legs]);
  const verdict = scoreVerdict(score);
  const totalPts = legs.reduce((a, b) => a + b.score, 0);
  const maxPts = legs.reduce((a, b) => a + b.max, 0);
  const tags = extractTags(notes);

  const map = useMemo(() => {
    if (!data) return null;
    // Logbuch-Kartenmodell ausschließlich aus gespeicherten Daten (keine Winkel-/
    // Marker-Neuberechnung); reine Funktion buildTrackDetailMap.
    const detail = buildTrackDetailMap(data);
    const markers: MapMarker[] = detail.markers.map(m => ({
      id: m.id, type: m.type, lat: m.lat, lng: m.lng,
      angleKind: m.angleKind, material: m.material,
      distanceFromStart: m.distanceFromStart, note: m.note,
    }));
    const segments = coerceTrackSegments(data.track_data?.segments);
    const fitPoints = [
      ...detail.lay,
      ...detail.run,
      ...detail.markers.filter(m => m.lat != null && m.lng != null).map(m => ({ lat: m.lat as number, lng: m.lng as number })),
      ...(detail.start ? [detail.start] : []),
      ...(detail.end ? [detail.end] : []),
    ];
    return {
      lay: detail.lay, run: detail.run, markers, segments, fitPoints,
      start: detail.start, end: detail.end, totalDistanceM: detail.totalDistanceM,
      hasGps: detail.hasLay,
    };
  }, [data]);
  // Punkt 14: rein additiv — `undefined` bei Fährten ohne Analyse (ältere
  // Sessions, Freilauf ohne Soll-Fährte, Recovery-Kurzpfad). Dieselbe
  // track_data.run-Quelle wie das bestehende segmentAnalysis oben (lokal via
  // getLocalTrackDetail/getLocalRunSupplement, remote via training_sessions.
  // track_data — runSummaryForTrackData reicht `analytics` unverändert durch,
  // keine Migration nötig).
  const analytics: TrackAnalytics | undefined = data?.track_data?.run?.analytics;
  const isReplayEligible = useMemo(() => isTrackReplayEligible(data), [data]);
  const [analyseExpanded, setAnalyseExpanded] = useState(false);
  const [detailSel, setDetailSel] = useState<TrackDetailSelection | null>(null);
  const [fullscreenMap, setFullscreenMap] = useState(false);
  const [fullscreenSel, setFullscreenSel] = useState<TrackDetailSelection | null>(null);
  const [fullscreenFitToken, setFullscreenFitToken] = useState(0);
  const segmentAnalysis = useMemo(() => analyzeTrackSegments({
    segments: coerceTrackSegments(data?.track_data?.segments),
    layPoints: (data?.points ?? []).map((p: any) => ({ lat: p.latitude, lng: p.longitude, accuracy: p.accuracy ?? null, t: Date.parse(p.timestamp) || 0 })),
    runPoints: ((data?.runs ?? [])[0]?.run_points ?? []),
    markers: (data?.markers ?? []).map((m: any) => ({
      id: m.id, type: m.marker_type, material: m.material ?? null, angleKind: m.angle_kind ?? null,
      lat: m.latitude, lng: m.longitude, accuracy: m.accuracy ?? null,
      distance_from_start: m.distance_from_start ?? 0, note: m.note ?? null, audio_url: m.audio_url ?? null,
      found: !!m.found, t: Date.parse(m.created_at) || 0,
    })),
  }), [data]);

  const onSave = async () => {
    if (!id) return;
    setSaving(true);
    // Lokal-only Fährte: Auswertung lokal speichern + zur Re-Sync einreihen (kein
    // Remote-Direktschreiben ohne Remote-Zeile, kein AI-Embedding ohne Remote-Session).
    if (isLocalOnly) {
      await saveLocalTrackEvaluation(id, { score, notes: notes.trim() || null, legs }).catch(() => {});
      setSaving(false);
      router.replace('/track' as never);
      return;
    }
    const { error } = await saveTrackEvaluation(id, { legs, rating: score, notes: notes.trim() || null });
    setSaving(false);
    if (!error) {
      // Semantik-Embedding (non-blocking) — darf das Speichern nicht aufhalten.
      const surf = data.surface_types?.[0] ?? 'Fährte';
      const text = `Fährte ${surf}, ${data.corners_total ?? 0} Winkel, ${data.articles_total ?? 0} Gegenstände, `
        + `Score ${score}/100${notes.trim() ? `. Notiz: ${notes.trim()}` : ''}`;
      void createEmbeddingForTrackSummary({
        trainingSessionId: id, sourceId: id, content: text, contentSummary: notes.trim() || undefined,
        metadata: {
          dog_id: data.dog_id, category: 'Fährte', score,
          surface_types: data.surface_types ?? [], session_date: data.session_date ?? null,
        },
      });
      router.replace('/track' as never);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={C.trackPrimary} size="large" /></View>;
  if (!data)   return <View style={s.center}><Text style={s.muted}>Fährte nicht gefunden.</Text></View>;

  const dogName = data.dog?.name ?? 'Fährte';
  const surface = data.surface_types?.[0] ?? 'Fährte';
  const corners = data.corners_total ?? 0;
  const aFound = data.articles_found ?? 0;
  const aTotal = data.articles_total ?? 0;

  // Bedingungen (echtes Wetter zur Startposition + Untergrund/Beschaffenheit).
  const weatherCond: string | null = data.weather_condition ?? data.wetter ?? null;
  const temp: number | null     = data.temperature ?? null;
  const wind: number | null     = data.wind_speed ?? null;
  const humidity: number | null = data.humidity ?? null;
  const terrain: string[]       = data.terrain_conditions ?? [];
  const condStats: { icon: IconName; label: string; value: string }[] = [
    ...(weatherCond     ? [{ icon: 'partly-sunny-outline' as IconName, label: 'Wetter',     value: weatherCond }] : []),
    ...(temp != null     ? [{ icon: 'thermometer-outline' as IconName, label: 'Temperatur', value: `${temp.toFixed(1)} °C` }] : []),
    ...(wind != null     ? [{ icon: 'flag-outline'        as IconName, label: 'Wind',       value: `${Math.round(wind)} km/h` }] : []),
    ...(humidity != null ? [{ icon: 'water-outline'       as IconName, label: 'Feuchte',    value: `${Math.round(humidity)} %` }] : []),
  ];
  const condTags = [surface, ...terrain].filter(Boolean);
  const hasConditions = condStats.length > 0 || condTags.length > 0;

  const highlights: { icon: IconName; value: string; label: string }[] = [
    { icon: 'flag',          value: `${aFound}/${aTotal}`, label: 'Gegenstände' },
    { icon: 'git-branch',    value: String(corners),       label: 'Winkel' },
    { icon: 'trail-sign',     value: String(segmentAnalysis.count), label: 'Teilstrecken' },
  ];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <FaehrtenHeader title="AUSWERTUNG" onBack={() => (router.canGoBack() ? router.back() : router.replace('/track' as never))} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Hero */}
          <View style={[s.card, s.cardGlow, s.hero]}>
            <TrackScoreRing value={score} size={118} label="Punkte" sub={verdict.sub} />
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>{dogName} · {relDate(data.session_date ?? data.created_at)}</Text>
              <Text style={s.heroHeadline}>{verdict.headline}</Text>
              <View style={s.tagRow}>
                {data.distance_meters != null && <Tag>{Math.round(data.distance_meters)} m</Tag>}
                <Tag>{surface}</Tag>
                <Tag>{corners} Winkel</Tag>
              </View>
            </View>
          </View>

          {/* Abschnitt 8 des Audits: Absuche hat keine verwertbare Geometrie
              erzeugt (0 m Distanz) — automatische Aussage klar von der
              manuellen Bewertung trennen, kein stiller "100 Punkte"-Anschein. */}
          {!hasValidSearchGeometry && (
            <View style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: 16, backgroundColor: C.trackWarning + '14', borderColor: C.trackWarning + '55', borderWidth: 1 }]}>
              <Ionicons name="information-circle" size={18} color={C.trackWarning} />
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', color: C.trackText }}>
                Automatische Auswertung nicht verfügbar — die Absuche hat keine verwertbare Suchspur aufgezeichnet. Die Punktzahl unten ist noch nicht bewertet, keine automatische Aussage über die Hundeleistung.
              </Text>
            </View>
          )}

          {/* Highlights */}
          <View style={s.highlightRow}>
            {highlights.map((h, i) => (
              <View key={i} style={[s.card, s.highlight]}>
                <Ionicons name={h.icon} size={20} color={C.trackPrimary} />
                <Text style={s.highlightVal}>{h.value}</Text>
                <Text style={s.highlightLabel}>{h.label}</Text>
              </View>
            ))}
          </View>

          {/* Bedingungen — Wetter (echt) + Untergrund/Beschaffenheit */}
          {hasConditions && (
            <>
              <SectionLabel>Bedingungen</SectionLabel>
              <View style={[s.card, { padding: 16, marginBottom: 16 }]}>
                {condStats.length > 0 && (
                  <View style={s.condGrid}>
                    {condStats.map((cnd, i) => (
                      <View key={i} style={s.condItem}>
                        <View style={s.condIcon}><Ionicons name={cnd.icon} size={17} color={C.trackPrimary} /></View>
                        <View style={s.condText}>
                          <Text style={s.condLabel} numberOfLines={1}>{cnd.label}</Text>
                          <Text style={s.condValue} numberOfLines={2} ellipsizeMode="tail">{cnd.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                {condTags.length > 0 && (
                  <View style={[s.tagRow, condStats.length > 0 && { marginTop: 14 }]}>
                    {condTags.map((t, i) => <Tag key={i}>{t}</Tag>)}
                  </View>
                )}
              </View>
            </>
          )}

          {/* Bewertung pro Abschnitt */}
          <SectionLabel>Bewertung pro Abschnitt</SectionLabel>
          <View style={[s.card, { padding: 16, marginBottom: 16 }]}>
            <LegBars rows={legs} editable onChange={(i, v) => setLegs(prev => prev.map((l, j) => j === i ? { ...l, score: v } : l))} />
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>GESAMTPUNKTZAHL</Text>
              <Text style={s.totalVal}>{totalPts}<Text style={s.totalMax}>/{maxPts}</Text></Text>
            </View>
          </View>

          {/* Analyse (Punkt 14) — rein additiv, automatisch aus Sensor-Fusion/
              Track-Analytics-Engine abgeleitet. Bewusst als EIGENER Block unter
              der manuellen Abschnitts-Bewertung, NICHT in die TrackScoreRing/
              den Punkte-Score oben integriert — Track Score 2.0 und der
              manuelle Score (trackEvaluation.ts) sind unabhängige Systeme
              (Punkt 9/11). Ohne `analytics` (ältere Fährten, Freilauf) bleibt
              der Block einfach weg. */}
          {analytics && (
            <>
              <SectionLabel>Analyse</SectionLabel>
              <View style={[s.card, { padding: 16, marginBottom: 16 }]}>
                <View style={s.analyseHeaderRow}>
                  <View>
                    <Text style={s.analyseScoreVal}>{analytics.trackScore}<Text style={s.analyseScoreMax}>/100</Text></Text>
                    <Text style={s.analyseScoreLabel}>TRACK SCORE (AUTOMATISCH)</Text>
                  </View>
                  <View style={[s.confidencePill, analytics.analysisConfidenceBand === 'unreliable' && s.confidencePillWarn]}>
                    <Ionicons
                      name={analytics.analysisConfidenceBand === 'excellent' || analytics.analysisConfidenceBand === 'good' ? 'checkmark-circle' : 'information-circle'}
                      size={13}
                      color={analytics.analysisConfidenceBand === 'unreliable' ? C.trackWarning : C.trackPrimary}
                    />
                    <Text style={s.confidencePillTxt}>Analyse-Grundlage: {CONFIDENCE_BAND_LABEL[analytics.analysisConfidenceBand]}</Text>
                  </View>
                </View>

                {/* Punkt 9: expliziter Hinweis — schlechte GPS-/Motion-Grundlage
                    senkt NIE den Hund-Score, nur die Verlässlichkeit der Analyse. */}
                {analytics.analysisConfidenceHint && (
                  <View style={s.analyseHintBox}>
                    <Text style={s.analyseHintText}>{analytics.analysisConfidenceHint}</Text>
                  </View>
                )}

                {/* Track Replay (Segmentanalyse-Nachbesserung, Punkt 7) — nur
                    sichtbar, wenn wirklich genug Daten vorhanden sind (Analytics
                    v2 + vollständige Zeitstempel je Punkt, Punkt 18). Eigener,
                    strengerer Check als `analytics` oben (das reicht schon für
                    v1-Fährten ohne Replay-Fähigkeit). */}
                {isReplayEligible && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/track/replay/[id]', params: { id: String(id) } } as never)}
                    style={s.replayButton}
                  >
                    <Ionicons name="play-circle-outline" size={18} color={C.trackPrimary} />
                    <Text style={s.replayButtonTxt}>{t('track.replayAction')}</Text>
                    <Ionicons name="chevron-forward" size={15} color={C.trackTextMut} />
                  </Pressable>
                )}

                <View style={[s.highlightRow, { marginTop: 14, marginBottom: 0 }]}>
                  <View style={[s.card, s.highlight]}>
                    <Ionicons name="analytics-outline" size={18} color={C.trackPrimary} />
                    <Text style={s.highlightVal}>{analytics.deviation.meanM.toFixed(1)} m</Text>
                    <Text style={s.highlightLabel}>Ø Spurtreue</Text>
                  </View>
                  <View style={[s.card, s.highlight]}>
                    <Ionicons name="speedometer-outline" size={18} color={C.trackPrimary} />
                    <Text style={s.highlightVal}>{analytics.pace.avgMps.toFixed(1)} m/s</Text>
                    <Text style={s.highlightLabel}>Ø Tempo</Text>
                  </View>
                  <View style={[s.card, s.highlight]}>
                    <Ionicons name="return-up-forward-outline" size={18} color={C.trackPrimary} />
                    <Text style={s.highlightVal}>{analytics.reacquisition.count}</Text>
                    <Text style={s.highlightLabel}>Neuansätze</Text>
                  </View>
                </View>

                {(analytics.corners.length > 0 || analytics.objects.length > 0 || analytics.reacquisition.meanSec != null) && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setAnalyseExpanded(v => !v)}
                    style={s.analyseToggle}
                  >
                    <Text style={s.analyseToggleTxt}>{analyseExpanded ? 'Details verbergen' : 'Details anzeigen'}</Text>
                    <Ionicons name={analyseExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.trackPrimary} />
                  </Pressable>
                )}

                {analyseExpanded && (
                  <View style={{ marginTop: 10, gap: 10 }}>
                    {/* Re-Acquisition-Zeit (Punkt 1/9 der Nachbesserung) — nur wenn
                        mindestens ein Break tatsächlich erholt wurde (meanSec != null,
                        offene Breaks fliessen NICHT ein, siehe trackAnalytics.ts). */}
                    {analytics.reacquisition.meanSec != null && (
                      <View style={s.analyseDetailRow}>
                        <Text style={s.analyseDetailLabel}>Neuaufnahme Ø</Text>
                        <Text style={s.analyseDetailValue}>
                          {analytics.reacquisition.meanSec.toFixed(1)} s
                          {analytics.reacquisition.maxSec != null && analytics.reacquisition.maxSec !== analytics.reacquisition.meanSec
                            ? ` · Längste ${analytics.reacquisition.maxSec.toFixed(1)} s` : ''}
                        </Text>
                      </View>
                    )}
                    {analytics.corners.map((c, i) => (
                      <View key={`corner-${i}`} style={s.analyseDetailRow}>
                        <Text style={s.analyseDetailLabel}>Winkel {i + 1} ({c.side === 'links' ? 'links' : c.side === 'rechts' ? 'rechts' : 'Fachwinkel'})</Text>
                        <Text style={s.analyseDetailValue}>
                          {c.maxLateralDeviationM != null ? `max. ${c.maxLateralDeviationM.toFixed(1)} m` : 'nicht erreicht'}
                          {c.overshootM != null && c.overshootM > 0 ? ` · Überschuss ${c.overshootM.toFixed(1)} m` : ''}
                        </Text>
                      </View>
                    ))}
                    {analytics.objects.map((o, i) => (
                      <View key={`object-${i}`} style={s.analyseDetailRow}>
                        <Text style={s.analyseDetailLabel}>Gegenstand {i + 1}{o.found ? '' : ' (nicht gefunden)'}</Text>
                        <Text style={s.analyseDetailValue}>
                          {o.minDistanceM != null ? `min. ${o.minDistanceM.toFixed(1)} m` : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}

          {/* Fährtenverlauf */}
          <SectionLabel>Fährtenverlauf</SectionLabel>
          <View style={[s.card, s.mapCard]}>
            <View style={StyleSheet.absoluteFill}>
              {map?.hasGps ? (
                <TrackingMap
                  layPoints={map.lay} runPoints={map.run} markers={map.markers} segments={map.segments}
                  startAnchor={map.start} endPoint={map.end} fitToPoints={map.fitPoints}
                  onStartPress={() => setDetailSel({ kind: 'start' })}
                  onMarkerPress={(m) => setDetailSel({ kind: 'marker', marker: m })}
                  onEndPress={() => setDetailSel({ kind: 'end', totalDistanceM: map.totalDistanceM })}
                  onFullscreen={() => setFullscreenMap(true)}
                  currentPosition={null} follow={false} mapType="hybrid"
                />
              ) : (
                <TrackSketch legs={corners} objects={aTotal} w={320} h={190} progress={1} />
              )}
            </View>
            <View style={s.legend}>
              <Legend color={C.trackPrimary} label="Fährte" />
              <Legend color="#fff" label="Gegenstand" square />
              <Legend color={C.trackWarning} label="Korrektur" />
            </View>
          </View>

          {segmentAnalysis.count > 0 && (
            <>
              <SectionLabel>Teilstrecken</SectionLabel>
              <View style={[s.card, { padding: 16, marginBottom: 16, gap: 12 }]}>
                {coerceTrackSegments(data.track_data?.segments).filter(seg => seg.status === 'completed').sort((a, b) => a.startStep - b.startStep).map((segment, index) => (
                  <View key={segment.id} style={s.segmentRow}>
                    <View style={[s.segmentBadge, { backgroundColor: TRACK_SEGMENT_COLORS[segment.type] }]}>
                      <Text style={s.segmentNo}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.segmentTitle}>{segmentDisplayLabel(segment)}</Text>
                      <Text style={s.segmentMeta}>Geplant: {segment.plannedLengthSteps} Schritte · Tatsächlich: {actualSegmentSteps(segment)} Schritte</Text>
                      <Text style={s.segmentMeta}>Beginn bei Schritt {segment.startStep} · Status: abgeschlossen</Text>
                    </View>
                  </View>
                ))}
              </View>

              <SectionLabel>Smart Analyse</SectionLabel>
              <View style={[s.card, { padding: 16, marginBottom: 16 }]}>
                {segmentAnalysis.hints.map((hint, index) => (
                  <Text key={index} style={s.smartHint}>{hint}</Text>
                ))}
              </View>
            </>
          )}

          {/* Notiz */}
          <SectionLabel>Notiz</SectionLabel>
          <View style={[s.card, { padding: 16 }]}>
            <TextInput
              style={s.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Beobachtungen zur Ausarbeitung… (#hashtags möglich)"
              placeholderTextColor={C.trackTextMut}
              multiline
            />
            {tags.length > 0 && (
              <View style={s.tagRow}>{tags.map(t => <Tag key={t}>{t}</Tag>)}</View>
            )}
          </View>

          <View style={{ height: 18 }} />
          <SmartFeedbackSection dogId={data.dog_id} />

          <View style={{ height: 24 }} />
        </ScrollView>

        {/* Footer */}
        <View style={s.footer}>
          <AnyvoButton label="Logbuch" variant="secondary" icon="layers-outline" onPress={() => router.push('/track/historie' as never)} style={{ flex: 1 }} />
          <AnyvoButton label="Speichern" icon="checkmark" onPress={onSave} loading={saving} style={{ flex: 1.4 }} />
        </View>
      </KeyboardAvoidingView>

      <MarkerDetailSheet selection={detailSel} onClose={() => setDetailSel(null)} />

      <Modal
        animationType="slide"
        onRequestClose={() => { setFullscreenMap(false); setFullscreenSel(null); }}
        presentationStyle="fullScreen"
        visible={fullscreenMap}
      >
        <SafeAreaView style={s.fullscreen} edges={['bottom']}>
          <View style={[s.fullscreenHeader, { paddingTop: insets.top }]}>
            <View style={s.fullscreenHeaderContent}>
              <Pressable
                accessibilityLabel="Karte schließen"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => { setFullscreenMap(false); setFullscreenSel(null); }}
                style={s.fullscreenHeaderButton}
              >
                <Ionicons name="close" size={24} color={C.trackText} />
              </Pressable>
              <Text style={s.fullscreenTitle}>Fährte</Text>
              <View style={s.fullscreenHeaderButton} />
            </View>
          </View>
          <View style={s.fullscreenMap}>
            {map?.hasGps && (
              <TrackingMap
                layPoints={map.lay} runPoints={map.run} markers={map.markers} segments={map.segments}
                startAnchor={map.start} endPoint={map.end} fitToPoints={map.fitPoints}
                fitToTrackToken={fullscreenFitToken}
                onStartPress={() => setFullscreenSel({ kind: 'start' })}
                onMarkerPress={(m) => setFullscreenSel({ kind: 'marker', marker: m })}
                onEndPress={() => setFullscreenSel({ kind: 'end', totalDistanceM: map.totalDistanceM })}
                currentPosition={null} showUserLocation={false} follow={false} hideControls mapType="hybrid"
              />
            )}
            <Pressable
              accessibilityLabel="Gesamte Fährte anzeigen"
              accessibilityRole="button"
              onPress={() => setFullscreenFitToken(token => token + 1)}
              style={s.fitButton}
            >
              <Ionicons name="scan-outline" size={17} color="#04110F" />
              <Text style={s.fitButtonText}>Gesamte Fährte</Text>
            </Pressable>
          </View>
          <MarkerDetailSheet selection={fullscreenSel} onClose={() => setFullscreenSel(null)} />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <View style={s.tag}><Text style={s.tagTxt}>{children}</Text></View>;
}

function Legend({ color, label, square }: { color: string; label: string; square?: boolean }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color, borderRadius: square ? 2 : 5, transform: square ? [{ rotate: '45deg' }] : undefined }]} />
      <Text style={s.legendTxt}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.trackBg },
  center:  { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center' },
  muted:   { color: C.trackTextMut, fontSize: 14 },
  content: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 },

  card:     { backgroundColor: C.trackCard, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder },
  cardGlow: { borderColor: C.trackPrimaryDk + '38', shadowColor: C.trackPrimary, shadowOpacity: 0.22, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 5 },

  hero:        { flexDirection: 'row', alignItems: 'center', gap: 18, padding: 20, marginBottom: 14 },
  eyebrow:     { fontSize: 11, color: C.trackTextMut, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 },
  heroHeadline:{ fontSize: 26, color: C.trackText, fontWeight: '900', letterSpacing: -0.5, lineHeight: 26, marginBottom: 10 },

  tagRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  tag:     { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' },
  tagTxt:  { fontSize: 11, color: C.trackTextSec, fontWeight: '600' },

  highlightRow:  { flexDirection: 'row', gap: 10, marginBottom: 16 },
  highlight:     { flex: 1, alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, gap: 6 },
  highlightVal:  { fontSize: 16, color: C.trackText, fontWeight: '900' },
  highlightLabel:{ fontSize: 8, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },

  totalRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.trackBorder },
  totalLabel:{ fontSize: 10, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1.4 },
  totalVal:  { fontSize: 22, color: C.trackPrimary, fontWeight: '900' },
  totalMax:  { fontSize: 14, color: C.trackTextMut, fontWeight: '700' },

  condGrid:  { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 12 },
  condItem:  { width: '46%', flexGrow: 1, flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  condIcon:  { width: 38, height: 38, borderRadius: 12, backgroundColor: C.trackPrimaryDk + '24', alignItems: 'center', justifyContent: 'center' },
  condText:  { flex: 1, minWidth: 0 },
  condLabel: { fontSize: 9, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  condValue: { fontSize: 15, lineHeight: 18, color: C.trackText, fontWeight: '800', marginTop: 1, flexShrink: 1 },

  mapCard: { height: 190, overflow: 'hidden', marginBottom: 16, padding: 0 },
  fullscreen: { flex: 1, backgroundColor: C.trackBg },
  fullscreenHeader: { borderBottomWidth: 1, borderBottomColor: C.trackBorder, backgroundColor: C.trackBg },
  fullscreenHeaderContent: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  fullscreenHeaderButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  fullscreenTitle: { color: C.trackText, fontSize: 17, fontWeight: '800' },
  fullscreenMap: { flex: 1 },
  fitButton: { position: 'absolute', left: 16, bottom: 18, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 12, backgroundColor: C.trackPrimary, borderWidth: 1, borderColor: C.trackPrimaryDk },
  fitButtonText: { color: '#04110F', fontSize: 12, fontWeight: '800' },
  legend:  { position: 'absolute', left: 14, bottom: 12, flexDirection: 'row', gap: 14 },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9 },
  legendTxt: { fontSize: 10, color: C.trackTextSec, fontWeight: '600' },

  notesInput:{ fontSize: 14, color: C.trackText, lineHeight: 21, minHeight: 70, textAlignVertical: 'top' },

  analyseHeaderRow:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  analyseScoreVal:    { fontSize: 26, color: C.trackPrimary, fontWeight: '900', letterSpacing: -0.5 },
  analyseScoreMax:    { fontSize: 14, color: C.trackTextMut, fontWeight: '700' },
  analyseScoreLabel:  { fontSize: 9, color: C.trackTextSec, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 },
  confidencePill:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)', maxWidth: 170 },
  confidencePillWarn: { backgroundColor: C.trackWarning + '1c' },
  confidencePillTxt:  { fontSize: 10, color: C.trackTextSec, fontWeight: '700', flexShrink: 1 },
  analyseHintBox:     { marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.trackBorder },
  analyseHintText:    { fontSize: 11.5, lineHeight: 16, color: C.trackTextSec, fontWeight: '600' },
  replayButton:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.trackBorder },
  replayButtonTxt:    { flex: 1, fontSize: 13, color: C.trackText, fontWeight: '800' },
  analyseToggle:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 14, paddingVertical: 8 },
  analyseToggleTxt:   { fontSize: 12, color: C.trackPrimary, fontWeight: '800' },
  analyseDetailRow:   { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  analyseDetailLabel: { fontSize: 12.5, color: C.trackText, fontWeight: '700', flexShrink: 1 },
  analyseDetailValue: { fontSize: 12, color: C.trackTextSec, fontWeight: '600', textAlign: 'right' },

  segmentRow:   { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  segmentBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  segmentNo:    { fontSize: 11, color: '#04110F', fontWeight: '900' },
  segmentTitle: { fontSize: 14, color: C.trackText, fontWeight: '900' },
  segmentMeta:  { fontSize: 11.5, color: C.trackTextSec, fontWeight: '600', marginTop: 2 },
  smartHint:    { fontSize: 13, color: C.trackTextSec, lineHeight: 19, marginBottom: 8 },

  footer:  { flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 26, borderTopWidth: 1, borderTopColor: C.trackBorder, backgroundColor: C.trackBg },
});
