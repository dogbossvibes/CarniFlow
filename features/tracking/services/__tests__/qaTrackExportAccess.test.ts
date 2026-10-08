import { setDiagnosticsSession, resolveDiagnosticsAccess, getDiagnosticsAccessSnapshot, revokeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
import { buildExportForSession, copyQaExport, shareQaExport, listRecentLaySessions } from '../qaTrackExportService';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

const mockRefresh = jest.fn(async () => {});
const mockSession = jest.fn();
const mockPoints = jest.fn();
jest.mock('@/services/diagnosticsAccessService', () => ({ refreshDiagnosticsAccess: () => mockRefresh() }));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: () => mockSession(), getLocalTrainingSessions: async () => [],
}));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getLayTrackPointsBySession: () => mockPoints(), getTrackMarkersBySession: async () => [],
}));
jest.mock('@/features/tracking/utils/qaSessionCapture', () => ({ loadQaSessionCapture: async () => null }));
jest.mock('@/features/tracking/utils/qaSearchCapture', () => ({ loadQaSearchCapture: async () => null }));
jest.mock('@/features/tracking/utils/qaRecordingEvidenceStore', () => ({ loadQaRecordingEvidence: async () => ({ schemaVersion: 1, availability: { lay: 'missing', search: 'missing' }, lay: [], search: [] }) }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => {}) }));
jest.mock('expo-file-system/legacy', () => ({ cacheDirectory: 'cache/', writeAsStringAsync: jest.fn(async () => {}) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => {}) }));
const grant = (id = 'owner') => { setDiagnosticsSession(id); resolveDiagnosticsAccess(id, getDiagnosticsAccessSnapshot().generation, true); };
beforeEach(() => {
  jest.useFakeTimers(); setDiagnosticsSession(null); jest.clearAllMocks();
  mockSession.mockReset().mockResolvedValue({ user_id: 'owner' }); mockPoints.mockReset().mockResolvedValue([]);
  mockRefresh.mockReset().mockResolvedValue(undefined);
  (FileSystem.writeAsStringAsync as jest.Mock).mockReset().mockResolvedValue(undefined);
});
afterEach(() => { revokeDiagnosticsAccess(); jest.useRealTimers(); });
it('denies direct export/list entry without permission before reading session data', async () => {
  await expect(buildExportForSession('session')).rejects.toThrow();
  await expect(listRecentLaySessions('owner')).rejects.toThrow();
  expect(mockSession).not.toHaveBeenCalled(); expect(mockPoints).not.toHaveBeenCalled();
});
it('never exports another account session or another owner list', async () => {
  grant(); mockSession.mockResolvedValue({ user_id: 'other' });
  await expect(buildExportForSession('session')).rejects.toThrow('angemeldeten Account');
  await expect(listRecentLaySessions('other')).rejects.toThrow('Fremder Account');
  expect(mockPoints).not.toHaveBeenCalled();
});
it('fresh server denial blocks export even while an old grant was still valid', async () => {
  grant(); mockRefresh.mockImplementationOnce(async () => revokeDiagnosticsAccess());
  await expect(buildExportForSession('session')).rejects.toThrow(); expect(mockSession).not.toHaveBeenCalled();
});
it('discards an export whose database read finishes after account switch', async () => {
  grant(); mockSession.mockImplementationOnce(async () => { setDiagnosticsSession('other'); return { user_id: 'owner' }; });
  await expect(buildExportForSession('session')).rejects.toThrow(); expect(mockPoints).not.toHaveBeenCalled();
});
it('cannot share/copy a previous grant export after revoke and regrant', async () => {
  grant(); const exported = await buildExportForSession('session'); revokeDiagnosticsAccess(); grant();
  await expect(copyQaExport(exported)).rejects.toThrow(); await expect(shareQaExport(exported)).rejects.toThrow();
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled(); expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
it('rechecks access before clipboard/share and after asynchronous file creation', async () => {
  grant(); const exported = await buildExportForSession('session');
  (FileSystem.writeAsStringAsync as jest.Mock).mockImplementationOnce(async () => revokeDiagnosticsAccess());
  await expect(shareQaExport(exported)).rejects.toThrow(); expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
it('permits sharing/copying only the own-session export with fresh permission', async () => {
  grant(); const exported = await buildExportForSession('session');
  await copyQaExport(exported); await shareQaExport(exported);
  expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1); expect(Sharing.shareAsync).toHaveBeenCalledTimes(1);
  expect(mockRefresh).toHaveBeenCalledTimes(3);
});
