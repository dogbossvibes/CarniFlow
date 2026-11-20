import { supabase } from '@/lib/supabase';
import { captureError } from '@/lib/monitoring';
import { addDogDocument, type DogDocumentInput } from '@/services/dogHub';
import { uploadDogDocument } from '@/services/storage';

// Dokument speichern = Datei hochladen + Zeile in dog_documents anlegen.
//
// Die beiden Schritte können getrennt scheitern. Das Ergebnis nennt den
// Schritt, damit das Formular die passende Meldung zeigt, statt jeden Fehler
// als «Upload fehlgeschlagen» auszugeben.
//
// Scheitert erst die Zeile, läge die bereits hochgeladene Datei ohne Eintrag
// im Speicher. Sie wird deshalb wieder entfernt – aber NUR, wenn eine
// Nachprüfung belegt, dass keine Zeile auf sie verweist (Kundendatenerhalt):
//   - Zeile vorhanden (z. B. Antwort ging unterwegs verloren) → Erfolg.
//   - Nachprüfung selbst gescheitert (z. B. offline)           → Datei bleibt.
export type SaveDogDocumentResult = { ok: true } | { ok: false; stage: 'upload' | 'record' };

export interface DogDocumentFile { uri: string; name: string; mime: string }

const errorCode = (e: unknown): string | null => {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
};

// Meldet ohne Pfade/IDs (der Objektpfad enthält die User-ID).
const report = (e: unknown, stage: string) =>
  captureError(e, { scope: 'dog-document-save', stage, code: errorCode(e) });

type RowCheck = 'exists' | 'missing' | 'unknown';

async function rowForPath(path: string): Promise<RowCheck> {
  try {
    const { data, error } = await supabase.from('dog_documents').select('id').eq('file_url', path).limit(1);
    if (error || !Array.isArray(data)) return 'unknown';
    return data.length > 0 ? 'exists' : 'missing';
  } catch {
    return 'unknown';
  }
}

export async function saveDogDocument(
  dogId: string,
  file: DogDocumentFile,
  input: Omit<DogDocumentInput, 'file_url'>,
): Promise<SaveDogDocumentResult> {
  let path: string;
  try {
    path = await uploadDogDocument(file.uri, dogId, file.name, file.mime);
  } catch (e) {
    report(e, 'upload');
    return { ok: false, stage: 'upload' };
  }

  let recordError: unknown;
  try {
    const { error } = await addDogDocument(dogId, { ...input, file_url: path });
    if (!error) return { ok: true };
    recordError = error;
  } catch (e) {
    recordError = e;
  }

  const check = await rowForPath(path);
  if (check === 'exists') return { ok: true };

  report(recordError, 'record');
  if (check === 'missing') {
    try {
      const { error } = await supabase.storage.from('dog-documents').remove([path]);
      if (error) report(error, 'cleanup');
    } catch (e) {
      report(e, 'cleanup');
    }
  }
  return { ok: false, stage: 'record' };
}
