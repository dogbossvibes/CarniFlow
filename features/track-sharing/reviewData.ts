import { trackAnalysisAvailability } from '@/features/tracking/utils/trackAnalysisState';

// Presentation only: format saved values, never reconstruct or calculate analytics.
type RecordData = Record<string, unknown>;
export type ReviewRow = { label: string; value: string };
export type ReviewSection = { title: string; rows: ReviewRow[] };
const record = (value: unknown): RecordData => value && typeof value === 'object' ? value as RecordData : {};
const array = (value: unknown): RecordData[] => Array.isArray(value) ? value.map(record) : [];
const missing = 'Nicht verfügbar';
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const metric = (value: unknown, unit = '', digits = 1): string => number(value) ? `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}` : missing;
const text = (value: unknown): string => typeof value === 'string' && value.trim() ? value : missing;
const percent = (value: unknown): string => number(value) && value >= 0 && value <= 1 ? metric(value * 100, '%', 0) : missing;
const date = (value: unknown): string => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('de-CH') : missing;
const labels: Record<string, string> = {
  excellent: 'Sehr hoch', good: 'Hoch', limited: 'Eingeschränkt', unreliable: 'Unzuverlässig',
  links: 'Links', rechts: 'Rechts', unbekannt: 'Unbekannt', rechtwinklig: 'Rechtwinklig', spitz: 'Spitz',
  clean: 'Sauber', short_control_phase: 'Kurze Kontrollphase', likely_overshoot: 'Wahrscheinliches Überschiessen',
  longer_search_phase: 'Längere Suchphase', reacquisition_required: 'Wiederaufnahme erforderlich', not_reliably_assessable: 'Nicht zuverlässig beurteilbar',
  likely_contact: 'Wahrscheinlicher Kontakt', inconclusive: 'Nicht eindeutig', no_clear_contact: 'Kein klarer Kontakt', insufficient_data: 'Zu wenig Daten',
  stationary: 'Stationär', walked_past: 'Vorbeigelaufen',
  sustained_slowdown: 'Anhaltende Verlangsamung', stable_stop: 'Stabiler Halt', poor_gps: 'Eingeschränkte GPS-Qualität',
  insufficient_samples: 'Zu wenige Messpunkte', passed_without_stop: 'Ohne Halt passiert', motion_consistent: 'Bewegung konsistent',
  gps_outlier_near_object: 'GPS-Ausreisser beim Gegenstand', continued_after_object: 'Nach Gegenstand weitergelaufen',
  'track.segments.highlights.lowestDeviation': 'Geringste Abweichung',
  'track.segments.highlights.highestDeviation': 'Grösste Abweichung',
  'track.segments.highlights.fastestReacquisition': 'Schnellste Wiederaufnahme',
  'track.segments.highlights.mostUncertain': 'Unsicherster Abschnitt',
};
const label = (value: unknown): string => typeof value === 'string' ? labels[value] ?? missing : missing;
const row = (label: string, value: string): ReviewRow => ({ label, value });

export function buildReviewSections(source: unknown): ReviewSection[] {
  const track = record(source), run = record(record(track.track_data).run), engine = record(track.engine);
  const saved = trackAnalysisAvailability(track).analytics;
  const a = record(saved), deviation = record(a.deviation), pace = record(a.pace), recovery = record(a.reacquisition);
  // Same session duration precedence as trainingFeed. Payload is the persisted offline run fallback.
  const duration = track.search_duration_seconds ?? track.duration_seconds ?? run.duration_seconds ?? array(track.runs)[0]?.duration_seconds;
  const sections: ReviewSection[] = [{ title: 'Übersicht', rows: [
    row('Hund', text(record(track.dog).name)), row('Besitzer', text(track.owner_name)),
    row('Datum', text(track.session_date)), row('Start', date(track.started_at)), row('Ende', date(track.ended_at)),
    row('Dauer', metric(duration, 's', 0)), row('Legedauer', metric(track.laying_duration_seconds, 's', 0)),
    row('Distanz', metric(track.distance_meters, 'm')),
    row('Wetter', text(track.weather_condition ?? track.wetter)), row('Temperatur', metric(track.temperature, '°C')),
    row('Wind', metric(track.wind_speed, 'km/h')), row('Luftfeuchtigkeit', metric(track.humidity, '%')),
    row('Notizen', text(track.notes)),
  ] }, { title: 'Fährtenqualität', rows: [
    row('GPS-Genauigkeit (Ø)', metric(track.gps_quality_average ?? engine.average_accuracy, 'm')),
    row('Analysekonfidenz', label(a.analysisConfidenceBand)), row('Analysekonfidenz (%)', percent(a.analysisConfidence)),
    row('Analysehinweis', text(a.analysisConfidenceHint)), row('Track Score', metric(a.trackScore, '/ 100', 0)),
    row('Beurteilbare Strecke', metric(record(a.assessableDistance).percent, '%')),
    row('Abweichung Ø', metric(deviation.meanM, 'm')), row('Abweichung Median', metric(deviation.medianM, 'm')),
    row('Abweichung P95', metric(deviation.p95M, 'm')), row('Maximale zuverlässige Abweichung', metric(deviation.maxReliableM, 'm')),
    row('Maximale rohe Abweichung', metric(deviation.maxRawM, 'm')),
    row('Innerhalb 1,5 m', metric(deviation.timeWithinM15S, 's')), row('Innerhalb 2 m', metric(deviation.timeWithinM2S, 's')),
    row('Ausserhalb 3 m', metric(deviation.timeOutsideM3S, 's')), row('Ausserhalb 5 m', metric(deviation.timeOutsideM5S, 's')),
    row('Tempo Ø', metric(pace.avgMps, 'm/s', 2)), row('Tempo Median', metric(pace.medianMps, 'm/s', 2)),
    row('Tempokonstanz', percent(pace.consistency)), row('Stop-and-go-Phasen', metric(pace.stopGoPhases, '', 0)),
    row('Neuansätze', metric(recovery.count, '', 0)), row('Abgeschlossene Wiederaufnahmen', metric(recovery.completedCount, '', 0)),
    row('Wiederaufnahme Ø', metric(recovery.meanSec, 's')), row('Wiederaufnahme maximal', metric(recovery.maxSec, 's')),
  ] }];
  const corners = array(a.corners);
  if (!corners.length) sections.push({ title: 'Winkelanalyse', rows: [row('Analyse', missing)] });
  corners.forEach((c, index) => sections.push({ title: `Winkelanalyse · Winkel ${index + 1}`, rows: [
    row('Position', metric(c.atM, 'm')), row('Seite', label(c.side)), row('Art', label(c.sharpness)),
    row('Overshoot', metric(c.overshootM, 'm')), row('Konfidenz', percent(c.confidence)), row('Beurteilung', label(c.interpretation)),
    row('Ankunft seit Suchbeginn', metric(c.arrivalTSec, 's')), row('Minimaler Abstand', metric(c.minDistanceM, 'm')),
    row('Maximale seitliche Abweichung', metric(c.maxLateralDeviationM, 'm')),
    row('Tempo davor', metric(c.speedBeforeMps, 'm/s', 2)), row('Tempo danach', metric(c.speedAfterMps, 'm/s', 2)),
    row('Tempoänderung', metric(c.speedChangePercent, '%')), row('Wiederaufnahme', metric(c.reacquisitionSec, 's')),
    row('Stabilisierung (Zeit)', metric(c.stabilizationTimeSec, 's')), row('Stabilisierung (Distanz)', metric(c.stabilizationDistanceM, 'm')),
  ] }));
  const objects = array(a.objects);
  if (!objects.length) sections.push({ title: 'Gegenstandsanalyse', rows: [row('Analyse', missing)] });
  objects.forEach((o, index) => sections.push({ title: `Gegenstandsanalyse · Gegenstand ${number(o.objectIndex) ? o.objectIndex : index + 1}`, rows: [
    row('Position', metric(o.alongTrackPositionM ?? o.atM, 'm')), row('Schenkel', metric(o.legIndex, '', 0)),
    row('Material', text(o.material)), row('Minimaler Abstand', metric(o.minRecordedDistanceM ?? o.minDistanceM, 'm')),
    row('Tempo davor', metric(o.speedBeforeMps ?? o.approachSpeedMps, 'm/s', 2)), row('Minimaltempo', metric(o.minimumSpeedMps, 'm/s', 2)),
    row('Tempo danach', metric(o.speedAfterMps, 'm/s', 2)), row('Stillstand', metric(o.stopDurationSec, 's')),
    row('Zeit im Bereich', metric(o.timeInAreaSec, 's')), row('Verhalten', label(o.status ?? o.behavior)),
    row('Kontaktkonfidenz', percent(o.contactConfidence)),
    row('Zeitfenster Beginn', metric(o.proximityWindowStartSec, 's')), row('Zeitfenster Ende', metric(o.proximityWindowEndSec, 's')),
    row('Hinweise', Array.isArray(o.reasonCodes) ? o.reasonCodes.map(label).join(' · ') || missing : missing),
  ] }));
  array(a.deviationEvents).forEach((event, index) => sections.push({ title: `Abweichungsphase ${index + 1}`, rows: [
    row('Position', metric(event.startAlongTrackM, 'm')), row('Dauer', metric(event.durationSec, 's')),
    row('Maximale Abweichung', metric(event.maxLineDeviationM, 'm')), row('Konfidenz', percent(event.confidence)),
    row('Rückkehr (Zeit)', metric(event.recoveryTimeSec, 's')), row('Rückkehr (Distanz)', metric(event.recoveryDistanceM, 'm')),
  ] }));
  const highlights = array(a.segmentHighlights);
  if (highlights.length) sections.push({ title: 'Analysehinweise', rows: highlights.map(h => row(`${label(h.labelKey)} · Abschnitt ${metric(h.segmentIndex, '', 0)}`, text(h.valueText))) });
  return sections;
}
