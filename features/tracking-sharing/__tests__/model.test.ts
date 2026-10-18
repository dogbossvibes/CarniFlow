import { projectSharing, sharingActionRoute } from '../model';
import type { ExchangeSummary } from '@/features/tracking-exchange/repository';
import type { TransferOffer } from '@/features/tracking-transfer/service';
const task = (role: 'incoming' | 'outgoing', extra: Partial<ExchangeSummary> = {}): ExchangeSummary => ({ taskId: 'actual-task', parentId: 'local-parent', role, title: 'Actual saved title', referenceDigest: 'digest', createdAtMs: 10, finishedContributions: 0, returns: [], ...extra });
const transfer = (status: TransferOffer['status'] = 'pending'): TransferOffer => ({ transferId: 'server-id', senderUserId: 'A', recipientUserId: 'B', sourceTrainingId: 'source', referenceDigest: 'digest', createdAtMs: 20, expiresAtMs: 40, status });
it('projects real task and parent identities without exchanging wire and local IDs', () => {
  const p = projectSharing([task('incoming')], { incoming: [transfer()], outgoing: [] }, 30);
  expect(p.actionable).toBe(2); expect(p.incoming.map(i => i.route)).toEqual([
    { pathname: '/track/transfer', params: { transferId: 'server-id', view: 'incoming' } },
    { pathname: '/track/share', params: { taskId: 'actual-task' } },
  ]);
});
it('counts only known actions, expires offers at server time, preserves terminal states', () => {
  expect(projectSharing([], { incoming: [transfer()], outgoing: [] }, 40).actionable).toBe(0);
  for (const status of ['accepted', 'revoked', 'expired', 'unavailable'] as const) {
    const p = projectSharing([], { incoming: [transfer(status)], outgoing: [] }, 100);
    expect(p.actionable).toBe(0); expect(p.incoming[0].statusKey).toBe(status); expect(p.incoming[0].titleKey).toBe('trackTransfer');
  }
  expect(projectSharing([task('incoming', { finishedContributions: 1 })], { incoming: [], outgoing: [] }, 0).incoming[0].statusKey).toBe('contributionSaved');
});
it('does not claim file delivery and labels applied returns as already applied', () => {
  const p = projectSharing([task('outgoing', { returns: [{ id: 'receipt', name: 'Saved return', createdAtMs: 30 }] })], { incoming: [], outgoing: [] }, 0);
  expect(p.actionable).toBe(0); expect(p.incoming[0]).toMatchObject({ title: 'Saved return', statusKey: 'returnApplied', route: { pathname: '/track/verleitungen', params: { id: 'local-parent' } } });
  expect(projectSharing([task('outgoing')], { incoming: [], outgoing: [] }, 0).outgoing[0].statusKey).toBe('filePrepared');
});
it('preserves sourceId only for source-dependent actions and never mutates on route selection', () => {
  expect(sharingActionRoute('transfer', 'own-id')).toEqual({ pathname: '/track/transfer', params: { sourceId: 'own-id', compose: '1' } });
  expect(sharingActionRoute('distraction', 'own-id')).toEqual({ pathname: '/track/share', params: { sourceId: 'own-id', mode: 'compose' } });
  expect(sharingActionRoute('groups', 'own-id')).toEqual({ pathname: '/track/group-tasks', params: { sourceId: 'own-id' } });
  expect(sharingActionRoute('file', 'own-id')).toEqual({ pathname: '/track/share', params: { mode: 'file' } });
});
