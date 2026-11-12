import { isScoredObject, isTrainingJoker } from './objectMarkers';

const record = (x: unknown): Record<string, unknown> => x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {};
const count = (x: unknown): number | null => typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : null;
/** Read-only projection for old recordings; never subtract guessed joker findings. */
export function scoredObjectSummary(value: unknown): { total: number | null; found: number | null; hasJokers: boolean } {
  const d = record(value), run = record(record(d.track_data).run);
  const markers = Array.isArray(d.markers) ? d.markers.map(record) : null;
  const hasJokers = !!markers?.some(m => (m.marker_type ?? m.type) === 'gegenstand' && isTrainingJoker(typeof m.material === 'string' ? m.material : null));
  const total = hasJokers ? markers!.filter(m => isScoredObject({ type: String(m.marker_type ?? m.type), material: typeof m.material === 'string' ? m.material : null })).length : count(d.articles_total ?? run.total_objects) ?? (markers?.length ? markers.filter(m => isScoredObject({ type: String(m.marker_type ?? m.type), material: typeof m.material === 'string' ? m.material : null })).length : null);
  if (!hasJokers) return { total, found: count(d.articles_found ?? run.articles_found), hasJokers };
  const hasDisplayedRun = Array.isArray(d.runs) && d.runs.length > 0;
  const row = hasDisplayedRun ? record((d.runs as unknown[])[0]) : {};
  // An embedded snapshot cannot explain a separate displayed run without a binding.
  const matchesRun = !hasDisplayedRun || (typeof row.id === 'string' && row.id.trim().length > 0 && row.id === run.run_id);
  const snapshot = matchesRun ? record(run.object_snapshot) : {};
  const entries = snapshot.version === 1 && Array.isArray(snapshot.objects) ? snapshot.objects.map(record) : null;
  // Validate the original sequence before removing joker entries (legacy snapshots include them).
  const ids = new Set<string>();
  const valid = entries?.every((entry, index) => {
    if (typeof entry.id !== 'string' || !entry.id.trim() || ids.has(entry.id) || entry.index !== index) return false;
    ids.add(entry.id);
    return true;
  });
  const objects = valid ? entries!.filter(o => !isTrainingJoker(typeof o.material === 'string' ? o.material : null)) : null;
  const complete = objects && objects.length === total && objects.every(o => ['manual_found', 'auto_dwell_found', 'missed', 'user_removed'].includes(String(o.recordedStatus)));
  return { total, found: complete ? objects!.filter(o => ['manual_found', 'auto_dwell_found'].includes(String(o.recordedStatus))).length : null, hasJokers };
}
