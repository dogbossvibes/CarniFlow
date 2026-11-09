const mockUnits = jest.fn();
const mockSessions = jest.fn();
const mockFocuses = jest.fn();
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'owner' } } }) }));
jest.mock('@/services/trainingUnitService', () => ({ getTrainingUnits: (...a: unknown[]) => ({ limit: () => mockUnits(...a) }) }));
jest.mock('@/services/training', () => ({ getTrainingSessions: (...a: unknown[]) => ({ or: () => ({ limit: () => mockSessions(...a) }) }) }));
jest.mock('@/services/trainingDocumentService', () => ({ listServerTrainingFocuses: (...a: unknown[]) => mockFocuses(...a) }));

import { loadDogTrainingSummary } from '../useDogTrainingSummary';

const today = new Date(2026, 10, 9);
const unit = (id: string, dog: string, date: string) => ({ id, owner_id: 'owner', dog_id: dog, session_date: date, created_at: date, status: 'completed',
  exercises: [{ discipline: 'Unterordnung', exercise_name: 'Sitz', rating: null, notes: null, duration_sec: null, seq_index: 0 }] });
const session = (id: string, date: string, type?: string) => ({ id, owner_id: 'owner', dog_id: 'dog-a', session_date: date, created_at: date,
  category: 'IGP', title: 'Alt', rating: 3, notes: null, duration_minutes: 10, type });

beforeEach(() => {
  mockUnits.mockResolvedValue({ data: [], error: null });
  mockSessions.mockResolvedValue({ data: [], error: null });
  mockFocuses.mockResolvedValue({ data: [], error: null });
});

describe('loadDogTrainingSummary (T-184 Etappe 2, nur lesend)', () => {
  test('liest nur über bestehende Lese-Abfragen für Konto + Hund', async () => {
    await loadDogTrainingSummary('owner', 'dog-a', today);
    expect(mockUnits).toHaveBeenCalledWith('owner', 'dog-a');
    expect(mockSessions).toHaveBeenCalledWith('owner', 'dog-a');
    expect(mockFocuses).toHaveBeenCalledWith('owner', 'dog-a');
  });

  test('ignoriert Zeilen eines anderen Hundes und Fährten-Sessions', async () => {
    mockUnits.mockResolvedValue({ data: [unit('fremd', 'dog-b', '2026-11-08'), unit('eigen', 'dog-a', '2026-11-01')], error: null });
    mockSessions.mockResolvedValue({ data: [session('track', '2026-11-07', 'track'), session('alt', '2026-11-05')], error: null });
    const s = await loadDogTrainingSummary('owner', 'dog-a', today);
    expect(s.last).toMatchObject({ id: 'alt', source: 'session', disciplines: ['IGP'] });
    expect(s.previous.map(p => p.id)).toEqual(['eigen']);
  });

  test('Hinweis-Fehler verdeckt das letzte Training nicht; Trainings-Fehler wird gemeldet', async () => {
    mockUnits.mockResolvedValue({ data: [unit('eigen', 'dog-a', '2026-11-08')], error: null });
    mockFocuses.mockResolvedValue({ data: null, error: { code: 'OFFLINE' } });
    await expect(loadDogTrainingSummary('owner', 'dog-a', today)).resolves.toMatchObject({ last: { id: 'eigen' }, openHint: null });
    mockUnits.mockResolvedValue({ data: null, error: new Error('offline') });
    await expect(loadDogTrainingSummary('owner', 'dog-a', today)).rejects.toThrow('offline');
  });
});
