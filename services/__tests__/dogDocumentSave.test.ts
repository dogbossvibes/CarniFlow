import { saveDogDocument } from '@/services/dogDocumentSave';

const mockUpload = jest.fn();
const mockInsert = jest.fn();
const mockRows = jest.fn();
const mockRemove = jest.fn();
const mockCapture = jest.fn();
const mockBucket = jest.fn();

jest.mock('@/services/storage', () => ({ uploadDogDocument: (...a: unknown[]) => mockUpload(...a) }));
jest.mock('@/services/dogHub', () => ({ addDogDocument: (...a: unknown[]) => mockInsert(...a) }));
jest.mock('@/lib/monitoring', () => ({ captureError: (...a: unknown[]) => mockCapture(...a) }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: (col: string, val: string) => ({ limit: () => mockRows(col, val) }) }) }),
    storage: { from: (bucket: string) => { mockBucket(bucket); return { remove: (paths: string[]) => mockRemove(paths) }; } },
  },
}));

const PATH = 'user-1/dog-1/1_plan.pdf';
const FILE = { uri: 'local.pdf', name: 'plan.pdf', mime: 'application/pdf' };
const INPUT = { kind: 'gesundheit', title: 'Plan', issued_on: null, note: null };
const save = () => saveDogDocument('dog-1', FILE, INPUT);

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockResolvedValue(PATH);
  mockInsert.mockResolvedValue({ error: null });
  mockRows.mockResolvedValue({ data: [], error: null });
  mockRemove.mockResolvedValue({ error: null });
});

describe('saveDogDocument', () => {
  it('lädt hoch und legt die Zeile mit dem Objektpfad an', async () => {
    await expect(save()).resolves.toEqual({ ok: true });
    expect(mockUpload).toHaveBeenCalledWith('local.pdf', 'dog-1', 'plan.pdf', 'application/pdf');
    expect(mockInsert).toHaveBeenCalledWith('dog-1', { ...INPUT, file_url: PATH });
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('meldet einen gescheiterten Upload als Upload-Fehler und legt keine Zeile an', async () => {
    mockUpload.mockRejectedValue(new Error('netz'));
    await expect(save()).resolves.toEqual({ ok: false, stage: 'upload' });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('entfernt die verwaiste Datei, wenn die Zeile nachweislich fehlt', async () => {
    mockInsert.mockResolvedValue({ error: { code: '42501', message: 'rls' } });
    await expect(save()).resolves.toEqual({ ok: false, stage: 'record' });
    expect(mockRows).toHaveBeenCalledWith('file_url', PATH);
    expect(mockBucket).toHaveBeenCalledWith('dog-documents');
    expect(mockRemove).toHaveBeenCalledWith([PATH]);
  });

  it('räumt auch auf, wenn das Anlegen der Zeile wirft', async () => {
    mockInsert.mockRejectedValue(new Error('Nicht eingeloggt'));
    await expect(save()).resolves.toEqual({ ok: false, stage: 'record' });
    expect(mockRemove).toHaveBeenCalledWith([PATH]);
  });

  // Kundendatenerhalt: Antwort verloren, Zeile aber angelegt → Datei bleibt.
  it('wertet eine trotz Fehler vorhandene Zeile als Erfolg und löscht nichts', async () => {
    mockInsert.mockRejectedValue(new Error('Network request failed'));
    mockRows.mockResolvedValue({ data: [{ id: 'doc-1' }], error: null });
    await expect(save()).resolves.toEqual({ ok: true });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it.each([
    ['Fehlerantwort', () => mockRows.mockResolvedValue({ data: null, error: { message: 'offline' } })],
    ['Ausnahme', () => mockRows.mockRejectedValue(new Error('offline'))],
  ])('lässt die Datei liegen, wenn die Nachprüfung scheitert (%s)', async (_name, arrange) => {
    mockInsert.mockResolvedValue({ error: { message: 'timeout' } });
    arrange();
    await expect(save()).resolves.toEqual({ ok: false, stage: 'record' });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('bleibt beim Zeilen-Fehler, auch wenn das Aufräumen scheitert', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'rls' } });
    mockRemove.mockRejectedValue(new Error('storage'));
    await expect(save()).resolves.toEqual({ ok: false, stage: 'record' });
  });

  it('meldet Fehler ohne Pfad und ohne IDs', async () => {
    mockInsert.mockResolvedValue({ error: { code: '42501', message: 'rls' } });
    await save();
    expect(mockCapture).toHaveBeenCalledWith(expect.anything(), { scope: 'dog-document-save', stage: 'record', code: '42501' });
    expect(JSON.stringify(mockCapture.mock.calls.map(c => c[1]))).not.toContain('user-1');
  });
});
