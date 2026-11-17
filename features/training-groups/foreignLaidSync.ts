import { supabase } from '@/lib/supabase';
import { FOREIGN_LAID_KEY, isForeignLaidGroupTrack } from './foreignLaidLine';

// Fährten, die vor dem Sync-Nachtrag hochgeladen wurden, tragen die Markierung «übernommene
// Gruppenfährte» auf dem Server noch nicht. Öffnet die Besitzerin die Fährte auf dem Gerät mit der
// lokalen Kopie, wird die Markierung einmalig ergänzt, damit der Schutz der gelegten Linie auch auf
// einem zweiten Gerät oder nach einer Neuinstallation greift.
//
// Rein additiv: Es wird nur der Schlüssel `groupTrack` in track_data der EIGENEN Zeile ergänzt, alle
// vorhandenen Felder bleiben erhalten (gleiches Muster wie searchHandlerDistanceM in trackService.ts).
// Fehler bleiben still; der nächste Versuch folgt beim nächsten Öffnen.
export async function backfillForeignLaidMarker(sessionId: string, ownerId: string, marker: Record<string, unknown>): Promise<'written' | 'present' | 'skipped'> {
  try {
    const { data, error } = await supabase.from('training_sessions').select('track_data').eq('id', sessionId).eq('owner_id', ownerId).maybeSingle();
    if (error || !data) return 'skipped';
    const raw = (data as { track_data?: unknown }).track_data;
    // Unerwartete Form (z. B. Liste): nichts überschreiben.
    if (raw != null && (typeof raw !== 'object' || Array.isArray(raw))) return 'skipped';
    const current = (raw ?? {}) as Record<string, unknown>;
    if (isForeignLaidGroupTrack({ track_data: current })) return 'present';
    const result = await supabase.from('training_sessions').update({ track_data: { ...current, [FOREIGN_LAID_KEY]: marker } })
      .eq('id', sessionId).eq('owner_id', ownerId);
    return result.error ? 'skipped' : 'written';
  } catch { return 'skipped'; }
}
