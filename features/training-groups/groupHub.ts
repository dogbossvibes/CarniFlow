import { useMemo } from 'react';
import type { TranslationKey } from '@/i18n';
import { useSession } from '@/hooks/useSession';
import { useGroupLiveShare } from '@/features/tracking-exchange/live/LiveShareProvider';
import { createTrainingGroupService } from '@/features/tracking-exchange/groups/groupService';
import { createGroupJoinService } from '@/features/tracking-exchange/groups/joinService';
import { createGroupTrackService } from '@/features/tracking-exchange/groups/trackService';
import { GroupApiError, type GroupErrorCode } from '@/features/tracking-exchange/groups/groupRpc';
import type { TrainingGroup } from '@/features/tracking-exchange/groups/groupModels';

/** Dienste für das angemeldete Konto. Nutzt den kontogebundenen Client aus LiveShareProvider. */
export function useGroupServices() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { client } = useGroupLiveShare();
  return useMemo(() => ({
    userId,
    groups: userId ? createTrainingGroupService(client, userId) : null,
    join: userId ? createGroupJoinService(client, userId) : null,
    tracks: userId ? createGroupTrackService(client, userId) : null,
  }), [client, userId]);
}

export function groupErrorCode(error: unknown): GroupErrorCode {
  return error instanceof GroupApiError ? error.code : 'GROUP_CONNECTION';
}

export function groupErrorText(code: GroupErrorCode | null): TranslationKey | null {
  if (!code) return null;
  if (code === 'TRACKING_ACTIVE_REQUIRED') return 'groups.errActive';
  if (code === 'GROUP_LIMIT') return 'groups.errLimit';
  if (code === 'GROUP_CONNECTION' || code === 'GROUP_INVALID_RESPONSE' || code === 'GROUP_MAINTENANCE_UNAVAILABLE') return 'groups.errConnection';
  if (code === 'GROUP_CONFLICT' || code === 'GROUP_INVALID_REQUEST' || code === 'GROUP_EXPIRED' || code === 'GROUP_REVOKED') return 'groups.errConflict';
  if (code === 'GROUP_ACCOUNT_CHANGED') return 'groups.errAccount';
  return 'groups.errUnavailable';
}

export type GroupRoleLabel = 'owner' | 'organizer' | 'member';
export function memberRole(group: TrainingGroup, userId: string): GroupRoleLabel {
  if (group.ownerUserId === userId) return 'owner';
  return group.members.find(m => m.userId === userId)?.isOrganizer ? 'organizer' : 'member';
}
export const ROLE_TEXT: Record<GroupRoleLabel, TranslationKey> = {
  owner: 'groups.roleOwner', organizer: 'groups.roleOrganizer', member: 'groups.roleMember',
};

/** Gruppentraining bis Mitternacht (lokale Zeit), mindestens 2 Stunden, höchstens 24 Stunden. */
export function secondsUntilMidnight(now: Date = new Date()): number {
  const midnight = new Date(now); midnight.setHours(23, 59, 0, 0);
  const seconds = Math.round((midnight.getTime() - now.getTime()) / 1000);
  return Math.min(86400, Math.max(7200, seconds));
}
