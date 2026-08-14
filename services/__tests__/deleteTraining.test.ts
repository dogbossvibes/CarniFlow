/* eslint-disable import/first */
// Vereinheitlichte Delete-Fassade des Trainingsjournals. Deckt ab: korrektes
// Routing je Quelle (track/unit/session), Fehlerdurchreichung (Delete-Fehler →
// Aufrufer lässt Eintrag sichtbar) und dass fremde/RLS-abgelehnte Fährten NICHT
// gelöscht werden (Fehler statt Erfolg).

jest.mock('@/services/trainingUnitService', () => ({
  deleteTrainingUnit: jest.fn(() => Promise.resolve({ error: null })),
}));
jest.mock('@/services/training', () => ({
  deleteTrainingSession: jest.fn(() => Promise.resolve({ error: null })),
}));
jest.mock('@/features/tracking/services/trackService', () => ({
  deleteTrackSession: jest.fn(() => Promise.resolve({ data: null, error: null })),
}));

import { deleteFeedItem } from '@/services/deleteTraining';
import { deleteTrainingUnit } from '@/services/trainingUnitService';
import { deleteTrainingSession } from '@/services/training';
import { deleteTrackSession } from '@/features/tracking/services/trackService';
import type { FeedItem } from '@/services/trainingFeed';

const trackDel = deleteTrackSession as jest.Mock;
const unitDel = deleteTrainingUnit as jest.Mock;
const sessDel = deleteTrainingSession as jest.Mock;

const item = (source: FeedItem['source'], id = 'id-1'): FeedItem =>
  ({ id, source } as unknown as FeedItem);

beforeEach(() => jest.clearAllMocks());

describe('deleteFeedItem — Routing je Quelle', () => {
  it('Fährte (track) → deleteTrackSession mit exakter ID, Erfolg', async () => {
    const res = await deleteFeedItem(item('track', 'track-42'));
    expect(trackDel).toHaveBeenCalledWith('track-42');
    expect(unitDel).not.toHaveBeenCalled();
    expect(sessDel).not.toHaveBeenCalled();
    expect(res).toEqual({ error: null });
  });

  it('normales Training (unit) → deleteTrainingUnit (unverändert)', async () => {
    const res = await deleteFeedItem(item('unit', 'unit-7'));
    expect(unitDel).toHaveBeenCalledWith('unit-7');
    expect(trackDel).not.toHaveBeenCalled();
    expect(res).toEqual({ error: null });
  });

  it('Legacy-Session (session) → deleteTrainingSession (unverändert)', async () => {
    const res = await deleteFeedItem(item('session', 'sess-9'));
    expect(sessDel).toHaveBeenCalledWith('sess-9');
    expect(trackDel).not.toHaveBeenCalled();
    expect(res).toEqual({ error: null });
  });
});

describe('deleteFeedItem — Fehlerfälle (Eintrag bleibt sichtbar)', () => {
  it('fremde / RLS-abgelehnte Fährte → Fehler, NICHT gelöscht', async () => {
    trackDel.mockResolvedValueOnce({ data: null, error: 'row-level security violation' });
    const res = await deleteFeedItem(item('track', 'foreign-track'));
    expect(res.error).toBe('row-level security violation');
  });

  it('Delete-Fehler bei unit reicht error.message durch', async () => {
    unitDel.mockResolvedValueOnce({ error: { message: 'network down' } });
    const res = await deleteFeedItem(item('unit'));
    expect(res.error).toBe('network down');
  });

  it('geworfene Ausnahme wird zu error (kein Throw an den Aufrufer)', async () => {
    trackDel.mockRejectedValueOnce(new Error('boom'));
    const res = await deleteFeedItem(item('track'));
    expect(res.error).toBe('boom');
  });
});
