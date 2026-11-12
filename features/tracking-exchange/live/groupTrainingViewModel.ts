import type { ReactNode } from 'react';

export const GROUP_SHARE_MINUTES = [15, 30, 60, 120] as const;
export type GroupShareMinutes = typeof GROUP_SHARE_MINUTES[number];
export interface GroupView {
  groupId: string; membershipId: string; title: string; status: 'active' | 'ended';
  canInvite: boolean; canLeave: boolean; canClose: boolean;
}
export interface InvitationView {
  invitationId: string; groupTitle: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  canAccept: boolean;
}
export interface SessionView {
  sessionId: string; groupId: string; title: string; status: 'active' | 'ended';
  expiresLabel: string; canJoin: boolean; canEnd: boolean;
}
export interface ParticipantView {
  sessionId: string; participationId: string; userId: string; displayName: string; dogId: string; dogName: string;
  colorKey: string | null; isSelf: boolean;
}
export interface OwnDogView { dogId: string; dogName: string }
export interface ConnectedInviteTarget { userId: string; displayName: string }
export type LiveShareStatus = 'off' | 'starting' | 'active' | 'paused' | 'revocationPending';
export interface LiveShareView {
  status: LiveShareStatus; recipientNames: readonly string[];
  expiresLabel?: string;
}
/** Already authorized, lease-valid snapshots only. The container removes stale data. */
export interface LivePositionView {
  shareId: string; sessionId: string; userId: string; dogName: string; colorKey: string | null;
  latitude: number; longitude: number; accuracyM: number;
  observedLabel: string;
}
export interface GroupTrainingPanelProps {
  groups: readonly GroupView[]; invitations: readonly InvitationView[];
  selectedGroup: GroupView | null; sessions: readonly SessionView[];
  selectedSession: SessionView | null; participants: readonly ParticipantView[];
  ownDogs: readonly OwnDogView[]; inviteTargets: readonly ConnectedInviteTarget[];
  busy: boolean; error: string | null; liveShare: LiveShareView;
  livePositions: readonly LivePositionView[];
  liveStartAvailable?: boolean;
  /** Actual shared-track UI supplied by the integration owner; no pretend search action. */
  children?: ReactNode;
  onSelectGroup(groupId: string): void;
  onSelectSession(sessionId: string): void;
  onCreate(input: { title: string; displayName: string }): void;
  onInvite(input: { groupId: string; recipientUserId: string }): void;
  onAccept(input: { invitationId: string; displayName: string }): void;
  onLeave(groupId: string): void;
  onClose(groupId: string): void;
  onOpenSession(input: { groupId: string; title: string; dogId: string; durationMinutes: GroupShareMinutes }): void;
  onJoinSession(input: { sessionId: string; dogId: string }): void;
  onEndSession(sessionId: string): void;
  onStartShare(input: { sessionId: string; recipientUserIds: string[]; durationMinutes: GroupShareMinutes }): void;
  onStopShare(): void;
  onRetryRevoke(): void;
}
