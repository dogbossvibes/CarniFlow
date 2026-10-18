import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { exchangeRepository, type ExchangeSummary } from '@/features/tracking-exchange/repository';
import { createTransferUiContext } from '@/features/tracking-transfer/uiContext';
import type { TransferOffer } from '@/features/tracking-transfer/service';
import { listConnectedInviteTargets } from '@/features/training-groups/connectedInviteTargets';
import { projectSharing } from './model';
export interface SharingData {
  local?: { rows: ExchangeSummary[]; limited: boolean };
  transfers?: { incoming: TransferOffer[]; outgoing: TransferOffer[]; serverNowMs: number; monotonic: number };
  contacts?: { userId: string; displayName: string | null }[];
}
export function useSharingInbox(userId: string | null) {
  const [context] = useState(() => createTransferUiContext(userId));
  const [data, setData] = useState<SharingData>({}), previous = useRef<SharingData>({});
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [monotonic, setMonotonic] = useState(performance.now());
  const contactsRequest = useRef<AbortController | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0), alive = useRef(true), focused = useRef(false);
  const epoch = useRef(context.client.epoch()).current;
  const check = useCallback((turn: number) => alive.current && focused.current && turn === generation.current && context.client.epoch() === epoch, [context, epoch]);
  const refresh = useCallback(async () => {
    const turn = ++generation.current;
    if (!userId || !context.service) { setLoading(false); return; }
    if (!check(turn)) return;
    setLoading(true); setFailed(false);
    contactsRequest.current?.abort();
    const controller = new AbortController(); contactsRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    const repo = exchangeRepository(userId, () => ({ userId, epoch: context.client.epoch() }));
    const results = await Promise.allSettled([repo.summaries(), context.service.list().then(value => ({ ...value, monotonic: performance.now() })), listConnectedInviteTargets(userId, true, controller.signal)]);
    clearTimeout(timeout);
    if (contactsRequest.current === controller) contactsRequest.current = null;
    if (!check(turn)) return;
    const [local, transfers, contacts] = results;
    const next: SharingData = { ...previous.current };
    if (local.status === 'fulfilled') next.local = local.value;
    if (transfers.status === 'fulfilled') next.transfers = transfers.value;
    if (contacts.status === 'fulfilled') next.contacts = contacts.value;
    previous.current = next; setData(next); setFailed(results.some(r => r.status === 'rejected')); setLoading(false); setMonotonic(performance.now());
  }, [userId, context, check]);
  useEffect(() => { const generationBox = generation, requestBox = contactsRequest; alive.current = true; return () => { alive.current = false; generationBox.current++; requestBox.current?.abort(); context.client.dispose(); }; }, [context]);
  useFocusEffect(useCallback(() => {
    focused.current = true; void refresh();
    return () => { focused.current = false; generation.current++; contactsRequest.current?.abort(); if (expiryTimer.current) clearTimeout(expiryTimer.current); };
  }, [refresh]));
  useEffect(() => { const listener = AppState.addEventListener('change', state => {
    if (state !== 'active') { generation.current++; contactsRequest.current?.abort(); setLoading(true); }
    else if (focused.current) void refresh();
  }); return () => listener.remove(); }, [refresh]);
  useEffect(() => {
    const timerBox = expiryTimer;
    if (timerBox.current) clearTimeout(timerBox.current);
    if (loading || !focused.current || !data.transfers || AppState.currentState !== 'active') return;
    const now = data.transfers.serverNowMs + Math.max(0, performance.now() - data.transfers.monotonic);
    const pending = [...data.transfers.incoming, ...data.transfers.outgoing].filter(o => o.status === 'pending' && o.expiresAtMs > now);
    if (!pending.length) return;
    const deadline = Math.min(...pending.map(o => o.expiresAtMs));
    timerBox.current = setTimeout(() => {
      if (alive.current && focused.current && AppState.currentState === 'active') setMonotonic(performance.now());
    }, Math.min(2147483000, Math.max(1, deadline - now + 1)));
    return () => { if (timerBox.current) clearTimeout(timerBox.current); };
  }, [data.transfers, monotonic, loading]);
  const serverNowMs = data.transfers ? data.transfers.serverNowMs + Math.max(0, monotonic - data.transfers.monotonic) : 0;
  const projection = projectSharing(data.local?.rows ?? [], data.transfers ?? { incoming: [], outgoing: [] }, serverNowMs);
  const complete = !!userId && !loading && !failed && !!data.local && !!data.transfers && !!data.contacts;
  const limited = !!data.local?.limited || data.transfers?.incoming.length === 500 || data.transfers?.outgoing.length === 500;
  return { ...projection, contacts: data.contacts ?? [], loading, failed, complete, limited, refresh, epoch: context.client.epoch, userId };
}
