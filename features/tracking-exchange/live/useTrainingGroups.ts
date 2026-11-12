import { AppState } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createTrainingGroupService } from '../groups/groupService';
import { GroupApiError, type GroupErrorCode, type createGroupRpcClient } from '../groups/groupRpc';
import type { TrainingGroup, GroupInvitation, GroupSession, GroupSessionSummary } from '../groups/groupModels';
type Client = ReturnType<typeof createGroupRpcClient>;
type Data = { userId: string | null; groups: TrainingGroup[]; invitations: GroupInvitation[];
  sessions: GroupSessionSummary[]; session: GroupSession | null; groupId: string | null; sessionId: string | null;
  busy: boolean; error: GroupErrorCode | null; serverNowMs: number; verifiedAt: number };
const empty = (userId: string | null): Data => ({ userId, groups: [], invitations: [], sessions: [], session: null,
  groupId: null, sessionId: null, busy: false, error: null, serverNowMs: 0, verifiedAt: 0 });
export function useTrainingGroups(userId: string | null, client: Client) {
  const service = useMemo(() => userId ? createTrainingGroupService(client, userId) : null, [client, userId]);
  const [data, setData] = useState<Data>(() => empty(userId));
  const owner = useRef(userId); owner.current = userId;
  const generation = useRef(0), alive = useRef(true), mutationBusy = useRef<symbol | null>(null);
  const reading = useRef<symbol | null>(null);
  const selection = useRef<{ groupId: string | null; sessionId: string | null }>({ groupId: null, sessionId: null });

  const refresh = useCallback(async (quiet = false, afterMutation = false) => {
    if ((mutationBusy.current && !afterMutation) || (quiet && reading.current)) return;
    const read = Symbol('group-refresh'); reading.current = read;
    const requestedAt = performance.now();
    const token = ++generation.current;
    const current = () => alive.current && token === generation.current && owner.current === userId;
    if (!service || !userId) { reading.current = null; setData(empty(userId)); return; }
    if (!quiet) setData(prev => ({ ...prev, busy: true, error: null }));
    try {
      const result = await service.list(); if (!current()) return;
      const groupId = result.groups.some(g => g.groupId === selection.current.groupId)
        ? selection.current.groupId : result.groups.find(g => g.status === 'active')?.groupId ?? null;
      const sessions = groupId ? (await service.sessions(groupId)).sessions : []; if (!current()) return;
      const sessionId = sessions.some(s => s.sessionId === selection.current.sessionId) ? selection.current.sessionId : null;
      let session: GroupSession | null = null;
      if (sessionId) {
        try { session = (await service.session(sessionId)).session; }
        catch (error) {
          // A listed session may be selected before the user explicitly joins it.
          if (!(error instanceof GroupApiError) || error.code !== 'GROUP_UNAVAILABLE') throw error;
        }
      }
      if (!current()) return;
      selection.current = { groupId, sessionId };
      setData({ userId, ...result, sessions, session, groupId, sessionId, busy: false, error: null, verifiedAt: requestedAt });
    } catch (error) {
      if (current()) setData({ ...empty(userId), error: error instanceof GroupApiError ? error.code : 'GROUP_CONNECTION' });
    } finally { if (reading.current === read) reading.current = null; }
  }, [service, userId]);
  useEffect(() => {
    alive.current = true; mutationBusy.current = null;
    selection.current = { groupId: null, sessionId: null };
    void refresh();
    const invalidate = () => { alive.current = false; generation.current++; };
    return invalidate;
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(true); }, 5000);
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active') void refresh(true);
      else { generation.current++; setData(empty(userId)); }
    });
    return () => { clearInterval(timer); listener.remove(); };
  }, [refresh, userId]);
  const chooseGroup = useCallback((groupId: string) => {
    if (mutationBusy.current) return;
    selection.current = { groupId, sessionId: null };
    setData(prev => ({ ...prev, groupId, sessionId: null, sessions: [], session: null }));
    void refresh();
  }, [refresh]);
  const chooseSession = useCallback((sessionId: string) => {
    if (mutationBusy.current) return;
    selection.current.sessionId = sessionId;
    setData(prev => ({ ...prev, sessionId, session: null }));
    void refresh();
  }, [refresh]);
  const act = useCallback(async (operation: (s: NonNullable<typeof service>) => Promise<Record<string, unknown>>,
    select?: (result: Record<string, unknown>) => { groupId?: string; sessionId?: string }) => {
    if (!service || mutationBusy.current) return false;
    const mutation = Symbol('group-operation'); mutationBusy.current = mutation;
    const token = ++generation.current;
    setData(prev => ({ ...prev, busy: true, error: null }));
    try {
      const result = await operation(service);
      if (!alive.current || owner.current !== userId || token !== generation.current) return false;
      if (select) selection.current = { ...selection.current, ...select(result) };
      await refresh(false, true); return true;
    } catch (error) {
      if (alive.current && owner.current === userId && token === generation.current) setData(prev => ({ ...prev,
        busy: false, error: error instanceof GroupApiError ? error.code : 'GROUP_CONNECTION' }));
      return false;
    } finally { if (mutationBusy.current === mutation) mutationBusy.current = null; }
  }, [refresh, service, userId]);
  return { data: data.userId === userId ? data : empty(userId), refresh, chooseGroup, chooseSession, act };
}
