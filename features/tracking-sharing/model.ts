import type { ExchangeSummary } from '@/features/tracking-exchange/repository';
import type { TransferOffer } from '@/features/tracking-transfer/service';
export type SharingTab = 'overview' | 'inbox' | 'sent';
export interface SharingItem {
  id: string; kind: 'transfer' | 'request' | 'return'; titleKey?: string; title?: string;
  contactId?: string; createdAtMs: number; statusKey: string; needsAction: boolean;
  route: { pathname: '/track/transfer' | '/track/share' | '/track/verleitungen'; params: Record<string, string> };
}
export interface SharingProjection { incoming: SharingItem[]; outgoing: SharingItem[]; actionable: number }
/** Pure UI projection. It never upgrades a local file export into a confirmed delivery. */
export function projectSharing(local: ExchangeSummary[], transfers: { incoming: TransferOffer[]; outgoing: TransferOffer[] }, serverNowMs: number): SharingProjection {
  const mapTransfer = (offer: TransferOffer, incoming: boolean): SharingItem => {
    const status = offer.status === 'pending' && offer.expiresAtMs <= serverNowMs ? 'expired' : offer.status;
    return { id: `transfer:${offer.transferId}`, kind: 'transfer', titleKey: incoming && status === 'pending' ? 'receivedTrack' : 'trackTransfer',
      contactId: incoming ? offer.senderUserId : offer.recipientUserId, createdAtMs: offer.createdAtMs,
      statusKey: status === 'pending' ? incoming ? 'ready' : 'offered' : status,
      needsAction: incoming && status === 'pending',
      route: { pathname: '/track/transfer', params: { view: incoming ? 'incoming' : 'outgoing', transferId: offer.transferId } } };
  };
  const incoming = transfers.incoming.map(o => mapTransfer(o, true)), outgoing = transfers.outgoing.map(o => mapTransfer(o, false));
  for (const task of local) {
    const item: SharingItem = { id: `request:${task.taskId}`, kind: 'request', title: task.title, createdAtMs: task.createdAtMs,
      statusKey: task.role === 'outgoing' ? task.returns.length ? 'returnApplied' : 'filePrepared' : task.finishedContributions ? 'contributionSaved' : 'recordNeeded',
      needsAction: task.role === 'incoming' && !task.finishedContributions,
      route: { pathname: '/track/share', params: { taskId: task.taskId } } };
    (task.role === 'incoming' ? incoming : outgoing).push(item);
    for (const receipt of task.returns) incoming.push({ id: `return:${task.taskId}:${receipt.id}`, kind: 'return', title: receipt.name,
      createdAtMs: receipt.createdAtMs, statusKey: 'returnApplied', needsAction: false,
      route: { pathname: '/track/verleitungen', params: { id: task.parentId } } });
  }
  const sort = (a: SharingItem, b: SharingItem) => b.createdAtMs - a.createdAtMs || a.id.localeCompare(b.id);
  incoming.sort(sort); outgoing.sort(sort);
  return { incoming, outgoing, actionable: incoming.filter(i => i.needsAction).length };
}
export function sharingActionRoute(action: 'transfer' | 'distraction' | 'groups' | 'file', sourceId?: string) {
  const source = sourceId ? { sourceId } : {};
  switch (action) {
    case 'transfer': return { pathname: '/track/transfer', params: { ...source, compose: '1' } };
    case 'distraction': return { pathname: '/track/share', params: { ...source, mode: 'compose' } };
    case 'groups': return { pathname: '/track/group-tasks', params: source };
    case 'file': return { pathname: '/track/share', params: { mode: 'file' } };
  }
}
